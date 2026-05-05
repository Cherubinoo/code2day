"""
Code2Day Executor Client
Handles code execution with proper error handling, retries, and logging.
"""

import http.client
import json
import logging
import socket
import time
from base64 import b64encode, b64decode
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings

logger = logging.getLogger(__name__)


class ExecutorError(Exception):
    """Base exception for executor errors."""
    pass


class ExecutorTimeoutError(ExecutorError):
    """Raised when code execution times out."""
    pass


class ExecutorServiceError(ExecutorError):
    """Raised when executor service returns an error."""
    pass


class ExecutorRateLimitError(ExecutorError):
    """Raised when rate limit is exceeded."""
    pass


def encode_base64(text: str) -> str:
    if not text:
        return ""
    return b64encode(text.encode('utf-8')).decode('utf-8')


def decode_base64(text: str) -> str:
    if not text:
        return ""
    try:
        return b64decode(text.encode('utf-8')).decode('utf-8', errors='replace')
    except Exception:
        return text


def build_output_payload(payload: dict, base64_encoded: bool = True) -> dict:
    """Build standardized output payload from executor response."""
    if base64_encoded:
        stdout = decode_base64(payload.get("stdout") or "")
        stderr = decode_base64(payload.get("stderr") or "")
        compile_output = decode_base64(payload.get("compile_output") or "")
        message = decode_base64(payload.get("message") or "")
    else:
        stdout = payload.get("stdout") or ""
        stderr = payload.get("stderr") or ""
        compile_output = payload.get("compile_output") or ""
        message = payload.get("message") or ""

    status_value = payload.get("status") or {}
    if isinstance(status_value, dict):
        status_id = status_value.get("id", 0)
        status_description = status_value.get("description") or "Unknown"
    else:
        status_id = 0
        status_description = str(status_value) if status_value else "Unknown"

    if stdout.strip():
        output = stdout
    elif stderr.strip():
        output = f"Error: {stderr}"
    elif compile_output.strip():
        output = f"Compilation Error: {compile_output}"
    elif message.strip():
        output = message
    else:
        output = "Execution finished with no output."

    return {
        "stdout": stdout,
        "stderr": stderr,
        "compile_output": compile_output,
        "message": message,
        "status": status_description,
        "status_id": status_id,
        "time": payload.get("time") or "",
        "memory": payload.get("memory") or "",
        "token": payload.get("token") or "",
        "output": output.strip(),
    }


