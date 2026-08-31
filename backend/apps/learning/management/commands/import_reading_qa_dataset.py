"""
Import the "merged reading QA dataset" Excel file (two sheets: "Reading
Passages" and "Questions & Answers") into the Reading Comprehension
aptitude section. See apps.learning.services.reading_qa_import for how
passages/questions/distractors are derived.

This is meant to be run manually, not wired into `migrate`. Defaults to
a dry run; pass --apply to actually write.

Usage:
    python manage.py import_reading_qa_dataset --file merged_reading_qa_dataset.xlsx                 # dry run, first 20 passages, 10 questions each
    python manage.py import_reading_qa_dataset --file merged_reading_qa_dataset.xlsx --limit 48 --questions-per-passage 8 --apply

The same import is also available to admins from the dashboard (Aptitude
Bank -> Reading Passages -> Import Reading Q&A Excel), for datasets small
enough to upload through the browser without needing server access.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.learning.services.reading_qa_import import create_passages_in_db, parse_workbook_to_passages


class Command(BaseCommand):
    help = "Import the merged reading QA dataset Excel file into the Reading Comprehension aptitude section."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to the merged_reading_qa_dataset.xlsx file.")
        parser.add_argument("--limit", type=int, default=20, help="Max number of passages to import (default: 20).")
        parser.add_argument("--questions-per-passage", type=int, default=10, help="Max questions to keep per passage — source data can have hundreds (default: 10).")
        parser.add_argument("--difficulty", default="Medium", choices=["Easy", "Medium", "Hard"], help="Difficulty to assign to every imported question (default: Medium).")
        parser.add_argument("--apply", action="store_true", help="Actually write the changes. Without this flag, only a preview is printed.")
        parser.add_argument("--seed", type=int, default=42, help="Random seed for shuffling distractors/options/question sampling (default: 42, for reproducible imports).")
        parser.add_argument("--topic-id", type=int, default=None, help="AptitudeTopic id to file every imported passage under (optional — passages can also be left unfiled/topicless).")

    def handle(self, *args, **options):
        file_path = options["file"]
        limit = options["limit"]
        questions_per_passage = options["questions_per_passage"]
        difficulty = options["difficulty"]
        apply_changes = options["apply"]
        seed = options["seed"]
        topic_id = options["topic_id"]

        topic = None
        if topic_id:
            from apps.learning.models import AptitudeTopic
            topic = AptitudeTopic.objects.filter(id=topic_id).first()
            if not topic:
                raise CommandError(f"No AptitudeTopic with id={topic_id}")

        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True)
        except FileNotFoundError:
            raise CommandError(f"File not found: {file_path}")
        except Exception as exc:
            raise CommandError(f"Could not read workbook: {exc}")

        try:
            passages, questions_skipped = parse_workbook_to_passages(
                wb, limit=limit, questions_per_passage=questions_per_passage, difficulty=difficulty, seed=seed,
            )
        except ValueError as exc:
            raise CommandError(str(exc))

        self.stdout.write(f"{'APPLYING' if apply_changes else 'DRY RUN'} — scanning up to {limit} passage(s), {questions_per_passage} question(s) each.\n")
        for p in passages:
            skipped_here = p["qas_in_paragraph"] - len(p["questions"])
            self.stdout.write(f"  Passage: {p['title']!r} — {len(p['questions'])} question(s) kept "
                               f"(of {p['qas_in_paragraph']} available, {skipped_here} not used)")

        passages_created = questions_created = 0
        if apply_changes:
            with transaction.atomic():
                passages_created, questions_created = create_passages_in_db(passages, topic=topic)
        else:
            passages_created = len(passages)
            questions_created = sum(len(p["questions"]) for p in passages)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if apply_changes else 'Would create'}: {passages_created} passage(s), "
            f"{questions_created} question(s). Skipped {questions_skipped} question(s) with fewer "
            f"than 3 distractor candidates in their passage."
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run — re-run with --apply to write these changes."))
