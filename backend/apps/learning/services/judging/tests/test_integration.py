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
                "apps.learning.views.execute_judge0_submission",
                return_value={
                    "stdout": "1\n", "stderr": "", "compile_output": "", "status": "Accepted",
                    "time": "0.01", "memory": "1000", "token": "", "output": "1\n",
                },
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
