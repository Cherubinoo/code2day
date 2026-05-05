"""
Code2Day Custom Executor
Judge0-compatible API using Docker containers for isolation.
No cgroup v1 required — works on Ubuntu 25.10 / kernel 6.14+
"""

import asyncio
import base64
import os
import uuid
import time
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import docker
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Code2Day Executor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Docker client ─────────────────────────────────────────────────────────────
docker_client = docker.from_env()

# ── Worker pool — max 40 concurrent executions ───────────────────────────────
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "40"))
executor_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)

# ── Language config — Judge0 language IDs ────────────────────────────────────
LANGUAGES = {
    # Python
    71: {"image": "code2day-python:latest",  "ext": "py",   "cmd": ["python3", "/code/solution.py"]},
    # JavaScript (Node.js)
    63: {"image": "code2day-node:latest",    "ext": "js",   "cmd": ["node", "/code/solution.js"]},
    # Java
    62: {"image": "code2day-java:latest",    "ext": "java", "cmd": ["sh", "-c", "CP=$(find /usr/local/lib/java -name '*.jar' 2>/dev/null | tr '\n' ':'); cd /code && javac -cp \".:$CP\" Solution.java 2>&1 && java -cp \".:$CP\" Solution"]},
    # C
    50: {"image": "code2day-c:latest",       "ext": "c",    "cmd": ["sh", "-c", "gcc /code/solution.c -o /code/solution -lm 2>&1 && /code/solution"]},
    # C++
    54: {"image": "code2day-cpp:latest",     "ext": "cpp",  "cmd": ["sh", "-c", "g++ /code/solution.cpp -o /code/solution -std=c++17 2>&1 && /code/solution"]},
}

CPU_TIME_LIMIT = int(os.getenv("CPU_TIME_LIMIT", "10"))
WALL_TIME_LIMIT = int(os.getenv("WALL_TIME_LIMIT", "15"))
MEMORY_LIMIT_MB = int(os.getenv("MEMORY_LIMIT_MB", "256"))


# ── Request/Response models (Judge0 compatible) ───────────────────────────────

class SubmissionRequest(BaseModel):
    source_code: str
    language_id: int
    stdin: Optional[str] = ""
    base64_encoded: Optional[bool] = False
    cpu_time_limit: Optional[float] = None
    wall_time_limit: Optional[float] = None
    memory_limit: Optional[int] = None


class SubmissionResponse(BaseModel):
    token: str
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    compile_output: Optional[str] = None
    message: Optional[str] = None
    status: dict
    time: Optional[str] = None
    memory: Optional[str] = None


def decode_if_base64(text: str, is_base64: bool) -> str:
    if not text:
        return ""
    if is_base64:
        try:
            return base64.b64decode(text).decode("utf-8", errors="replace")
        except Exception:
            return text
    return text


def encode_base64(text: str) -> str:
    if not text:
        return ""
    return base64.b64encode(text.encode("utf-8")).decode("utf-8")


