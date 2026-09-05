"""The single integration point between this package and the rest of the
app. `views.execute_problem_test_case_batch()` calls `run_generic_batch()`
first and returns its result unchanged whenever
`problem.uses_generic_judge` is set — every problem that doesn't set that
flag (all 1,828 existing ones) never reaches this module at all, so the
legacy path is provably untouched.

Convention for a `uses_generic_judge=True` Problem's TestCase rows (kept
symmetric with the legacy path, which also just stores raw text per case):
`TestCase.stdin` holds the wire-format text (`serializer.serialize_value`'s
output) for that case's params, and `TestCase.expected_output` holds the
expected return value JSON-encoded (`json.dumps` of the structured Python
value `comparator.compare_output` expects) — not the generated program's
own output-format text, so it stays language-and-generator agnostic.
"""

import json
import logging
import time
import uuid

from .type_system import parse_type
from .wrapper_generator import generate_source, generate_design_source
from .comparator import compare_output
from .judge0_service import Judge0Service
from .versions import WRAPPER_VERSION, TYPE_SYSTEM_VERSION, SERIALIZER_VERSION

# Reused as-is from the legacy design-problem path — same comparison rules
# (per-operation return type, float tolerance), just handed a schema in
# this package's own shape (which already has the same schema["methods"]
# dict the legacy function reads return_type from).
from ..execution_adapter import compare_design_output

logger = logging.getLogger(__name__)

_LANGUAGE_ALIASES = {"js": "javascript", "c++": "cpp", "python3": "python"}


def normalize_language_name(language):
    normalized = (language or "").lower().strip()
    return _LANGUAGE_ALIASES.get(normalized, normalized)


def run_generic_batch(*, problem, source_code, language, test_cases, batch_kind):
    """Same result shape as views.execute_problem_test_case_batch()."""
    execution_id = uuid.uuid4().hex
    started_at = time.monotonic()
    schema = problem.generic_schema or {}
    lang_name = normalize_language_name(language)

    # Structured, per-execution observability — deliberately never includes
    # source_code (user's submitted code) or anything from the environment;
    # just enough to correlate a Judge0 run with a problem/language/outcome
    # after the fact without exposing what was executed.
    log_context = {
        "execution_id": execution_id,
        "problem_id": problem.id,
        "problem_slug": problem.slug,
        "language": lang_name,
        "batch_kind": batch_kind,
        "test_case_count": len(test_cases),
        "wrapper_version": WRAPPER_VERSION,
    }
    logger.info("Generic judge execution starting: %s", log_context)

    is_design = schema.get("kind") == "design"

    return_node = None
    if not is_design:
        # Design schemas have no single top-level return_type — each
        # operation has its own (schema["methods"][op]["return_type"]),
        # compared per-index by compare_design_output() below instead.
        try:
            return_node = parse_type(schema["return_type"], schema.get("custom_structs"))
        except Exception as exc:  # noqa: BLE001 - surfaced as a normal failed run, not a 500
            return _error_result(
                f"Invalid generic_schema on problem {problem.slug!r}: {exc}", batch_kind,
                execution_id=execution_id, error_type="invalid_schema",
            )

    try:
        full_source = (generate_design_source if is_design else generate_source)(schema, lang_name, source_code)
    except Exception as exc:  # noqa: BLE001
        return _error_result(
            f"Could not generate {lang_name} wrapper: {exc}", batch_kind,
            execution_id=execution_id, error_type="wrapper_generation_failed",
        )

    service = Judge0Service()
    submissions = [
        {"source_code": full_source, "language_name": lang_name, "stdin": case.stdin}
        for case in test_cases
    ]
    run_results = service.batch_execute(
        submissions,
        time_limit_seconds=problem.time_limit_seconds,
        memory_limit_kb=problem.memory_limit_kb,
    )

    test_results = []
    latest_time = ""
    latest_memory = ""
    for case, tc_result in zip(test_cases, run_results):
        actual_raw = (tc_result["stdout"] or "").strip()
        passed = False
        if tc_result["status"] == "Accepted":
            if is_design:
                operations = (getattr(case, "input_data", None) or {}).get("operations", [])
                passed = compare_design_output(actual_raw, case.expected_output, schema, operations)
            else:
                try:
                    expected_value = json.loads(case.expected_output)
                except (TypeError, ValueError) as exc:
                    tc_result = {**tc_result, "status": "Wrong Answer",
                                 "stderr": f"Could not parse stored expected_output as JSON: {exc}"}
                else:
                    cmp = compare_output(return_node, actual_raw, expected_value)
                    passed = cmp.passed

        latest_time = tc_result["time"] or latest_time
        latest_memory = tc_result["memory"] or latest_memory
        test_results.append({
            "stdin": case.stdin,
            "expected": case.expected_output,
            "actual": actual_raw or tc_result.get("output") or tc_result.get("stderr") or "",
            "passed": passed,
            "status": tc_result["status"],
            "time": tc_result["time"],
            "memory": tc_result["memory"],
            "stderr": tc_result["stderr"],
            "compile_output": tc_result["compile_output"],
            "is_sample": case.is_sample,
            "source": case.source,
        })

    total_cases = len(test_results)
    passed_cases = sum(1 for item in test_results if item["passed"])
    first_failure = next((item for item in test_results if not item["passed"]), None)

    if total_cases and passed_cases == total_cases:
        status_label = "Accepted"
    elif first_failure and first_failure["status"] != "Accepted":
        status_label = first_failure["status"]
    else:
        status_label = "Wrong Answer"

    if batch_kind == "sample":
        output = f"Sample test cases passed: {passed_cases}/{total_cases}."
    elif status_label == "Accepted":
        output = f"All {total_cases} test cases passed."
    else:
        output = f"{passed_cases}/{total_cases} test cases passed."

    elapsed_seconds = round(time.monotonic() - started_at, 3)
    logger.info(
        "Generic judge execution finished: %s",
        {**log_context, "status": status_label, "passed_cases": passed_cases,
         "total_cases": total_cases, "elapsed_seconds": elapsed_seconds},
    )

    return {
        "stdout": output,
        "stderr": first_failure["stderr"] if first_failure else "",
        "compile_output": first_failure["compile_output"] if first_failure else "",
        "status": status_label,
        "time": latest_time,
        "memory": latest_memory,
        "output": output,
        "test_results": test_results,
        "passed_cases": passed_cases,
        "total_cases": total_cases,
        "test_case_mode": batch_kind,
        "execution_id": execution_id,
        "wrapper_version": WRAPPER_VERSION,
        "type_system_version": TYPE_SYSTEM_VERSION,
        "serializer_version": SERIALIZER_VERSION,
    }


def _error_result(message, batch_kind, *, execution_id=None, error_type="internal_error"):
    logger.error("Generic judge error [%s] (%s): %s", execution_id, error_type, message)
    return {
        "stdout": "", "stderr": message, "compile_output": "", "status": "Internal Error",
        "time": "", "memory": "", "output": message,
        "test_results": [], "passed_cases": 0, "total_cases": 0, "test_case_mode": batch_kind,
        "execution_id": execution_id,
        "wrapper_version": WRAPPER_VERSION,
        "type_system_version": TYPE_SYSTEM_VERSION,
        "serializer_version": SERIALIZER_VERSION,
        "error_type": error_type,
    }
