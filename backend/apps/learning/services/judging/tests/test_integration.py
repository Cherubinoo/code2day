"""views.execute_problem_test_case_batch() dispatch: a problem with
uses_generic_judge=True must route through run_generic_batch() (mocked
Judge0Service here); every existing problem (the flag defaults to False)
must keep hitting the untouched legacy path — apps.learning.tests already
proves that end-to-end, this just proves the dispatch check itself."""

import os
import shutil
import subprocess
import tempfile
from unittest.mock import patch

from django.test import TestCase

from ....models import Problem
from ...problem_testcases import RuntimeTestCase, build_runtime_test_cases
from ....views import execute_problem_test_case_batch
from ..integration import _effective_stdin
from ..wrapper_generator import generate_source


class GenericJudgeDispatchTests(TestCase):
    def setUp(self):
        self.problem = Problem.objects.create(
            title="Two Sum (Generic)",
            slug="two-sum-generic",
            description="desc",
            difficulty="Easy",
            tags=["Array"],
            uses_generic_judge=True,
            generic_schema={
                "function_name": "twoSum",
                "params": [["nums", "vector<int>"], ["target", "int"]],
                "return_type": "vector<int>",
            },
        )
        # execute_problem_test_case_batch always receives RuntimeTestCase
        # instances (see services/problem_testcases.py), never raw TestCase
        # model rows directly — RuntimeTestCase has a `source` field the
        # model itself doesn't.
        self.case = RuntimeTestCase(
            stdin="4\n2\n7\n11\n15\n9\n",
            expected_output="[0, 1]",
            is_sample=True,
            order=1,
            source="stored",
        )

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_generic_problem_routes_through_run_generic_batch(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[0,1]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        solution = (
            "class Solution:\n"
            "    def twoSum(self, nums, target):\n"
            "        seen = {}\n"
            "        for i, x in enumerate(nums):\n"
            "            if target - x in seen:\n"
            "                return [seen[target - x], i]\n"
            "            seen[x] = i\n"
            "        return []\n"
        )
        result = execute_problem_test_case_batch(
            problem=self.problem,
            source_code=solution,
            language="python",
            language_id=71,
            test_cases=[self.case],
            batch_kind="submit",
        )
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(result["passed_cases"], 1)
        self.assertEqual(result["total_cases"], 1)
        mocked_batch.assert_called_once()

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_wrong_answer_from_generic_path(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[1,0]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        result = execute_problem_test_case_batch(
            problem=self.problem,
            source_code="class Solution:\n    def twoSum(self, nums, target):\n        return [1, 0]\n",
            language="python",
            language_id=71,
            test_cases=[self.case],
            batch_kind="submit",
        )
        # [1,0] vs expected [0,1]: order-sensitive vector comparison fails,
        # even though both are the same *set* of indices.
        self.assertEqual(result["status"], "Wrong Answer")
        self.assertEqual(result["passed_cases"], 0)

    def test_legacy_problem_never_touches_generic_path(self):
        legacy_problem = Problem.objects.create(
            title="Legacy Problem", slug="legacy-problem", description="d",
            difficulty="Easy", tags=[],
        )
        self.assertFalse(legacy_problem.uses_generic_judge)
        with patch("apps.learning.services.judging.integration.run_generic_batch") as mocked_run:
            legacy_case = RuntimeTestCase(
                stdin="1\n", expected_output="1", is_sample=True, order=1, source="stored",
            )
            with patch(
                "apps.learning.services.judging.judge0_service.Judge0Service.batch_execute",
                return_value=[{
                    "stdout": "1\n", "stderr": "", "compile_output": "", "status": "Accepted",
                    "time": "0.01", "memory": "1000", "token": "", "output": "1\n",
                }],
            ):
                execute_problem_test_case_batch(
                    problem=legacy_problem,
                    source_code="print(1)",
                    language="python",
                    language_id=71,
                    test_cases=[legacy_case],
                    batch_kind="submit",
                )
            mocked_run.assert_not_called()


class GenericJudgeDesignDispatchTests(TestCase):
    """run_generic_batch()'s kind=="design" branch: generate_design_source
    instead of generate_source, and compare_design_output (per-operation
    return type, read from schema["methods"]) instead of compare_output
    (one uniform return_type) — Judge0Service itself mocked, same as
    GenericJudgeDispatchTests above, since this is about the dispatch and
    comparison logic, not real execution (see test_design_wrapper_generation.py
    for real-interpreter coverage of generate_design_source itself)."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title="Zigzag Iterator (Generic)",
            slug="zigzag-iterator-generic",
            description="desc",
            difficulty="Medium",
            tags=["Design"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "design",
                "class_name": "ZigzagIterator",
                "methods": {
                    "ZigzagIterator": {"params": [["v1", "vector<int>"], ["v2", "vector<int>"]], "return_type": "void"},
                    "next": {"params": [], "return_type": "int"},
                    "hasNext": {"params": [], "return_type": "bool"},
                },
                "custom_structs": {},
            },
        )

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_design_problem_routes_through_generate_design_source(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[null,1,3,2]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(
            stdin="4\nZigzagIterator\n2\n1\n2\n4\n3\n4\n5\n6\nnext\nnext\nnext\n",
            expected_output="[null, 1, 3, 2]",
            is_sample=True, order=1, source="stored",
            input_data={"operations": ["ZigzagIterator", "next", "next", "next"]},
        )
        solution = (
            "class ZigzagIterator:\n"
            "    def __init__(self, v1, v2):\n"
            "        self.queue = []\n"
            "        if v1: self.queue.append((v1, 0))\n"
            "        if v2: self.queue.append((v2, 0))\n"
            "    def next(self):\n"
            "        vals, i = self.queue.pop(0)\n"
            "        if i + 1 < len(vals):\n"
            "            self.queue.append((vals, i + 1))\n"
            "        return vals[i]\n"
            "    def hasNext(self):\n"
            "        return len(self.queue) > 0\n"
        )
        result = execute_problem_test_case_batch(
            problem=self.problem, source_code=solution, language="python", language_id=71,
            test_cases=[case], batch_kind="submit",
        )
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(result["passed_cases"], 1)
        self.assertEqual(result["total_cases"], 1)
        mocked_batch.assert_called_once()
        # The generated source actually sent to Judge0 must be the design
        # wrapper (dispatch loop over operations), not the function-style
        # single-call wrapper — sanity-check a design-only fragment.
        submissions = mocked_batch.call_args.args[0]
        self.assertIn("__op", submissions[0]["source_code"])

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_design_problem_wrong_answer_when_output_mismatches(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[null,2,3,1]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(
            stdin="4\nZigzagIterator\n2\n1\n2\n4\n3\n4\n5\n6\nnext\nnext\nnext\n",
            expected_output="[null, 1, 3, 2]",
            is_sample=True, order=1, source="stored",
            input_data={"operations": ["ZigzagIterator", "next", "next", "next"]},
        )
        result = execute_problem_test_case_batch(
            problem=self.problem, source_code="class ZigzagIterator: pass",
            language="python", language_id=71, test_cases=[case], batch_kind="submit",
        )
        self.assertEqual(result["status"], "Wrong Answer")
        self.assertEqual(result["passed_cases"], 0)


class ExampleDerivedStdinAdaptationTests(TestCase):
    """Regression test for a real reported bug: a generic-judge problem
    with no stored TestCase rows yet falls back to deriving "sample" cases
    straight from Problem.examples (problem_testcases.py's
    _build_example_test_cases) — raw text like `s = "rabbbit", t =
    "rabbit"`, never adapted into this package's own wire format the way
    the legacy execution path already adapts it via
    execution_adapter.parse_argument_list(). Without _effective_stdin()
    doing the same adaptation, the generated wrapper's second _reader.next()
    call found nothing (both values were still on one un-split line) and
    crashed with IndexError — exactly the "Sample test cases passed: 0/2"
    /"IndexError: list index out of range" the user reported for Distinct
    Subsequences (a two-string-parameter function)."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title="Distinct Subsequences", slug="distinct-subsequences-generic",
            description="desc", difficulty="Hard", tags=["DP"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "function", "function_name": "numDistinct",
                "params": [["s", "string"], ["t", "string"]], "return_type": "int",
                "custom_structs": {},
            },
            examples=[
                {"input": 's = "rabbbit", t = "rabbit"', "output": "3"},
                {"input": 's = "babgbag", t = "bag"', "output": "5"},
            ],
        )

    def test_example_derived_case_gets_adapted_to_wire_format(self):
        # No stored TestCase rows -> build_runtime_test_cases() falls back
        # to raw-text examples, tagged source="examples".
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        self.assertEqual(len(cases), 2)
        self.assertEqual(cases[0].source, "examples")
        self.assertEqual(cases[0].stdin, 's = "rabbbit", t = "rabbit"')  # raw, un-adapted, as stored

        adapted = _effective_stdin(cases[0], self.problem.generic_schema, is_design=False)
        self.assertEqual(adapted, "rabbbit\nrabbit\n")

    def test_stored_wire_case_is_left_untouched(self):
        stored = RuntimeTestCase(
            stdin="rabbbit\nrabbit\n", expected_output="3", is_sample=True, order=1, source="stored",
            input_format="wire",
        )
        self.assertEqual(_effective_stdin(stored, self.problem.generic_schema, is_design=False), stored.stdin)

    def test_persisted_raw_text_row_still_gets_adapted(self):
        # The actual motivating fix, not just the ephemeral no-stored-rows
        # fallback: services/problem_testcases.py's sync_problem_test_cases()
        # persists raw example text into REAL TestCase rows (source="stored"
        # once read back) — dispatching on input_format instead of source
        # means these get adapted too, not just cases that never touched
        # the DB.
        from ....models import TestCase
        TestCase.objects.create(
            problem=self.problem, stdin='s = "rabbbit", t = "rabbit"', expected_output="3",
            is_sample=True, order=1, input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0].source, "stored")
        self.assertEqual(cases[0].input_format, "raw_text")
        adapted = _effective_stdin(cases[0], self.problem.generic_schema, is_design=False)
        self.assertEqual(adapted, "rabbbit\nrabbit\n")

    def test_generated_wrapper_actually_runs_correctly_with_adapted_stdin(self):
        # End-to-end proof, not just a unit check on the adaptation
        # function: the exact reported solution, run for real against the
        # exact reported example, through the exact wire format
        # _effective_stdin() now produces.
        if not (shutil.which("python") or shutil.which("python3")):
            self.skipTest("no local python interpreter available")

        cases = build_runtime_test_cases(self.problem, sample_only=True)
        solution = (
            "class Solution:\n"
            "    def numDistinct(self, s: str, t: str) -> int:\n"
            "        dp = [0] * (len(t) + 1)\n"
            "        dp[0] = 1\n"
            "        for i in range(len(s)):\n"
            "            for j in range(len(t), 0, -1):\n"
            "                if s[i] == t[j - 1]:\n"
            "                    dp[j] += dp[j - 1]\n"
            "        return dp[len(t)]\n"
        )
        full_source = generate_source(self.problem.generic_schema, "python", solution)
        runner = shutil.which("python") or shutil.which("python3")
        for case, expected in zip(cases, ["3", "5"]):
            adapted_stdin = _effective_stdin(case, self.problem.generic_schema, is_design=False)
            with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
                f.write(full_source)
                path = f.name
            try:
                r = subprocess.run([runner, path], input=adapted_stdin, capture_output=True, text=True, timeout=15)
            finally:
                os.unlink(path)
            self.assertEqual(r.returncode, 0, msg=r.stderr)
            self.assertEqual(r.stdout.strip(), expected)
