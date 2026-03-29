"""
auth_utils.py
=============
Shared authentication helpers for the learning app.

  - StudentAuthMixin  : DRY guard that replaces the repeated
                        `is_authenticated + hasattr(student_profile)` pattern
                        that used to appear in every APIView.

  - InMemoryRateLimiter : Thread-safe sliding-window rate limiter backed
                          by a plain Python dict. No Redis or Celery needed.
                          Resets on server restart (acceptable for single-process
                          gunicorn / runserver deployments on EC2).

  - RateLimitExceeded   : Exception raised when a client exceeds the limit.
                          Caught in views and converted to HTTP 429.
"""

import threading
import time

from rest_framework import status
from rest_framework.response import Response


# ---------------------------------------------------------------------------
# Auth mixin
# ---------------------------------------------------------------------------

class StudentAuthMixin:
    """
    Mixin for DRF APIViews.

    Usage::

        class MyView(StudentAuthMixin, APIView):
            def get(self, request):
                profile, error = self.get_authenticated_profile(request)
                if error:
                    return error
                # profile is a StudentProfile instance here
    """

    def get_authenticated_profile(self, request):
        """
        Returns (StudentProfile, None) when the request carries a valid
        authenticated student session, or (None, Response) with HTTP 401
        when it does not.
        """
        if not request.user.is_authenticated or not hasattr(
            request.user, "student_profile"
        ):
            return None, Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return request.user.student_profile, None


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

class RateLimitExceeded(Exception):
    """Raised when a client exceeds the allowed request rate."""

    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(
            f"Rate limit exceeded. Retry after {retry_after_seconds}s."
        )


class InMemoryRateLimiter:
    """
    Thread-safe sliding-window rate limiter.

    Each unique ``key`` (typically ``"<endpoint>:<client_ip>"``) gets its
    own independent counter. Attempts older than ``window_seconds`` are
    pruned automatically on each check — no background task needed.

    Example::

        limiter = InMemoryRateLimiter()

        # in a view:
        try:
            limiter.check(key="login:192.168.1.1", max_attempts=5, window_seconds=60)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )
    """

    def __init__(self):
        # { key: [timestamp, timestamp, ...] }
        self._store: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, max_attempts: int, window_seconds: int) -> None:
        """
        Record one attempt for *key* and raise :class:`RateLimitExceeded`
        if the sliding window contains more than *max_attempts* entries.
        """
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            timestamps = self._store.get(key, [])

            # Prune expired entries
            timestamps = [t for t in timestamps if t > cutoff]

            if len(timestamps) >= max_attempts:
                # Time until the oldest entry falls out of the window
                retry_after = int(window_seconds - (now - timestamps[0])) + 1
                raise RateLimitExceeded(retry_after_seconds=max(retry_after, 1))

            timestamps.append(now)
            self._store[key] = timestamps

    def get_client_ip(self, request) -> str:
        """
        Extracts the real client IP, honouring X-Forwarded-For set by an
        EC2 load balancer or reverse proxy.
        """
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded_for:
            # X-Forwarded-For can be a comma-separated list; take the first
            return forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")

    def make_key(self, request, endpoint_name: str) -> str:
        """Builds a rate-limit key from the client IP and the endpoint name."""
        return f"{endpoint_name}:{self.get_client_ip(request)}"


# Module-level singleton — shared across all views in the same process
_rate_limiter = InMemoryRateLimiter()


def check_rate_limit(request, endpoint_name: str, max_attempts: int, window_seconds: int) -> None:
    """
    Convenience wrapper around the module-level limiter.

    Raises :class:`RateLimitExceeded` when the client exceeds the limit.
    Call this at the top of any view handler that needs protection.
    """
    key = _rate_limiter.make_key(request, endpoint_name)
    _rate_limiter.check(key, max_attempts=max_attempts, window_seconds=window_seconds)
