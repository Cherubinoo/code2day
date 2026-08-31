"""
Shared parsing logic for importing the "merged reading QA dataset" Excel
format into the Reading Comprehension aptitude section — one
ReadingPassage per row of its "Reading Passages" sheet (already a full
merged article, not a single SQuAD paragraph), with a capped number of
its questions (from the "Questions & Answers" sheet, grouped by Passage
ID) turned into 4-option MCQs.

Expected workbook shape:
  Sheet "Reading Passages": Passage ID | Title | Merged Reading Passage | ...
  Sheet "Questions & Answers": Passage ID | Question No. | Question | Answer | ...

Like the SQuAD import this replaces, the source data only gives a
correct-answer string per question, no wrong options, so each
question's 3 distractors are drawn from the *other* correct answers
under the same passage (real, contextually-plausible text — just wrong
for this specific question). A question is skipped if its passage
doesn't have at least 3 other distinct answers to draw from.

Used by both `manage.py import_reading_qa_dataset` (file on the server)
and the admin file-upload endpoint (uploaded through the UI) — kept as
one function so the two stay in sync.
"""

import random

OPTION_LETTERS = ["A", "B", "C", "D"]

PASSAGES_SHEET = "Reading Passages"
QA_SHEET = "Questions & Answers"


def parse_workbook_to_passages(wb, limit=20, questions_per_passage=10, difficulty="Medium", seed=42):
    """
    Args:
        wb: an openpyxl Workbook already loaded from the uploaded file.
        limit: max number of passages (rows in the Reading Passages sheet) to convert.
        questions_per_passage: max questions to keep per passage (source
            data can have hundreds per passage — far too many for one
            student-facing reading session).
        difficulty: difficulty string to assign to every produced question.
        seed: random seed, for reproducible distractor/option shuffling
            and which questions get sampled when over questions_per_passage.

    Returns:
        (passages, questions_skipped) — same shape as
        squad_import.parse_squad_to_passages, so create_passages_in_db
        works unchanged: passages is a list of
        {"title", "passage_text", "difficulty", "questions": [
            {"question_text", "options": [A,B,C,D], "correct_option"}
        ]}.
    """
    if PASSAGES_SHEET not in wb.sheetnames or QA_SHEET not in wb.sheetnames:
        raise ValueError(
            f"Expected sheets {PASSAGES_SHEET!r} and {QA_SHEET!r} — "
            f"found {wb.sheetnames!r} instead."
        )

    rng = random.Random(seed)

    # ── Load passages (Passage ID -> {title, passage_text}) ────────────
    pws = wb[PASSAGES_SHEET]
    header = [str(c.value).strip() if c.value else "" for c in pws[1]]
    col = {name: i for i, name in enumerate(header)}
    required = ["Passage ID", "Title", "Merged Reading Passage"]
    missing = [c for c in required if c not in col]
    if missing:
        raise ValueError(f"'{PASSAGES_SHEET}' sheet is missing column(s): {', '.join(missing)}")

    passage_meta = {}
    passage_order = []
    for row in pws.iter_rows(min_row=2, values_only=True):
        if not row or all(v is None for v in row):
            continue
        pid = row[col["Passage ID"]]
        title = row[col["Title"]]
        text = row[col["Merged Reading Passage"]]
        if not pid or not title or not text:
            continue
        pid = str(pid).strip()
        if pid in passage_meta:
            continue
        passage_meta[pid] = {"title": str(title).strip(), "passage_text": str(text).strip()}
        passage_order.append(pid)
        if len(passage_order) >= limit:
            break

    if not passage_order:
        raise ValueError(f"No usable rows found in '{PASSAGES_SHEET}' (need Passage ID/Title/Merged Reading Passage).")

    # ── Load questions, grouped by Passage ID, only for passages we kept ─
    qws = wb[QA_SHEET]
    qheader = [str(c.value).strip() if c.value else "" for c in qws[1]]
    qcol = {name: i for i, name in enumerate(qheader)}
    q_required = ["Passage ID", "Question", "Answer"]
    q_missing = [c for c in q_required if c not in qcol]
    if q_missing:
        raise ValueError(f"'{QA_SHEET}' sheet is missing column(s): {', '.join(q_missing)}")

    wanted = set(passage_order)
    questions_by_passage = {pid: [] for pid in passage_order}
    for row in qws.iter_rows(min_row=2, values_only=True):
        if not row or all(v is None for v in row):
            continue
        pid = row[qcol["Passage ID"]]
        if pid is None:
            continue
        pid = str(pid).strip()
        if pid not in wanted:
            continue
        question_text = row[qcol["Question"]]
        answer = row[qcol["Answer"]]
        if not question_text or not answer:
            continue
        questions_by_passage[pid].append({
            "question_text": str(question_text).strip(),
            "answer": str(answer).strip(),
        })

    # ── Build MCQs per passage, capped at questions_per_passage ─────────
    passages = []
    questions_skipped = 0
    for pid in passage_order:
        qa_rows = questions_by_passage.get(pid, [])
        if not qa_rows:
            continue

        distinct_answers = list(dict.fromkeys(qa["answer"] for qa in qa_rows))

        # Sample which questions to use *before* building distractors, so
        # a passage with hundreds of questions doesn't need to build MCQs
        # for all of them just to throw most away.
        candidates = qa_rows[:]
        rng.shuffle(candidates)

        passage_questions = []
        for qa in candidates:
            if len(passage_questions) >= questions_per_passage:
                break
            correct = qa["answer"]
            distractor_pool = [a for a in distinct_answers if a != correct]
            if len(distractor_pool) < 3:
                questions_skipped += 1
                continue

            distractors = rng.sample(distractor_pool, 3)
            options = distractors + [correct]
            rng.shuffle(options)
            correct_letter = OPTION_LETTERS[options.index(correct)]

            passage_questions.append({
                "question_text": qa["question_text"],
                "options": options,
                "correct_option": correct_letter,
            })

        if not passage_questions:
            continue

        meta = passage_meta[pid]
        passages.append({
            "title": meta["title"],
            "passage_text": meta["passage_text"],
            "difficulty": difficulty,
            "questions": passage_questions,
            "qas_in_paragraph": len(qa_rows),
        })

    return passages, questions_skipped


def create_passages_in_db(passages, topic=None):
    """Persist a `passages` list (from parse_workbook_to_passages) as
    ReadingPassage + AptitudeQuestion rows, optionally filed under an
    AptitudeTopic. Returns (passages_created, questions_created). Caller
    is responsible for wrapping in a transaction if atomicity across the
    whole batch is desired."""
    from apps.learning.models import AptitudeQuestion, ReadingPassage

    passages_created = 0
    questions_created = 0
    for p in passages:
        passage = ReadingPassage.objects.create(
            title=p["title"], passage_text=p["passage_text"], difficulty=p["difficulty"], topic=topic,
        )
        for pq in p["questions"]:
            AptitudeQuestion.objects.create(
                passage=passage,
                question_type="RC",
                question_text=pq["question_text"],
                option_a=pq["options"][0], option_b=pq["options"][1],
                option_c=pq["options"][2], option_d=pq["options"][3],
                correct_option=pq["correct_option"],
                difficulty=p["difficulty"],
            )
        passages_created += 1
        questions_created += len(p["questions"])

    return passages_created, questions_created
