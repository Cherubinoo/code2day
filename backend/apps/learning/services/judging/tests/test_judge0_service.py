"""Judge0Service tests with execute_judge0_submission / urlopen mocked —
same mocking pattern apps.learning.tests.Judge0RunApiTests already uses,
so no live Judge0 needed."""

import json
from unittest.mock import patch

from django.test import SimpleTestCase

from ..judge0_service import Judge0Service


class _FakeResponse:
    def __init__(self, body):
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._body


class Judge0ServiceExecuteTests(SimpleTestCase):
    @patch("apps.learning.services.judge0.urllib_request.urlopen")
    def test_execute_without_limits_reuses_existing_execute_judge0_submission(self, mocked_urlopen):
        mocked_urlopen.return_value = _FakeResponse(
            b'{"stdout":"[0,1]\\n","stderr":null,"compile_output":null,'
            b'"status":{"description":"Accepted"},"time":"0.01","memory":10240}'
        )
        service = Judge0Service(base_url="http://fake-judge0")
        result = service.execute("print([0,1])", "python", stdin="")
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(result["stdout"], "[0,1]\n")

    @patch("apps.learning.services.judging.judge0_service.urllib_request.urlopen")
    def test_execute_with_limits_sends_cpu_and_memory_limit_fields(self, mocked_urlopen):
        captured = {}

        def fake_urlopen(req, timeout=None):
            captured["payload"] = json.loads(req.data.decode("utf-8"))
            return _FakeResponse(
                b'{"stdout":"ok\\n","stderr":null,"compile_output":null,'
                b'"status":{"description":"Accepted"},"time":"0.01","memory":10240}'
            )

        mocked_urlopen.side_effect = fake_urlopen
        service = Judge0Service(base_url="http://fake-judge0")
        result = service.execute("print(1)", "python", stdin="", time_limit_seconds=2.0, memory_limit_kb=65536)

        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(captured["payload"]["cpu_time_limit"], 2.0)
        self.assertEqual(captured["payload"]["memory_limit"], 65536)


class Judge0ServiceBatchTests(SimpleTestCase):
    @patch("apps.learning.services.judging.judge0_service.urllib_request.urlopen")
    def test_batch_execute_one_create_call_then_polls_until_done(self, mocked_urlopen):
        calls = {"count": 0}

        def fake_urlopen(req, timeout=None):
            calls["count"] += 1
            if req.get_method() == "POST" and "/submissions/batch" in req.full_url and "tokens=" not in req.full_url:
                return _FakeResponse(json.dumps([{"token": "t1"}, {"token": "t2"}]).encode("utf-8"))
            # First poll: t1 done, t2 still processing.
            if calls["count"] == 2:
                return _FakeResponse(json.dumps({
                    "submissions": [
                        {"token": "t1", "stdout": "MQ==", "stderr": None, "compile_output": None,
                         "status": {"id": 3, "description": "Accepted"}, "time": "0.01", "memory": 1000},
                        {"token": "t2", "stdout": None, "stderr": None, "compile_output": None,
                         "status": {"id": 2, "description": "Processing"}, "time": None, "memory": None},
                    ]
                }).encode("utf-8"))
            return _FakeResponse(json.dumps({
                "submissions": [
                    {"token": "t2", "stdout": "Mg==", "stderr": None, "compile_output": None,
                     "status": {"id": 3, "description": "Accepted"}, "time": "0.01", "memory": 1000},
                ]
            }).encode("utf-8"))

        mocked_urlopen.side_effect = fake_urlopen
        service = Judge0Service(base_url="http://fake-judge0")

        with patch("apps.learning.services.judging.judge0_service.time.sleep"):
            results = service.batch_execute([
                {"source_code": "print(1)", "language_name": "python", "stdin": ""},
                {"source_code": "print(2)", "language_name": "python", "stdin": ""},
            ])

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["status"], "Accepted")
        self.assertEqual(results[0]["stdout"], "1")
        self.assertEqual(results[1]["stdout"], "2")
        # One create call + 2 poll calls (second poll resolves the last pending token).
        self.assertEqual(calls["count"], 3)

    def test_batch_execute_empty_list_short_circuits(self):
        service = Judge0Service(base_url="http://fake-judge0")
        self.assertEqual(service.batch_execute([]), [])
