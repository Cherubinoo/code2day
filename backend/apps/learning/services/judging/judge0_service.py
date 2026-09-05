"""Judge0Service — the abstraction the codebase never had: every existing
call site (`execute_judge0_submission`) talks to Judge0 one HTTP round
trip at a time, with no per-submission time/memory limit ever sent and no
batching, so a problem with N test cases costs N sequential requests.

`execute()` reuses the existing, already-hardened `execute_judge0_submission`
(retries, error classification) when no limit override is needed, and only
drops to a direct request when a limit must be threaded through (Judge0
accepts `cpu_time_limit`/`memory_limit` directly — today's code never sets
them). `batch_execute()` uses Judge0's real `/submissions/batch` create +
poll endpoints, so a whole test-case batch is one create call plus a
handful of polls, not N separate calls.
"""

import json
import time
from urllib import error as urllib_error
from urllib import request as urllib_request

from django.conf import settings

from ..judge0 import (
    build_output_payload,
    decode_base64,
    encode_base64,
    execute_judge0_submission,
    Judge0ServiceError,
    Judge0TimeoutError,
)

# Matches the language IDs already used elsewhere in this app
# (views.ExecutorSubmitView.LANGUAGE_IDS) — one source of truth kept in
# sync rather than duplicated with different numbers.
LANGUAGE_IDS = {
    "python": 71,
    "javascript": 63,
    "java": 62,
    "cpp": 54,
}

_QUEUED, _PROCESSING = 1, 2  # Judge0 status ids that mean "still running"

__all__ = ["Judge0Service", "LANGUAGE_IDS"]


class Judge0Service:
    def __init__(self, base_url=None, timeout=None):
        self.base_url = (base_url or settings.JUDGE0_BASE_URL).rstrip("/")
        self.timeout = timeout or getattr(settings, "JUDGE0_TIMEOUT_SECONDS", 300)

    def execute(self, source_code, language_name, stdin="", *, time_limit_seconds=None, memory_limit_kb=None):
        language_id = LANGUAGE_IDS[language_name]
        if time_limit_seconds is None and memory_limit_kb is None:
            return execute_judge0_submission(
                source_code=source_code, language_id=language_id, stdin=stdin, timeout=self.timeout,
            )
        return self._submit_single_with_limits(source_code, language_id, stdin, time_limit_seconds, memory_limit_kb)

    def _submit_single_with_limits(self, source_code, language_id, stdin, time_limit_seconds, memory_limit_kb):
        payload = {
            "source_code": encode_base64(source_code),
            "language_id": language_id,
            "stdin": encode_base64(stdin or ""),
            "base64_encoded": True,
        }
        if time_limit_seconds is not None:
            payload["cpu_time_limit"] = time_limit_seconds
        if memory_limit_kb is not None:
            payload["memory_limit"] = memory_limit_kb

        url = f"{self.base_url}/submissions?wait=true&base64_encoded=true"
        body = self._request(url, payload)
        return build_output_payload(body, base64_encoded=True)

    def batch_execute(self, submissions, *, time_limit_seconds=None, memory_limit_kb=None):
        """submissions: [{"source_code", "language_name", "stdin"}, ...].
        Returns result dicts (same shape as execute()) in the same order."""
        if not submissions:
            return []

        entries = []
        for sub in submissions:
            entry = {
                "source_code": encode_base64(sub["source_code"]),
                "language_id": LANGUAGE_IDS[sub["language_name"]],
                "stdin": encode_base64(sub.get("stdin") or ""),
            }
            if time_limit_seconds is not None:
                entry["cpu_time_limit"] = time_limit_seconds
            if memory_limit_kb is not None:
                entry["memory_limit"] = memory_limit_kb
            entries.append(entry)

        create_url = f"{self.base_url}/submissions/batch?base64_encoded=true"
        created = self._request(create_url, {"submissions": entries})
        tokens = [item["token"] for item in created]

        results_by_token = {}
        pending = list(tokens)
        deadline = time.time() + self.timeout
        while pending and time.time() < deadline:
            poll_url = f"{self.base_url}/submissions/batch?tokens={','.join(pending)}&base64_encoded=true"
            polled = self._request(poll_url, None)
            still_pending = []
            for item in polled.get("submissions", []):
                status_id = (item.get("status") or {}).get("id", 0)
                if status_id in (_QUEUED, _PROCESSING):
                    still_pending.append(item["token"])
                else:
                    results_by_token[item["token"]] = build_output_payload(item, base64_encoded=True)
            pending = still_pending
            if pending:
                time.sleep(0.5)

        if pending:
            raise Judge0TimeoutError(
                f"Batch execution timed out after {self.timeout}s with {len(pending)} submission(s) still pending"
            )
        return [results_by_token[tok] for tok in tokens]

    def _request(self, url, payload):
        method = "POST" if payload is not None else "GET"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib_request.Request(
            url, data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method=method,
        )
        try:
            with urllib_request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib_error.URLError as exc:
            raise Judge0ServiceError(f"Cannot reach Judge0 at {self.base_url}: {exc}") from exc
