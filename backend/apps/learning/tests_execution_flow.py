from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from apps.learning.tasks import run_code_task


class RunCodeTaskExecutionTests(SimpleTestCase):
    @patch("apps.learning.tasks.calculate_complexity", return_value=("O(1)", "O(1)"))
    @patch("apps.learning.tasks.ProblemSession.objects.filter")
    @patch("apps.learning.tasks.SolvedProblem.objects.get_or_create")
    @patch("apps.learning.tasks.ProblemSolution.objects.create")
    @patch("apps.learning.tasks.ExecutionRecord.objects.create")
    @patch("apps.learning.tasks.StudentProfile.objects.get")
    @patch("apps.learning.tasks.Problem.objects.filter")
    @patch("apps.learning.tasks.prepare_execution_payload")
    @patch("apps.learning.tasks.execute_judge0_submission")
    def test_submit_task_uses_prepared_input_for_problem_cases(
        self,
        mock_execute,
        mock_prepare,
        mock_problem_filter,
        mock_student_get,
        mock_execution_record_create,
        mock_problem_solution_create,
        mock_solved_get_or_create,
        mock_problem_session_filter,
        mock_calculate_complexity,
    ):
        profile = SimpleNamespace(id=1, update_streak_for_activity=Mock())
        problem = SimpleNamespace(slug="two-sum", execution_type="function")

        problem_query = Mock()
        problem_query.first.return_value = problem
        mock_problem_filter.return_value = problem_query
        mock_student_get.return_value = profile

        mock_prepare.return_value = {
            "source_code": "wrapped-solution",
            "stdin": "[1,2]",
            "adapted": True,
        }
        mock_execute.return_value = {
            "status": "Accepted",
            "time": "0.01",
            "memory": "0",
            "stdout": "",
            "stderr": "",
            "compile_output": "",
            "output": "",
        }

        active_session = Mock()
        active_session.end_session.return_value = 0
        mock_problem_session_filter.return_value.first.return_value = active_session

        with patch(
            "apps.learning.tasks.build_runtime_test_cases",
            return_value=[
                SimpleNamespace(
                    stdin="nums=[1,2]\ntarget=3",
                    expected_output="3",
                    is_sample=False,
                    order=1,
                    source="stored",
                )
            ],
        ):
            run_code_task(
                self=None,
                profile_id=1,
                problem_slug="two-sum",
                source_code="def solution(nums, target):\n    return 3",
                language="Python",
                language_id=71,
                is_submit=True,
                stdin="",
            )

        self.assertEqual(mock_execute.call_args.kwargs["stdin"], "[1,2]")
