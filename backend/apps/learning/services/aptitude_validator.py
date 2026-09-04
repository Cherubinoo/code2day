"""
LLM-based correctness check for aptitude questions.

Given a question, its four options, and the answer letter currently marked
correct, asks an LLM to independently work out the right answer and flag
whether the question itself is well-formed. Reuses the same provider
rotation/fallback chain as test case generation (LLMProvider rows, tried
least-recently-used first) via generate_text_with_fallback().

Best-effort, same spirit as testcase_generator: the LLM can be wrong on
tricky/ambiguous questions, so this is meant as a spot-check admins trigger
per-question, not an infallible auto-grader.
"""

from .testcase_generator import (
    TestCaseGenError,
    generate_text_with_fallback,
    _extract_json,
)

VALID_OPTIONS = {"A", "B", "C", "D"}

PROMPT_TEMPLATE = """You are reviewing a multiple-choice aptitude question for a competitive-exam practice bank.

Question: {question_text}
Option A: {option_a}
Option B: {option_b}
Option C: {option_c}
Option D: {option_d}
Marked correct answer: Option {correct_option}
Difficulty: {difficulty}

Check:
1. Is the question text clear, self-contained, and answerable from the given information (not garbled, truncated, or missing data)?
2. Are the four options distinct and plausible, with exactly one of them correct?
3. Work out the correct answer yourself, step by step, and compare it against the marked correct answer above.

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{{"is_valid": true/false, "needs_rewrite": true/false, "correct_option": "A", "reason": "one or two sentences explaining your verdict", "fixed_question_text": "...", "fixed_option_a": "...", "fixed_option_b": "...", "fixed_option_c": "...", "fixed_option_d": "..."}}

Rules:
- "is_valid" is true only if the question is well-formed AND the marked correct answer is actually correct.
- "correct_option" must always be your own independently-computed correct answer (A/B/C/D) — never just a copy of the marked one.
- "needs_rewrite" is true only if the question text or options themselves are broken, ambiguous, or unanswerable — a wrong marked-answer-letter alone should be fixed by correcting "correct_option", not by rewriting the question.
- When "needs_rewrite" is true, "fixed_question_text"/"fixed_option_a" through "fixed_option_d" must be a corrected, self-contained rewrite that keeps the same topic/intent as the original but fixes what was broken, with "correct_option" matching the fixed version.
- When "needs_rewrite" is false, repeat the original question_text/options unchanged in those same fields.
"""


class AptitudeValidationError(TestCaseGenError):
    """Raised when the LLM's validation reply can't be parsed/trusted."""


def _parse_validation_reply(content):
    parsed = _extract_json(content)

    correct_option = str(parsed.get("correct_option", "")).strip().upper()
    if correct_option not in VALID_OPTIONS:
        raise AptitudeValidationError(
            f"LLM did not return a valid correct_option: {parsed.get('correct_option')!r}"
        )

    result = {
        "is_valid": bool(parsed.get("is_valid")),
        "needs_rewrite": bool(parsed.get("needs_rewrite")),
        "correct_option": correct_option,
        "reason": str(parsed.get("reason", "")).strip(),
    }

    if result["needs_rewrite"]:
        fixed = {
            "question_text": str(parsed.get("fixed_question_text", "")).strip(),
            "option_a": str(parsed.get("fixed_option_a", "")).strip(),
            "option_b": str(parsed.get("fixed_option_b", "")).strip(),
            "option_c": str(parsed.get("fixed_option_c", "")).strip(),
            "option_d": str(parsed.get("fixed_option_d", "")).strip(),
        }
        if not all(fixed.values()):
            raise AptitudeValidationError(
                "LLM flagged the question for rewrite but didn't supply a complete replacement."
            )
        result.update(fixed)

    return result


def validate_aptitude_question(*, question_text, option_a, option_b, option_c, option_d,
                                correct_option, difficulty=None):
    """Returns a dict: {is_valid, needs_rewrite, correct_option, reason, and
    (only when needs_rewrite) question_text/option_a-d holding the LLM's
    rewrite}. Raises a TestCaseGenError subclass if every provider fails."""
    prompt = PROMPT_TEMPLATE.format(
        question_text=question_text, option_a=option_a, option_b=option_b,
        option_c=option_c, option_d=option_d, correct_option=correct_option,
        difficulty=difficulty or "Medium",
    )
    content = generate_text_with_fallback(prompt, log_label="aptitude-validate")
    return _parse_validation_reply(content)


EXPLANATION_PROMPT_TEMPLATE = """You are reviewing the worked explanation for a multiple-choice aptitude question in a competitive-exam practice bank.

Question: {question_text}
Option A: {option_a}
Option B: {option_b}
Option C: {option_c}
Option D: {option_d}
Correct answer: Option {correct_option}
Current explanation: {explanation}

Work out the solution yourself, step by step, assuming the marked correct answer above is correct. Then check whether the current explanation correctly and clearly justifies that answer.

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{{"explanation_correct": true/false, "corrected_explanation": "..."}}

Rules:
- "explanation_correct" is true only if the current explanation is present, factually correct, and actually walks through how to reach Option {correct_option} specifically.
- "corrected_explanation" must always be a complete, clear, step-by-step explanation for why Option {correct_option} is correct — write your own regardless of "explanation_correct", so callers always have a fresh explanation ready. Keep it concise (2-5 sentences) unless the calculation genuinely needs more steps.
"""


class AptitudeExplanationCheckError(TestCaseGenError):
    """Raised when the LLM's explanation-check reply can't be parsed/trusted."""


def _parse_explanation_reply(content):
    parsed = _extract_json(content)
    corrected = str(parsed.get("corrected_explanation", "")).strip()
    if not corrected:
        raise AptitudeExplanationCheckError("LLM did not return a corrected_explanation.")
    return {
        "explanation_correct": bool(parsed.get("explanation_correct")),
        "corrected_explanation": corrected,
    }


def check_aptitude_explanation(*, question_text, option_a, option_b, option_c, option_d,
                                correct_option, explanation):
    """Returns {explanation_correct, corrected_explanation} — the latter is
    always a freshly-written explanation for the marked correct answer, so
    callers can just overwrite when explanation_correct is False. Raises a
    TestCaseGenError subclass if every provider fails."""
    prompt = EXPLANATION_PROMPT_TEMPLATE.format(
        question_text=question_text, option_a=option_a, option_b=option_b,
        option_c=option_c, option_d=option_d, correct_option=correct_option,
        explanation=explanation or "(none provided)",
    )
    content = generate_text_with_fallback(prompt, log_label="aptitude-explanation-check")
    return _parse_explanation_reply(content)
