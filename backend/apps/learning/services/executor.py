"""
Code2Day Executor Client
Calls the Piston API (https://github.com/engineer-man/piston) for sandboxed code execution.
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


class ExecutorError(Exception):
    pass


class ExecutorTimeoutError(ExecutorError):
    pass


class ExecutorServiceError(ExecutorError):
    pass


class ExecutorRateLimitError(ExecutorError):
    pass


# Judge0-style numeric IDs → (Piston language name, version selector)
# version "*" picks the latest installed version
_LANG_ID_TO_PISTON: dict = {
    71: ("python", "*"),
    62: ("java",   "*"),
    50: ("c",      "*"),
    54: ("c++",    "*"),
}


def _piston_url(path: str) -> str:
    base = settings.EXECUTOR_BASE_URL.rstrip("/")
    return f"{base}/api/v2/{path.lstrip('/')}"


def _http_post(url: str, payload: dict, timeout: int) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _normalize_result(piston_resp: dict) -> dict:
    """Translate a Piston response into the Code2Day standard result dict."""
    run     = piston_resp.get("run")     or {}
    compile_stage = piston_resp.get("compile") or {}

    run_code      = run.get("code")
    run_status    = run.get("status")          # "TO", "RE", "SG", "OL", "EL", "XX", or null
    compile_code  = compile_stage.get("code") if compile_stage else None

    # Map to Judge0-style status IDs used internally
    if compile_stage and compile_code is not None and compile_code != 0:
        status_id, status_desc = 6, "Compilation Error"
    elif run_code == 0:
        status_id, status_desc = 3, "Accepted"
    elif run_status == "TO":
        status_id, status_desc = 5, "Time Limit Exceeded"
    else:
        status_id, status_desc = 11, "Runtime Error (NZEC)"

    stdout  = run.get("stdout")  or ""
    stderr  = run.get("stderr")  or ""
    message = run.get("message") or ""
    compile_output = (
        (compile_stage.get("stderr") or compile_stage.get("stdout") or "")
        if compile_stage else ""
    )

    if stdout.strip():
        output = stdout
    elif compile_output.strip():
        output = f"Compilation Error:\n{compile_output}"
    elif stderr.strip():
        output = f"Error:\n{stderr}"
    elif message.strip():
        output = message
    else:
        output = "Execution finished with no output."

    wall_time = run.get("wall_time")
    memory    = run.get("memory")

    return {
        "stdout":         stdout,
        "stderr":         stderr,
        "compile_output": compile_output,
        "message":        message,
        "status":         status_desc,
        "status_id":      status_id,
        "time":           f"{wall_time / 1000:.3f}" if wall_time is not None else "",
        "memory":         str(memory) if memory is not None else "",
        "token":          "",
        "output":         output.strip(),
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
    Execute code via Piston.

    Args:
        source_code : The source code to run
        language_id : Judge0-style language ID (71=Python, 63=JS, 62=Java, 50=C, 54=C++)
        stdin       : Text to feed to the program via stdin
        timeout     : Wall-clock timeout in seconds (default from settings)
        max_retries : Retry attempts on transient failures
        retry_delay : Base delay between retries in seconds (exponential backoff)

    Returns:
        dict: stdout, stderr, compile_output, status, status_id, time, memory, output
    """
    if not source_code or not source_code.strip():
        raise ExecutorServiceError("Source code cannot be empty")

    if language_id not in _LANG_ID_TO_PISTON:
        raise ExecutorServiceError(
            f"Unsupported language_id: {language_id}. "
            f"Supported IDs: {sorted(_LANG_ID_TO_PISTON)}"
        )

    piston_lang, piston_ver = _LANG_ID_TO_PISTON[language_id]
    timeout_s = timeout or getattr(settings, "EXECUTOR_TIMEOUT_SECONDS", 30)

    # Do not send run_timeout / compile_timeout — let Piston use its configured
    # PISTON_RUN_TIMEOUT / PISTON_COMPILE_TIMEOUT defaults (set in docker-compose).
    # Sending values that exceed those limits causes a 400 rejection.
    payload = {
        "language": piston_lang,
        "version":  piston_ver,
        "files":    [{"content": source_code}],
        "stdin":    stdin or "",
    }

    url      = _piston_url("execute")
    http_timeout = int(timeout_s) + 10
    last_exc = None

    for attempt in range(max_retries):
        try:
            logger.debug(
                "Piston request attempt %d/%d: lang=%s, stdin_len=%d, code_len=%d",
                attempt + 1, max_retries, piston_lang,
                len(stdin or ""), len(source_code),
            )

            raw    = _http_post(url, payload, timeout=http_timeout)
            result = _normalize_result(raw)

            logger.info(
                "Execution done: status=%s, time=%s, memory=%s",
                result["status"], result["time"], result["memory"],
            )
            return result

        except urllib_error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            logger.error(
                "Piston HTTP %d (attempt %d/%d): %s",
                exc.code, attempt + 1, max_retries, body[:500],
            )
            if exc.code == 429:
                raise ExecutorRateLimitError("Rate limit exceeded.") from exc
            if exc.code == 400:
                raise ExecutorServiceError(f"Piston rejected request (400): {body[:300]}") from exc
            last_exc = ExecutorServiceError(f"Piston HTTP {exc.code}: {body[:200]}")
            if 400 <= exc.code < 500:
                raise last_exc from exc

        except urllib_error.URLError as exc:
            logger.error(
                "Piston connection error (attempt %d/%d): %s",
                attempt + 1, max_retries, exc.reason,
            )
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                raise ExecutorTimeoutError(
                    f"Execution timed out after {timeout_s}s."
                ) from exc
            last_exc = ExecutorServiceError(
                f"Cannot connect to Piston at {url}: {exc.reason}"
            )

        except http.client.RemoteDisconnected as exc:
            logger.error("Piston disconnected (attempt %d/%d)", attempt + 1, max_retries)
            last_exc = ExecutorServiceError("Piston service crashed or not responding.")

        except (socket.timeout, TimeoutError) as exc:
            raise ExecutorTimeoutError(f"Execution timed out after {timeout_s}s.") from exc

        if attempt < max_retries - 1:
            sleep_time = retry_delay * (2 ** attempt)
            logger.warning("Retrying in %.1f seconds…", sleep_time)
            time.sleep(sleep_time)

    raise last_exc or ExecutorServiceError("Unexpected error executing code")


def check_executor_health():
    """Check if Piston is healthy and return installed runtimes."""
    url = _piston_url("runtimes")
    try:
        req = urllib_request.Request(url, headers={"Accept": "application/json"}, method="GET")
        with urllib_request.urlopen(req, timeout=10) as resp:
            runtimes = json.loads(resp.read().decode("utf-8"))
        installed = [f"{r['language']}@{r['version']}" for r in runtimes]
        return {
            "healthy": True,
            "details": f"Piston running. Installed: {', '.join(installed) or 'none'}",
            "data": {"runtimes": runtimes},
        }
    except Exception as exc:
        return {
            "healthy": False,
            "details": f"Piston health check failed: {exc}",
            "error": str(exc),
        }


def get_language_id(language_name: str) -> int:
    """Get numeric language ID from a language name string."""
    lang_map = {
        "python": 71, "python3": 71,
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
