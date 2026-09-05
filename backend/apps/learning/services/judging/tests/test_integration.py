"""views.execute_problem_test_case_batch() dispatch: a problem with
uses_generic_judge=True must route through run_generic_batch() (mocked
Judge0Service here); every existing problem (the flag defaults to False)
must keep hitting the untouched legacy path — apps.learning.tests already
proves that end-to-end, this just proves the dispatch check itself."""

from unittest.mock import patch

from django.test import TestCase

from ....models import Problem
from ...problem_testcases import RuntimeTestCase
from ....views import execute_problem_test_case_batch


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