def run_in_docker(language_id: int, source_code: str, stdin: str,
                  cpu_limit: float, wall_limit: float, mem_limit_mb: int) -> dict:
    """Run code in an isolated Docker container."""

    if language_id not in LANGUAGES:
        return {
            "stdout": "", "stderr": "", "compile_output": "",
            "message": f"Language ID {language_id} not supported",
            "status_id": 14, "status_desc": "Exec Format Error",
            "time": "0", "memory": "0",
        }

    lang = LANGUAGES[language_id]
    container = None
    start_time = time.time()

    # Java needs the file named Solution.java
    if language_id == 62:
        filename = "Solution.java"
    else:
        filename = f"solution.{lang['ext']}"

    try:
        import tempfile, subprocess

        with tempfile.TemporaryDirectory() as tmpdir:
            code_file = os.path.join(tmpdir, filename)
            with open(code_file, "w") as f:
                f.write(source_code)
            os.chmod(code_file, 0o644)
            os.chmod(tmpdir, 0o755)

            # Write stdin to a file inside tmpdir so it can be piped reliably
            stdin_file = os.path.join(tmpdir, "_stdin.txt")
            with open(stdin_file, "w") as f:
                f.write(stdin or "")
            os.chmod(stdin_file, 0o644)

            # Build docker run command — pipe stdin via file redirect
            # This avoids the unreliable attach_socket approach entirely
            cmd = [
                "docker", "run", "--rm",
                "--network", "none",
                "--memory", f"{mem_limit_mb}m",
                "--memory-swap", f"{mem_limit_mb}m",
                "--cpus", str(cpu_limit),
                "--pids-limit", "64",
                "--security-opt", "no-new-privileges",
                "-v", f"{tmpdir}:/code:rw",
                "-i",  # keep stdin open for pipe
                lang["image"],
            ]
            # Append the language command
            if isinstance(lang["cmd"], list):
                cmd.extend(lang["cmd"])
            else:
                cmd.extend(["sh", "-c", lang["cmd"]])

            stdin_data = (stdin or "").encode("utf-8")

            try:
                proc = subprocess.run(
                    cmd,
                    input=stdin_data,
                    capture_output=True,
                    timeout=wall_limit,
                )
                elapsed = time.time() - start_time
                exit_code = proc.returncode
                stdout_raw = proc.stdout.decode("utf-8", errors="replace")
                stderr_raw = proc.stderr.decode("utf-8", errors="replace")

            except subprocess.TimeoutExpired:
                elapsed = time.time() - start_time
                # Kill any leftover container
                try:
                    subprocess.run(
                        ["docker", "ps", "-q", "--filter", f"ancestor={lang['image']}"],
                        capture_output=True, timeout=5
                    )
                except Exception:
                    pass
                return {
                    "stdout": "", "stderr": "Time Limit Exceeded",
                    "compile_output": "", "message": "",
                    "status_id": 5, "status_desc": "Time Limit Exceeded",
                    "time": f"{elapsed:.3f}", "memory": "0",
                }

            # Separate compile errors from runtime output for compiled languages
            stdout = stdout_raw
            stderr = ""
            compile_output = ""

            if exit_code != 0:
                if language_id in (50, 54):  # C, C++
                    if "error:" in stdout_raw or "undefined reference" in stdout_raw:
                        compile_output = stdout_raw
                        stdout = ""
                        status_id = 6
                        status_desc = "Compilation Error"
                    else:
                        stderr = stderr_raw or stdout_raw
                        stdout = ""
                        status_id = 11
                        status_desc = "Runtime Error (NZEC)"
                elif language_id == 62:  # Java
                    if "error:" in stdout_raw and ".java:" in stdout_raw:
                        compile_output = stdout_raw
                        stdout = ""
                        status_id = 6
                        status_desc = "Compilation Error"
                    else:
                        stderr = stderr_raw or stdout_raw
                        stdout = ""
                        status_id = 11
                        status_desc = "Runtime Error (NZEC)"
                else:
                    stderr = stderr_raw or stdout_raw
                    stdout = ""
                    status_id = 11
                    status_desc = "Runtime Error (NZEC)"
            else:
                status_id = 3
                status_desc = "Accepted"

            return {
                "stdout": stdout,
                "stderr": stderr,
                "compile_output": compile_output,
                "message": "",
                "status_id": status_id,
                "status_desc": status_desc,
                "time": f"{elapsed:.3f}",
                "memory": "0",
            }

    except Exception as e:
        logger.error(f"Execution error: {e}")
        return {
            "stdout": "", "stderr": str(e), "compile_output": "",
            "message": "Internal execution error",
            "status_id": 13, "status_desc": "Internal Error",
            "time": "0", "memory": "0",
        }


# ── API Endpoints (Judge0 compatible) ─────────────────────────────────────────

@app.post("/submissions")
async def create_submission(req: SubmissionRequest, wait: bool = False, base64_encoded: bool = False):
    """Judge0-compatible submission endpoint."""

    is_b64 = req.base64_encoded or base64_encoded

    # Decode source code and stdin
    source_code = decode_if_base64(req.source_code, is_b64)
    stdin = decode_if_base64(req.stdin or "", is_b64)

    cpu_limit = req.cpu_time_limit or CPU_TIME_LIMIT
    wall_limit = req.wall_time_limit or WALL_TIME_LIMIT
    mem_limit = req.memory_limit or (MEMORY_LIMIT_MB * 1000)  # Judge0 uses KB

    token = str(uuid.uuid4())

    # Run in thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        executor_pool,
        run_in_docker,
        req.language_id,
        source_code,
        stdin,
        cpu_limit,
        wall_limit,
        mem_limit // 1000,  # Convert KB to MB
    )

    # Build Judge0-compatible response
    stdout = result["stdout"]
    stderr = result["stderr"]
    compile_output = result["compile_output"]

    if is_b64:
        stdout = encode_base64(stdout) if stdout else None
        stderr = encode_base64(stderr) if stderr else None
        compile_output = encode_base64(compile_output) if compile_output else None

    return {
        "token": token,
        "stdout": stdout or None,
        "stderr": stderr or None,
        "compile_output": compile_output or None,
        "message": result.get("message") or None,
        "status": {
            "id": result["status_id"],
            "description": result["status_desc"],
        },
        "time": result["time"],
        "memory": result["memory"],
    }


@app.get("/submissions/{token}")
async def get_submission(token: str):
    """Judge0-compatible get submission endpoint (always returns completed)."""
    return {"token": token, "status": {"id": 3, "description": "Accepted"}}


@app.get("/system_info")
async def system_info():
    """Health check endpoint."""
    return {
        "version": "code2day-executor-1.0",
        "workers": MAX_WORKERS,
        "languages": list(LANGUAGES.keys()),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/languages")
async def languages():
    """Return supported languages in Judge0 format."""
    lang_names = {
        71: "Python (3.11)",
        63: "JavaScript (Node.js 20)",
        62: "Java (OpenJDK 17)",
        50: "C (GCC 12)",
        54: "C++ (GCC 12)",
    }
    return [{"id": k, "name": v} for k, v in lang_names.items()]