def execute_submission(
    source_code,
    language_id,
    stdin="",
    timeout=None,
    max_retries=3,
    retry_delay=1.0,
):
    """
    Execute code via the Code2Day executor with retry logic and error handling.

    Args:
        source_code: The code to execute
        language_id: Language ID (71=Python, 63=JS, 62=Java, 50=C, 54=C++)
        stdin: Input to pass to the program
        timeout: Execution timeout in seconds
        max_retries: Number of retries on transient failures
        retry_delay: Delay between retries in seconds

    Returns:
        dict: Execution results with stdout, stderr, status, etc.

    Raises:
        ExecutorTimeoutError: When execution times out
        ExecutorServiceError: When executor returns an error
        ExecutorRateLimitError: When rate limit is exceeded
    """
    if not source_code or not source_code.strip():
        raise ExecutorServiceError("Source code cannot be empty")

    if not language_id or language_id < 1:
        raise ExecutorServiceError(f"Invalid language_id: {language_id}")

    request_payload = {
        "source_code": encode_base64(source_code),
        "language_id": language_id,
        "stdin": encode_base64(stdin or ""),
        "base64_encoded": True,
    }

    base_url = settings.EXECUTOR_BASE_URL.rstrip('/')
    target_url = f"{base_url}/submissions?wait=true&base64_encoded=true"
    timeout_seconds = timeout or getattr(settings, 'EXECUTOR_TIMEOUT_SECONDS', 30)
    request_data = json.dumps(request_payload).encode('utf-8')

    last_exception = None

    for attempt in range(max_retries):
        try:
            logger.debug(
                "Executor request attempt %d/%d: lang_id=%d, stdin_len=%d, code_len=%d",
                attempt + 1, max_retries, language_id, len(stdin or ""), len(source_code)
            )

            request_obj = urllib_request.Request(
                target_url,
                data=request_data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )

            with urllib_request.urlopen(request_obj, timeout=timeout_seconds) as response:
                raw_body = response.read().decode('utf-8')

            try:
                parsed_body = json.loads(raw_body)
            except json.JSONDecodeError as exc:
                raise ExecutorServiceError(
                    f"Executor returned invalid JSON: {raw_body[:200]}"
                ) from exc

            if "error" in parsed_body:
                raise ExecutorServiceError(f"Executor API error: {parsed_body.get('error')}")

            result = build_output_payload(parsed_body, base64_encoded=True)

            logger.info(
                "Execution successful: status=%s, time=%s, memory=%s",
                result["status"], result["time"], result["memory"]
            )

            return result

        except urllib_error.HTTPError as exc:
            error_body = exc.read().decode('utf-8', errors='ignore')
            logger.error("Executor HTTP %d (attempt %d/%d): %s",
                         exc.code, attempt + 1, max_retries, error_body[:500])

            if exc.code == 429:
                raise ExecutorRateLimitError(
                    "Rate limit exceeded. Please wait before submitting again."
                ) from exc
            elif exc.code == 500:
                last_exception = ExecutorServiceError(
                    f"Executor server error (HTTP 500). Response: {error_body[:200]}"
                )
            elif exc.code == 502:
                last_exception = ExecutorServiceError(
                    "Executor service temporarily unavailable (Bad Gateway)."
                )
            elif exc.code == 503:
                last_exception = ExecutorServiceError(
                    "Executor service overloaded (Service Unavailable)."
                )
            else:
                last_exception = ExecutorServiceError(
                    f"Executor returned HTTP {exc.code}. Response: {error_body[:200]}"
                )

            if 400 <= exc.code < 500 and exc.code != 429:
                raise last_exception from exc

        except urllib_error.URLError as exc:
            error_msg = str(exc.reason)
            logger.error("Executor connection error (attempt %d/%d): %s",
                         attempt + 1, max_retries, error_msg)

            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                raise ExecutorTimeoutError(
                    f"Execution timed out after {timeout_seconds}s. "
                    "Your code may have an infinite loop."
                ) from exc

            last_exception = ExecutorServiceError(
                f"Cannot connect to executor at {base_url}. Error: {error_msg}"
            )

        except http.client.RemoteDisconnected as exc:
            logger.error("Executor remote disconnected (attempt %d/%d)", attempt + 1, max_retries)
            last_exception = ExecutorServiceError(
                "Executor service crashed or not responding."
            )

        except socket.timeout as exc:
            raise ExecutorTimeoutError(f"Execution timed out after {timeout_seconds}s") from exc

        except TimeoutError as exc:
            raise ExecutorTimeoutError(f"Execution timed out after {timeout_seconds}s") from exc

        if attempt < max_retries - 1:
            sleep_time = retry_delay * (2 ** attempt)
            logger.warning("Retrying in %.1f seconds...", sleep_time)
            time.sleep(sleep_time)

    if last_exception:
        raise last_exception

    raise ExecutorServiceError("Unexpected error executing code")


def check_executor_health():
    """Check if the executor service is healthy."""
    base_url = settings.EXECUTOR_BASE_URL.rstrip('/')

    try:
        request_obj = urllib_request.Request(
            f"{base_url}/system_info",
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urllib_request.urlopen(request_obj, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))

        return {
            "healthy": True,
            "details": f"Executor is running. Version: {data.get('version', 'unknown')}",
            "data": data,
        }

    except Exception as exc:
        return {
            "healthy": False,
            "details": f"Executor health check failed: {str(exc)}",
            "error": str(exc),
        }


def get_language_id(language_name: str) -> int:
    """Get language ID from language name."""
    language_map = {
        "python": 71,
        "python3": 71,
        "javascript": 63,
        "js": 63,
        "java": 62,
        "c": 50,
        "cpp": 54,
        "c++": 54,
    }

    normalized = language_name.lower().strip()

    if normalized in language_map:
        return language_map[normalized]

    for name, lang_id in language_map.items():
        if name in normalized or normalized in name:
            return lang_id

    raise ExecutorServiceError(
        f"Unsupported language: {language_name}. "
        f"Supported: {', '.join(sorted(set(language_map.keys())))}"
    )


# ── Backward compatibility aliases (will be removed in future) ────────────────
Judge0Error = ExecutorError
Judge0TimeoutError = ExecutorTimeoutError
Judge0ServiceError = ExecutorServiceError
Judge0RateLimitError = ExecutorRateLimitError
execute_judge0_submission = execute_submission
check_judge0_health = check_executor_health
