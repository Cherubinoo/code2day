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

# "Implementation of X" / "Design of X" / ... — a noun-phrase title whose
# leading noun has a matching imperative verb. Matched with a required
# "\s+of\s+" boundary so "Implementation of X" isn't mistaken for the verb
# "implement" (a bare .startswith("implement") check does match
# "implementation", which produced the grammatically broken Aim "To
# implementation of X." before this fix).
_NOUN_OF_RE = re.compile(r'^(implementation|design|development|creation|construction)\s+of\s+(.*)$', re.IGNORECASE | re.DOTALL)
_NOUN_TO_VERB = {
    "implementation": "implement", "design": "design", "development": "develop",
    "creation": "create", "construction": "construct",
}
_VERB_TO_NOUN = {v: k for k, v in _NOUN_TO_VERB.items()}

# "Write a/an/the ... program to X" — captures the "... program" phrase
# (e.g. "a C++ program") and the task after "to", so the noun form can drop
# just the leading "Write" ("the C++ program to X") instead of discarding
# the whole sentence down to "the program".
_WRITE_PROGRAM_RE = re.compile(r'^write\s+(?:a|an|the)\s+(.*?\bprogram)\s+to\s+(.*)$', re.IGNORECASE | re.DOTALL)

# A bare imperative verb ("Implement a stack using two queues") with no
# "... of ..." noun-phrase counterpart already on file.
_VERB_RE = re.compile(r'^(implement|design|develop|create|build|construct)\s+(.*)$', re.IGNORECASE | re.DOTALL)


def _lead_phrase(title):
    """Exercise titles come in two shapes: an imperative instruction
    ("Write a C++ program to implement X", "Implement X") or an already
    nominal one ("Implementation of X", "X Traversal"). Returns
    (imperative, noun) — imperative is used for Aim ("To {imperative}."),
    noun for Result ("Thus the {noun} was successfully executed.") —
    derived from the same parse so the two sections describe the exercise
    consistently instead of each re-parsing the title independently.
    """
    title = (title or "").strip().rstrip(".")
    if not title:
        return "write and execute a program", "program"

    lowered_first = title[0].lower() + title[1:]

    m = _NOUN_OF_RE.match(lowered_first)
    if m:
        verb = _NOUN_TO_VERB[m.group(1).lower()]
        return f"{verb} {m.group(2)}", lowered_first

    m = _WRITE_PROGRAM_RE.match(lowered_first)
    if m:
        return lowered_first, f"{m.group(1)} to {m.group(2)}"

    m = _VERB_RE.match(lowered_first)
    if m:
        noun = _VERB_TO_NOUN[m.group(1).lower()]
        return lowered_first, f"{noun} of {m.group(2)}"

    return f"write a program to {title.lower()}", title.lower()


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


def build_code_aware_algorithm(exercise_title, problem_statement, code, language):
    """Constructs a clear, numbered step-by-step algorithm from exercise metadata
    and student code structure as a reliable fallback when LLM API is unavailable."""
    title_clean = (exercise_title or "the program").strip().rstrip(".")
    lang_clean = (language or "c++").strip()

    steps = [
        f"1. Start the program execution in {lang_clean}.",
        f"2. Include necessary header files/libraries and declare required data structures.",
    ]

    code_str = code or ""
    has_input = any(kw in code_str for kw in ("cin", "scanf", "readline", "input(", "Scanner", "sys.stdin", "gets"))
    has_loop = any(kw in code_str for kw in ("for", "while", "do"))
    has_condition = any(kw in code_str for kw in ("if", "switch"))
    has_func = any(kw in code_str for kw in ("def ", "void ", "int ", "class ", "function"))

    if has_input:
        steps.append(f"3. Read input values and test parameters according to {title_clean}.")
    else:
        steps.append(f"3. Initialize the problem input variables and data bounds.")

    if has_func:
        steps.append("4. Invoke procedural/functional logic passing input parameters.")

    if has_loop and has_condition:
        steps.append("5. Traverse data structures using loops while checking conditional constraints.")
    elif has_loop:
        steps.append("5. Iterate through input elements sequentially to compute intermediate values.")
    elif has_condition:
        steps.append("5. Evaluate logical conditions to branch execution flow appropriately.")
    else:
        steps.append(f"5. Perform calculation and algorithmic processing for {title_clean}.")

    steps.append("6. Print the processed results to standard output.")
    steps.append("7. Terminate execution cleanly.")

    return "\n".join(steps)


QUESTION_ALGORITHM_PROMPT = """You are writing the official "Algorithm" section of a student's lab record for a programming exercise.

Exercise Title: {title}

Problem statement:
{problem_statement}

Write a clear, numbered step-by-step algorithm (Step 1, Step 2, ...) describing the standard algorithmic approach to solve this exercise. Keep it concise (5-9 steps), written in plain algorithmic pseudocode style suitable for a computer science lab record.

Respond with ONLY the numbered steps (Step 1, Step 2, ...), no title, no commentary, no markdown code blocks.
"""


def generate_question_algorithm(exercise_title, problem_statement):
    prompt = QUESTION_ALGORITHM_PROMPT.format(
        title=exercise_title or "Programming Exercise",
        problem_statement=problem_statement or "(no problem statement available)",
    )
    return generate_text_with_fallback(prompt, log_label="question algorithm").strip()


def build_question_step_algorithm(exercise_title, problem_statement):
    title_clean = (exercise_title or "the problem").strip().rstrip(".")
    lead, _ = _lead_phrase(title_clean)

    return (
        f"1. Start the program execution.\n"
        f"2. Declare required variables, arrays, and memory structures for {title_clean}.\n"
        f"3. Read input parameters and test values from standard input.\n"
        f"4. Perform algorithmic processing: {lead}.\n"
        f"5. Process elements step-by-step according to problem criteria.\n"
        f"6. Output the computed results to standard output.\n"
        f"7. Terminate execution."
    )


def get_or_generate_question_algorithm(exercise):
    """Retrieves or generates the ONE single canonical algorithm for a Question (LabExercise).
    Shared across ALL students taking the lab — zero per-student LLM calls!
    """
    if exercise.explanation and not exercise.explanation.startswith("(") and len(exercise.explanation.strip()) >= 15:
        return exercise.explanation.strip()

    problem_statement = extract_problem_statement(exercise.description)
    try:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                generate_question_algorithm,
                exercise_title=exercise.title,
                problem_statement=problem_statement,
            )
            algo = future.result(timeout=10.0)
            if algo and not algo.startswith("(") and len(algo.strip()) >= 15:
                exercise.explanation = algo
                exercise.save(update_fields=["explanation"])
                return algo
    except Exception as exc:
        logger.warning("LLM question algorithm generation failed for exercise %s: %s", exercise.id, exc)

    algo = build_question_step_algorithm(exercise.title, problem_statement)
    exercise.explanation = algo
    exercise.save(update_fields=["explanation"])
    return algo


def build_result(exercise_title, all_passed=None):
    """Names the exercise in the Result line (e.g. "Thus the implementation
    of Single Dimensional Arrays in C++ was successfully executed."),
    reusing the same noun-phrase derivation as build_aim() so Aim and
    Result describe the exercise the same way."""
    _, noun = _lead_phrase(exercise_title)
    if all_passed is True:
        return f"Thus the {noun} was successfully executed and the output was verified."
    if all_passed is False:
        return f"The {noun} was executed; some outputs did not match the expected result."
    return f"Thus the {noun} was successfully executed."
