"""
Judge0 API Client - Fixed for AWS EC2 deployment
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


class Judge0Error(Exception):
    """Base exception for Judge0 errors."""
    pass


class Judge0TimeoutError(Judge0Error):
    """Raised when code execution times out."""
    pass


class Judge0ServiceError(Judge0Error):
    """Raised when Judge0 service returns an error."""
    pass


class Judge0RateLimitError(Judge0Error):
    """Raised when rate limit is exceeded."""
    pass


def encode_base64(text: str) -> str:
    """Encode text to base64 for Judge0 API."""
    if not text:
        return ""
    return b64encode(text.encode('utf-8')).decode('utf-8')


def decode_base64(text: str) -> str:
    """Decode base64 text from Judge0 API."""
    if not text:
        return ""
    try:
        return b64decode(text.encode('utf-8')).decode('utf-8', errors='replace')
    except Exception:
        return text


def build_output_payload(payload: dict, base64_encoded: bool = True) -> dict:
    """
    Build standardized output payload from Judge0 response.
    
    Args:
        payload: Raw Judge0 API response
        base64_encoded: Whether responses are base64 encoded
        
    Returns:
        Standardized output dictionary
    """
    # Decode base64 fields if needed
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
    
    # Handle status which might be a dict with 'description' key or just a string
    status_value = payload.get("status") or {}
    if isinstance(status_value, dict):
        status_id = status_value.get("id", 0)
        status_description = status_value.get("description") or "Unknown"
    else:
        status_id = 0
        status_description = str(status_value) if status_value else "Unknown"
    
    # Build human-readable output
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


def execute_judge0_submission(
    source_code,
    language_id,
    stdin="",
    timeout=None,
    max_retries=3,
    retry_delay=1.0,
):
    """
    Execute code via Judge0 API with retry logic and proper error handling.
    
    Args:
        source_code: The code to execute
        language_id: Judge0 language ID (e.g., 71 for Python)
        stdin: Input to pass to the program (must be valid JSON for wrapped solutions)
        timeout: Execution timeout in seconds (defaults to settings.JUDGE0_TIMEOUT_SECONDS)
        max_retries: Number of retries on transient failures
        retry_delay: Delay between retries in seconds
        
    Returns:
        dict: Execution results with stdout, stderr, status, etc.
        
    Raises:
        Judge0TimeoutError: When execution times out
        Judge0ServiceError: When Judge0 returns an error
        Judge0RateLimitError: When rate limit is exceeded
    """
    # Validate inputs
    if not source_code or not source_code.strip():
        raise Judge0ServiceError("Source code cannot be empty")
    
    if not language_id or language_id < 1:
        raise Judge0ServiceError(f"Invalid language_id: {language_id}")
    
    # Use base64 encoding to handle special characters properly
    request_payload = {
        "source_code": encode_base64(source_code),
        "language_id": language_id,
        "stdin": encode_base64(stdin or ""),
        "base64_encoded": True,
    }
    
    # Build request URL with base64 encoding
    base_url = settings.JUDGE0_BASE_URL.rstrip('/')
    target_url = f"{base_url}/submissions?wait=true&base64_encoded=true"
    
    timeout_seconds = timeout or getattr(settings, 'JUDGE0_TIMEOUT_SECONDS', 300)
    
    # Prepare request data
    request_data = json.dumps(request_payload).encode('utf-8')
    
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            logger.debug(
                "Judge0 request attempt %d/%d: lang_id=%d, stdin_len=%d, code_len=%d",
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
            
            with urllib_request.urlopen(
                request_obj,
                timeout=timeout_seconds,
            ) as response:
                raw_body = response.read().decode('utf-8')
                
            # Parse response
            try:
                parsed_body = json.loads(raw_body)
            except json.JSONDecodeError as exc:
                raise Judge0ServiceError(
                    f"Judge0 returned invalid JSON response: {raw_body[:200]}"
                ) from exc
            
            # Check for API-level errors in response
            if "error" in parsed_body:
                error_msg = parsed_body.get("error", "Unknown error")
                raise Judge0ServiceError(f"Judge0 API error: {error_msg}")
            
            # Build and return output payload
            result = build_output_payload(parsed_body, base64_encoded=True)
            
            logger.info(
                "Judge0 execution successful: status=%s, time=%s, memory=%s",
                result["status"], result["time"], result["memory"]
            )
            
            return result
            
        except urllib_error.HTTPError as exc:
            error_body = exc.read().decode('utf-8', errors='ignore')
            logger.error(
                "Judge0 HTTP %d error (attempt %d/%d): %s",
                exc.code, attempt + 1, max_retries, error_body[:500]
            )
            
            # Handle specific HTTP error codes
            if exc.code == 429:
                raise Judge0RateLimitError(
                    "Judge0 rate limit exceeded. Please wait before submitting again."
                ) from exc
            elif exc.code == 500:
                last_exception = Judge0ServiceError(
                    f"Judge0 server error (HTTP 500) at {base_url}. "
                    f"For hardware installations, check: 1) Judge0 API service running, "
                    f"2) Redis server running, 3) Database migrations applied, "
                    f"4) Language workers configured. Response: {error_body[:200]}"
                )
            elif exc.code == 502:
                last_exception = Judge0ServiceError(
                    "Judge0 service is temporarily unavailable (Bad Gateway). "
                    "Workers may be restarting or overloaded."
                )
            elif exc.code == 503:
                last_exception = Judge0ServiceError(
                    "Judge0 service is overloaded (Service Unavailable). "
                    "Too many concurrent requests."
                )
            else:
                last_exception = Judge0ServiceError(
                    f"Judge0 returned HTTP {exc.code}. Response: {error_body[:200]}"
                )
                
            # Don't retry on client errors (4xx)
            if 400 <= exc.code < 500 and exc.code != 429:
                raise last_exception from exc
                
        except urllib_error.URLError as exc:
            error_msg = str(exc.reason)
            logger.error(
                "Judge0 connection error (attempt %d/%d): %s",
                attempt + 1, max_retries, error_msg
            )
            
            if isinstance(exc.reason, socket.timeout) or isinstance(exc.reason, TimeoutError):
                raise Judge0TimeoutError(
                    f"Judge0 execution timed out after {timeout_seconds}s. "
                    f"Your code may have an infinite loop or the problem is too complex."
                ) from exc
                
            last_exception = Judge0ServiceError(
                f"Cannot connect to Judge0 service at {base_url}. "
                f"Error: {error_msg}"
            )
            
        except http.client.RemoteDisconnected as exc:
            logger.error(
                "Judge0 remote disconnected (attempt %d/%d)",
                attempt + 1, max_retries
            )
            last_exception = Judge0ServiceError(
                "Judge0 service crashed or is not responding properly. "
                "Workers may be restarting due to memory limits."
            )
            
        except socket.timeout as exc:
            raise Judge0TimeoutError(
                f"Judge0 execution timed out after {timeout_seconds}s"
            ) from exc
            
        except TimeoutError as exc:
            raise Judge0TimeoutError(
                f"Judge0 execution timed out after {timeout_seconds}s"
            ) from exc
        
        # Wait before retry (with exponential backoff)
        if attempt < max_retries - 1:
            sleep_time = retry_delay * (2 ** attempt)
            logger.warning("Retrying in %.1f seconds...", sleep_time)
            time.sleep(sleep_time)
    
    # All retries exhausted
    if last_exception:
        raise last_exception
    
    raise Judge0ServiceError("Unexpected error executing code on Judge0")


def check_judge0_health():
    """Check if Judge0 service is healthy and available."""
    base_url = settings.JUDGE0_BASE_URL.rstrip('/')
    
    try:
        request_obj = urllib_request.Request(
            f"{base_url}/system_info",
            headers={"Accept": "application/json"},
            method="GET",
        )
        
        with urllib_request.urlopen(request_obj, timeout=10) as response:
            body = response.read().decode('utf-8')
            data = json.loads(body)
            
        return {
            "healthy": True,
            "details": f"Judge0 is running. Version: {data.get('version', 'unknown')}",
            "data": data,
        }
        
    except Exception as exc:
        return {
            "healthy": False,
            "details": f"Judge0 health check failed: {str(exc)}",
            "error": str(exc),
        }


def get_language_id(language_name: str) -> int:
    """
    Get Judge0 language ID from language name.
    
    Args:
        language_name: Common language name (e.g., "Python", "Java", "C++")
        
    Returns:
        int: Judge0 language ID
        
    Raises:
        Judge0ServiceError: If language is not supported
    """
    # Judge0 language IDs (version 1.13.0+)
    language_map = {
        "python": 71,
        "python3": 71,
        "javascript": 63,
        "js": 63,
        "java": 62,
        "c": 50,
        "cpp": 54,
        "c++": 54,
        "csharp": 51,
        "c#": 51,
        "go": 60,
        "rust": 73,
        "typescript": 74,
        "ruby": 72,
        "php": 68,
        "swift": 83,
        "kotlin": 78,
        "scala": 81,
        "r": 80,
        "perl": 85,
        "lua": 64,
        "bash": 46,
        "haskell": 61,
    }
    
    normalized = language_name.lower().strip()
    
    if normalized in language_map:
        return language_map[normalized]
    
    # Try to find partial match
    for name, lang_id in language_map.items():
        if name in normalized or normalized in name:
            return lang_id
    
    raise Judge0ServiceError(
        f"Unsupported language: {language_name}. "
        f"Supported languages: {', '.join(sorted(set(language_map.keys())))}"
    )
