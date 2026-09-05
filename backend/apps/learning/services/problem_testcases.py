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
    # Explicit declaration of what `stdin` actually contains — mirrors
    # TestCase.input_format (see models.py for the full rationale): "wire"
    # (ready to execute as-is) or "raw_text" (human-authored example text,
    # e.g. 's = "a", t = "b"', that every execution path must adapt first
    # — see services/judging/integration.py's _effective_stdin()). Kept as
    # its own field rather than inferred from `source`, since "stored"
    # does NOT reliably mean "wire" — sync_problem_test_cases() below
    # persists raw_text rows too.
    input_format: str = TestCase.INPUT_FORMAT_WIRE


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
                input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
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
                input_format=case.input_format,
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
        try:
            from .testcase_generator import generate_test_cases
            generated = generate_test_cases(
                title=exercise.title,
                description=exercise.description,
                difficulty=getattr(exercise, "difficulty", "Medium"),
            )
            for idx, tc_data in enumerate(generated, start=1):
                LabExerciseTestCase.objects.create(
                    exercise=exercise,
                    stdin=tc_data.get("stdin", ""),
                    expected_output=tc_data.get("expected_output", ""),
                    is_sample=(idx <= 2),
                    order=idx,
                )
            stored_cases = list(LabExerciseTestCase.objects.filter(exercise=exercise).order_by("order", "id"))
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Auto-generation of test cases for lab exercise %s skipped: %s", exercise.id, exc)

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
    """One-time promotion of Problem.examples into real TestCase rows for a
    problem that has none yet (see management commands seed_code2day.py /
    sync_problem_testcases.py). This does NOT adapt the text into wire
    format — it persists exactly what _build_example_test_cases() derived
    (raw, human-authored example text) — so every created row is honestly
    tagged input_format=raw_text, same as the ephemeral fallback. Fixing
    these up into proper wire-format test cases is the admin Problem
    Bank's job (its AI-generated test cases already save as "wire" via
    generic_testcase_generator.py) — this function's role is only to make
    sure a problem has *some* TestCase rows to iterate, not to guess a
    schema-driven wire encoding for them itself."""
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
            input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        created += 1

    return created
