"""
Generates the content sections of a student's "lab record" for a completed
LabExercise: Aim (derived from the exercise title), Algorithm (LLM-written,
from the problem statement + the student's own submitted code), Program
(the code itself), Output (captured by actually running the code), and a
templated Result line.

Rendering to PDF lives in lab_report_pdf.py — this module only produces the
text content.
"""

import logging
import re

from .testcase_generator import generate_text_with_fallback, TestCaseGenError

logger = logging.getLogger(__name__)

ALGORITHM_PROMPT = """You are writing the "Algorithm" section of a student's lab record for a programming exercise.

Problem statement:
{problem_statement}

The student's program (in {language}):
{code}

Write a clear, numbered step-by-step algorithm (Step 1, Step 2, ...) describing the
approach used in the program above. Keep it concise (6-12 steps), written in plain
algorithmic pseudocode style suitable for a lab record — describe the logic in
words/pseudocode, not program syntax.

Respond with ONLY the numbered steps, no title, no commentary, no markdown formatting.
"""


def extract_problem_statement(description):
    """LabExercise.description is a compiled blob (Problem Statement, then
    optional Examples:/Difficulty:/Hint: sections, in that order — see
    compileDescription() in frontend/StaffLabPanel.jsx). Pull out just the
    problem-statement portion for use as LLM context / the report's Aim."""
    if not description:
        return ""
    text = description.strip()
    # Cut off at the first "Examples:" / "Difficulty:" / "Hint:" section header.
    match = re.search(r"\n\s*(Examples:|Difficulty:|Hint:)", text)
    if match:
        text = text[: match.start()]
    return text.strip()


_IMPERATIVE_PREFIXES = (
    "write a", "write an", "write the", "implement", "design", "develop",
    "create a", "create an", "build a", "build an", "construct",
)


def _lead_phrase(title):
    """Exercise titles are often already a full imperative instruction
    ("Write a C++ program to implement...") rather than a short noun name
    ("Array Operations") — lowercase-and-prepend "write a program to" only
    for the latter, otherwise reuse the title as-is (lowercasing just its
    first letter, keeping the rest — e.g. "C++" — as authored) so we don't
    produce "To write a program to write a program to...".
    Returns (lead_phrase, already_imperative).
    """
    title = (title or "").strip().rstrip(".")
    if not title:
        return "write and execute a program", True
    lowered_first = title[0].lower() + title[1:]
    if lowered_first.startswith(_IMPERATIVE_PREFIXES):
        return lowered_first, True
    return f"write a program to {title.lower()}", False


def build_aim(exercise_title, problem_statement):
    lead, _ = _lead_phrase(exercise_title)
    return f"To {lead}."


def generate_algorithm(*, problem_statement, code, language):
    """Best-effort — raises TestCaseGenError on failure, caller decides
    what placeholder to show if generation isn't available."""
    prompt = ALGORITHM_PROMPT.format(
        problem_statement=problem_statement or "(no problem statement available)",
        language=language or "the submitted language",
        code=code or "",
    )
    return generate_text_with_fallback(prompt, log_label="lab report algorithm").strip()


def build_result(exercise_title, all_passed=None):
    # Deliberately generic — Aim already states the specific task, and
    # every attempt at re-stating the title grammatically here (for both
    # "Write a program to X" and short "X Operations" style titles at once)
    # produced awkward or doubled phrasing. "The program" reads correctly
    # regardless of title style.
    if all_passed is True:
        return "Thus the program was executed successfully and the output was verified."
    if all_passed is False:
        return "The program was executed; some outputs did not match the expected result."
    return "Thus the program was executed successfully."
