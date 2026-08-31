"""
Import a SQuAD-format JSON file (e.g. train-v1.1.json / dev-v1.1.json) into
the Reading Comprehension aptitude section — one ReadingPassage per SQuAD
paragraph, with its questions turned into 4-option MCQs.

SQuAD only gives a correct answer span per question, no wrong options, so
each question's 3 distractors are drawn from the *other* correct answers
in the same paragraph (they're real, contextually-plausible text pulled
from the same passage — just wrong for this specific question). A
question is skipped if its paragraph doesn't have at least 3 other
distinct answers to draw from, rather than inventing a low-quality
distractor.

This is meant to be run manually, not wired into `migrate`. Defaults to a
dry run; pass --apply to actually write.

Usage:
    python manage.py import_squad_reading_comprehension --file dev-v1.1.json                 # dry run, first 20 paragraphs
    python manage.py import_squad_reading_comprehension --file dev-v1.1.json --limit 100 --apply
"""

import json
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.learning.models import AptitudeQuestion, ReadingPassage

OPTION_LETTERS = ["A", "B", "C", "D"]


class Command(BaseCommand):
    help = "Import a SQuAD-format JSON file into the Reading Comprehension aptitude section."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to a SQuAD v1.1 JSON file (train-v1.1.json / dev-v1.1.json).")
        parser.add_argument("--limit", type=int, default=20, help="Max number of paragraphs (passages) to import (default: 20).")
        parser.add_argument("--difficulty", default="Medium", choices=["Easy", "Medium", "Hard"], help="Difficulty to assign to every imported question (default: Medium).")
        parser.add_argument("--apply", action="store_true", help="Actually write the changes. Without this flag, only a preview is printed.")
        parser.add_argument("--seed", type=int, default=42, help="Random seed for shuffling distractors/options (default: 42, for reproducible imports).")

    def handle(self, *args, **options):
        file_path = options["file"]
        limit = options["limit"]
        difficulty = options["difficulty"]
        apply_changes = options["apply"]
        rng = random.Random(options["seed"])

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            raise CommandError(f"File not found: {file_path}")
        except json.JSONDecodeError as exc:
            raise CommandError(f"Not valid JSON: {exc}")

        articles = data.get("data", [])
        if not articles:
            raise CommandError("No articles found under a top-level 'data' key — is this a SQuAD v1.1 file?")

        self.stdout.write(f"{'APPLYING' if apply_changes else 'DRY RUN'} — scanning up to {limit} paragraph(s) from {len(articles)} article(s).\n")

        passages_created = 0
        questions_created = 0
        questions_skipped = 0
        paragraphs_seen = 0

        with transaction.atomic():
            for article in articles:
                article_title = article.get("title", "Untitled").replace("_", " ")
                for paragraph in article.get("paragraphs", []):
                    if paragraphs_seen >= limit:
                        break
                    paragraphs_seen += 1

                    context = (paragraph.get("context") or "").strip()
                    qas = paragraph.get("qas", [])
                    if not context or not qas:
                        continue

                    # Every distinct correct-answer text in this paragraph —
                    # the pool distractors get drawn from.
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

                    title = f"{article_title} ({paragraphs_seen})"
                    self.stdout.write(f"  Passage: {title!r} — {len(passage_questions)} question(s) "
                                       f"({len(qas) - len(passage_questions)} skipped, not enough distractors)")

                    if apply_changes:
                        passage = ReadingPassage.objects.create(
                            title=title, passage_text=context, difficulty=difficulty,
                        )
                        for pq in passage_questions:
                            AptitudeQuestion.objects.create(
                                passage=passage,
                                question_type="RC",
                                question_text=pq["question_text"],
                                option_a=pq["options"][0], option_b=pq["options"][1],
                                option_c=pq["options"][2], option_d=pq["options"][3],
                                correct_option=pq["correct_option"],
                                difficulty=difficulty,
                            )
                    passages_created += 1
                    questions_created += len(passage_questions)

                if paragraphs_seen >= limit:
                    break

            if not apply_changes:
                transaction.set_rollback(True)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if apply_changes else 'Would create'}: {passages_created} passage(s), "
            f"{questions_created} question(s). Skipped {questions_skipped} question(s) with fewer "
            f"than 3 distractor candidates in their paragraph."
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run — re-run with --apply to write these changes."))
