import logging
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from .models import (
    Problem, 
    StudentProfile, 
    ExecutionRecord, 
    ProblemSolution, 
    SolvedProblem, 
    ProblemSession
)
from .services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID
from .services.judge0 import Judge0TimeoutError, Judge0ServiceError
from .services.code_validator import validate_submission
from .services.execution_adapter import (
    prepare_execution_payload,
)
from .services.problem_testcases import build_runtime_test_cases
from .services.complexity_analyzer import calculate_complexity

logger = logging.getLogger(__name__)

@shared_task(bind=True)
def run_code_task(self, profile_id, problem_slug, source_code, language, language_id, is_submit, stdin):
    """
    Asynchronous task to execute code in Judge0.
    """
    try:
        profile = StudentProfile.objects.get(id=profile_id)
        problem = Problem.objects.filter(slug=problem_slug).first() if problem_slug else None
        language_name = LANGUAGE_NAME_BY_ID.get(language_id)
        if not language_name:
            return {"error": f"Unsupported language_id: {language_id}"}

        is_valid, validation_error = validate_submission(language or "", source_code, stdin)
        if not is_valid:
            return {"error": f"Code validation failed: {validation_error}"}

        service = Judge0Service()

        result = {}
        run_sample_cases = bool(problem and not is_submit and not stdin.strip())

        if is_submit or run_sample_cases:
            test_cases = build_runtime_test_cases(
                problem,
                sample_only=not is_submit,
            )

            if is_submit and not test_cases:
                return {"error": "No test cases are configured for this problem yet."}

            if test_cases:
                try:
                    submissions = []
                    for tc in test_cases:
                        prepared = prepare_execution_payload(
                            problem=problem, source_code=source_code, language=language, stdin=tc.stdin,
                        )
                        submissions.append({
                            "source_code": prepared["source_code"], "language_name": language_name,
                            "stdin": prepared["stdin"],
                        })
                    run_results = service.batch_execute(
                        submissions,
                        time_limit_seconds=getattr(problem, "time_limit_seconds", None),
                        memory_limit_kb=getattr(problem, "memory_limit_kb", None),
                    )

                    passed_cases = 0
                    for tc, tc_result in zip(test_cases, run_results):
                        actual = (tc_result.get("stdout") or "").strip()
                        expected = (tc.expected_output or "").strip()
                        if tc_result.get("status") == "Accepted" and actual == expected:
                            passed_cases += 1

                    # Surface the last test case's raw output/status as the
                    # headline result — same convention execute_problem_test_case_batch
                    # uses for its "latest_time"/"latest_memory" fields.
                    result = dict(run_results[-1]) if run_results else {}
                    result["passed_cases"] = passed_cases
                    result["total_cases"] = len(test_cases)
                    result["all_tests_passed"] = passed_cases == len(test_cases)
                except Exception as e:
                    result = {"error": f"Execution failed: {str(e)}"}
            else:
                prepared = prepare_execution_payload(
                    problem=problem, source_code=source_code, language=language, stdin=stdin,
                )
                result = service.execute_single(
                    source_code=prepared["source_code"], language_name=language_name, stdin=prepared["stdin"],
                )
        else:
            prepared = prepare_execution_payload(
                problem=problem, source_code=source_code, language=language, stdin=stdin,
            )
            result = service.execute_single(
                source_code=prepared["source_code"], language_name=language_name, stdin=prepared["stdin"],
            )

        # Create ExecutionRecord
        ExecutionRecord.objects.create(
            student=profile,
            problem=problem,
            language=language or str(language_id),
            language_id=language_id,
            source_code=source_code,
            stdin=stdin,
            stdout=result.get("output") if result.get("test_results") else result.get("stdout"),
            stderr=result.get("stderr"),
            compile_output=result.get("compile_output"),
            status_description=result.get("status"),
            execution_time=str(result.get("time") or ""),
            memory=str(result.get("memory") or ""),
        )

        # Handle submission logic
        if is_submit and problem and result.get("total_cases"):
            time_complexity, space_complexity = calculate_complexity(source_code, language)
            
            time_spent = 0
            active_session = ProblemSession.objects.filter(
                student=profile,
                problem=problem,
                is_active=True
            ).first()
            if active_session:
                time_spent = active_session.end_session()
            
            all_passed = result["passed_cases"] == result["total_cases"]
            ProblemSolution.objects.create(
                problem=problem,
                student=profile,
                language=language or str(language_id),
                language_id=language_id,
                source_code=source_code,
                status=result["status"],
                passed_cases=result["passed_cases"],
                total_cases=result["total_cases"],
                all_tests_passed=all_passed,
                execution_time=str(result["time"] or ""),
                memory=str(result["memory"] or ""),
                time_complexity=time_complexity,
                space_complexity=space_complexity,
                time_spent_seconds=time_spent,
            )
            
            if all_passed:
                SolvedProblem.objects.get_or_create(
                    student=profile,
                    problem=problem,
                    defaults={"language": language or str(language_id)},
                )
                profile.update_streak_for_activity()
            
            result["complexity"] = {"time": time_complexity, "space": space_complexity}

        return result

    except (Judge0TimeoutError, Judge0ServiceError) as exc:
        logger.error("Judge0 error in task: %s", exc)
        return {"error": str(exc)}
    except Exception as exc:
        logger.error("Unexpected error in run_code_task: %s", exc, exc_info=True)
        return {"error": "Unexpected execution error."}
