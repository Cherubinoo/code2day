"""
judge0.py — Code Execution Service
====================================
Submits source code directly to a self-hosted Judge0 instance running on Amazon EC2
and returns a normalised result payload through one synchronous HTTP request.
"""

import http.client
import json
import logging
import socket
import time
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class Judge0Error(Exception):
    pass


class Judge0TimeoutError(Judge0Error):
    pass


class Judge0ServiceError(Judge0Error):
    pass


# ---------------------------------------------------------------------------
# Response normalisation
# ---------------------------------------------------------------------------

def _build_output_payload(payload: dict) -> dict:
    stdout = payload.get("stdout") or ""
    stderr = payload.get("stderr") or ""
    compile_output = payload.get("compile_output") or ""

    status_value = payload.get("status") or {}
    if isinstance(status_value, dict):
        status_description = status_value.get("description") or "Unknown"
    else:
        status_description = str(status_value) if status_value else "Unknown"

    output = stdout or stderr or compile_output or "Execution finished with no output."

    return {
        "stdout": stdout,
        "stderr": stderr,
        "compile_output": compile_output,
        "status": status_description,
        "time": payload.get("time") or "",
        "memory": payload.get("memory") or "",
        "token": payload.get("token") or "",
        "output": output,
    }


# ---------------------------------------------------------------------------
# Core execution function — direct synchronous call to EC2
# ---------------------------------------------------------------------------

def execute_judge0_submission(source_code: str, language_id: int, stdin: str = "") -> dict:
    """
    Submit code directly to Judge0 EC2 and return a normalised result dict.
    There is no app-level queue or worker in this Django service.
    """
    timeout_seconds = getattr(settings, "JUDGE0_TIMEOUT_SECONDS", 300)
    deadline = time.monotonic() + timeout_seconds

    logger.debug("Judge0 submission started (language_id=%d)", language_id)
    return _call_judge0(source_code, language_id, stdin, deadline)


def _call_judge0(
    source_code: str,
    language_id: int,
    stdin: str,
    deadline: float,
) -> dict:
    """
    Make the actual HTTP request to the Judge0 EC2 instance.
    """
    target_url = (
        f"{settings.JUDGE0_BASE_URL.rstrip('/')}/submissions?wait=true"
    )
    request_payload = {
        "source_code": source_code,
        "language_id": language_id,
        "stdin": stdin or "",
        "wait_timeout": 300000,  # Wait inside this single HTTP request
    }
    request_data = json.dumps(request_payload).encode("utf-8")
    request_obj = urllib_request.Request(
        target_url,
        data=request_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    http_timeout = max(deadline - time.monotonic(), 1)
    logger.debug("Judge0 request target=%s timeout=%.2fs", target_url, http_timeout)

    try:
        with urllib_request.urlopen(request_obj, timeout=http_timeout) as response:
            raw_body = response.read().decode("utf-8")
    except http.client.RemoteDisconnected as exc:
        raise Judge0ServiceError(
            "Judge0 EC2 instance crashed or is not responding."
        ) from exc
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise Judge0ServiceError(
            f"Judge0 returned HTTP {exc.code}. {error_body}".strip()
        ) from exc
    except urllib_error.URLError as exc:
        if isinstance(exc.reason, socket.timeout):
            raise Judge0TimeoutError("Judge0 execution timed out.") from exc
        raise Judge0ServiceError(
            "Judge0 EC2 instance is unreachable. Check that the service is running."
        ) from exc
    except TimeoutError as exc:
        raise Judge0TimeoutError("Judge0 execution timed out.") from exc

    try:
        parsed_body = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise Judge0ServiceError(
            "Judge0 returned an invalid (non-JSON) response."
        ) from exc

    return _build_output_payload(parsed_body)
