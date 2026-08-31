"""
Shared parsing logic for importing a SQuAD-format JSON dataset into the
Reading Comprehension aptitude section — one ReadingPassage per SQuAD
paragraph, with its questions turned into 4-option MCQs.

SQuAD only gives a correct answer span per question, no wrong options, so
each question's 3 distractors are drawn from the *other* correct answers
in the same paragraph (real, contextually-plausible text pulled from the
same passage — just wrong for this specific question). A question is
skipped if its paragraph doesn't have at least 3 other distinct answers
to draw from, rather than inventing a low-quality distractor.

Used by both `manage.py import_squad_reading_comprehension` (file on the
server) and the admin file-upload endpoint (uploaded through the UI) —
kept as one function so the two stay in sync.
"""

import random

OPTION_LETTERS = ["A", "B", "C", "D"]


def parse_squad_to_passages(data, limit=20, difficulty="Medium", seed=42):
    """
    Args:
        data: parsed SQuAD v1.1 JSON (dict with a top-level "data" key).
        limit: max number of paragraphs (passages) to convert.
        difficulty: difficulty string to assign to every produced question.
        seed: random seed, for reproducible distractor/option shuffling.

    Returns:
        (passages, questions_skipped) where `passages` is a list of
        {"title", "passage_text", "difficulty", "questions": [
            {"question_text", "options": [A,B,C,D], "correct_option"}
        ]}, and `questions_skipped` is a count of questions dropped for
        not having 3 distinct distractor candidates in their paragraph.
    """
    articles = data.get("data", [])
    if not articles:
        raise ValueError("No articles found under a top-level 'data' key — is this a SQuAD v1.1 file?")

    rng = random.Random(seed)
    passages = []
    questions_skipped = 0
    paragraphs_seen = 0

    for article in articles:
        if paragraphs_seen >= limit:
            break
        article_title = article.get("title", "Untitled").replace("_", " ")
        for paragraph in article.get("paragraphs", []):
            if paragraphs_seen >= limit:
                break
            paragraphs_seen += 1

            context = (paragraph.get("context") or "").strip()
            qas = paragraph.get("qas", [])
            if not context or not qas:
                continue

            # Every distinct correct-answer text in this paragraph — the
            # pool distractors get drawn from.
            answers_by_qid = {}
            for qa in qas:
                answers = qa.get("answers") or []
                if not answers:
                    continue
                answers_by_qid[qa["id"]] = answers[0]["text"].strip()

            distinct_answers = list(dict.fromkeys(answers_by_qid.values()))  # de-dup, keep order

            passage_questions = []
            for qa in qas:
                qid = qa.get("id")
                correct = answers_by_qid.get(qid)
                if not correct:
                    continue

                distractor_pool = [a for a in distinct_answers if a != correct]
                if len(distractor_pool) < 3:
                    questions_skipped += 1
                    continue

                distractors = rng.sample(distractor_pool, 3)
                options = distractors + [correct]
                rng.shuffle(options)
                correct_letter = OPTION_LETTERS[options.index(correct)]

                passage_questions.append({
                    "question_text": qa.get("question", "").strip(),
                    "options": options,
                    "correct_option": correct_letter,
                })

            if not passage_questions:
                continue

            passages.append({
                "title": f"{article_title} ({paragraphs_seen})",
                "passage_text": context,
                "difficulty": difficulty,
                "questions": passage_questions,
                "qas_in_paragraph": len(qas),
            })

    return passages, questions_skipped


def create_passages_in_db(passages, topic=None):
    """Persist a `passages` list (from parse_squad_to_passages) as
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
