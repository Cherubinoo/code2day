from __future__ import annotations

from dataclasses import dataclass

from apps.learning.models import TestCase
from apps.learning.services.execution_adapter import clean_expected_output


@dataclass(frozen=True)
class RuntimeTestCase:
    stdin: str
    expected_output: str
    is_sample: bool
    order: int
    source: str
    input_data: dict | None = None


def _build_example_test_cases(problem) -> list[RuntimeTestCase]:
    test_cases: list[RuntimeTestCase] = []

    for index, example in enumerate(problem.examples or [], start=1):
        stdin = str(example.get("input", "")).strip()
        expected_output = clean_expected_output(str(example.get("output", "")).strip())

        if not stdin or not expected_output:
            continue

        test_cases.append(
            RuntimeTestCase(
                stdin=stdin,
                expected_output=expected_output,
                is_sample=True,
                order=index,
                source="examples",
            )
        )

    return test_cases


def build_runtime_test_cases(problem, sample_only: bool = False) -> list[RuntimeTestCase]:
    stored_cases = list(TestCase.objects.filter(problem=problem).order_by("order", "id"))
    if stored_cases:
        selected_cases = stored_cases
        if sample_only:
            sample_cases = [case for case in stored_cases if case.is_sample]
            selected_cases = sample_cases or stored_cases

        return [
            RuntimeTestCase(
                stdin=case.stdin,
                expected_output=case.expected_output,
                is_sample=case.is_sample,
                order=case.order,
                source="stored",
                input_data=case.input_data,
            )
            for case in selected_cases
        ]

    return _build_example_test_cases(problem)


def build_lab_runtime_test_cases(exercise, sample_only: bool = False) -> list[RuntimeTestCase]:
    """Same shape as build_runtime_test_cases(), but for a LabExercise's
    own LabExerciseTestCase rows — used so a lab exercise's "Run" button
    can show a real Test Cases: X/Y passed breakdown, the same way a
    Problem's does, instead of only ever running against raw stdin."""
    from apps.learning.models import LabExerciseTestCase

    stored_cases = list(LabExerciseTestCase.objects.filter(exercise=exercise).order_by("order", "id"))
    if not stored_cases:
        return []

    selected_cases = stored_cases
    if sample_only:
        sample_cases = [case for case in stored_cases if case.is_sample]
        selected_cases = sample_cases or stored_cases

    return [
        RuntimeTestCase(
            stdin=case.stdin,
            expected_output=case.expected_output,
            is_sample=case.is_sample,
            order=case.order,
            source="stored",
        )
        for case in selected_cases
    ]


def sync_problem_test_cases(problem) -> int:
    if TestCase.objects.filter(problem=problem).exists():
        return 0

    created = 0
    for case in _build_example_test_cases(problem):
        TestCase.objects.create(
            problem=problem,
            stdin=case.stdin,
            expected_output=case.expected_output,
            is_sample=case.is_sample,
            order=case.order,
        )
        created += 1

    return created
