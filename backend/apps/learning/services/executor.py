"""Judge0-backed execution adapter for Code2Day."""

import json
import logging
from urllib import request as urllib_request

from django.conf import settings

from .judge0 import (
    Judge0Error,
    Judge0RateLimitError,
    Judge0ServiceError,
    Judge0TimeoutError,
    build_output_payload,
    decode_base64,
    encode_base64,
    execute_judge0_submission,
)

logger = logging.getLogger(__name__)

ExecutorError = Judge0Error
ExecutorTimeoutError = Judge0TimeoutError
ExecutorServiceError = Judge0ServiceError
ExecutorRateLimitError = Judge0RateLimitError


def execute_submission(
    source_code,
    language_id,
    stdin="",
    timeout=None,
    max_retries=3,
    retry_delay=1.0,
):
    """Execute code through Judge0 using the same interface as the old executor module."""
    return execute_judge0_submission(
        source_code=source_code,
        language_id=language_id,
        stdin=stdin,
        timeout=timeout,
        max_retries=max_retries,
        retry_delay=retry_delay,
    )


def check_executor_health():
    """Check Judge0 health and return runtime information if available."""
    base_url = settings.JUDGE0_BASE_URL.rstrip("/")
    url = f"{base_url}/health"
    try:
        req = urllib_request.Request(url, headers={"Accept": "application/json"}, method="GET")
        with urllib_request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return {
            "healthy": True,
            "details": "Judge0 is responding.",
            "data": payload,
        }
    except Exception as exc:
        return {
            "healthy": False,
            "details": f"Judge0 health check failed: {exc}",
            "error": str(exc),
        }


def list_executor_packages():
    """Return available Judge0 languages for debugging."""
    base_url = settings.JUDGE0_BASE_URL.rstrip("/")
    url = f"{base_url}/languages"
    try:
        req = urllib_request.Request(url, headers={"Accept": "application/json"}, method="GET")
        with urllib_request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "packages": json.loads(resp.read().decode("utf-8"))}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def get_language_id(language_name: str) -> int:
    """Get numeric language ID from a language name string."""
    lang_map = {
        "python": 71,
        "python3": 71,

        "java": 62,
        "c": 50,
        "cpp": 54, "c++": 54,
    }
    normalized = language_name.lower().strip()
    if normalized in lang_map:
        return lang_map[normalized]
    for name, lid in lang_map.items():
        if name in normalized or normalized in name:
            return lid
    raise ExecutorServiceError(
        f"Unsupported language: {language_name}. "
        f"Supported: {', '.join(sorted(set(lang_map)))}"
    )


# ── Backward compatibility aliases ────────────────────────────────────────────
Judge0Error = ExecutorError
Judge0TimeoutError = ExecutorTimeoutError
Judge0ServiceError = ExecutorServiceError
Judge0RateLimitError = ExecutorRateLimitError
execute_judge0_submission = execute_submission
check_judge0_health = check_executor_health
