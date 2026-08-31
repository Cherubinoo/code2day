"""
Import a SQuAD-format JSON file (e.g. train-v1.1.json / dev-v1.1.json) into
the Reading Comprehension aptitude section. See
apps.learning.services.squad_import for how paragraphs/questions/
distractors are derived.

This is meant to be run manually, not wired into `migrate`. Defaults to a
dry run; pass --apply to actually write.

Usage:
    python manage.py import_squad_reading_comprehension --file dev-v1.1.json                 # dry run, first 20 paragraphs
    python manage.py import_squad_reading_comprehension --file dev-v1.1.json --limit 100 --apply

The same import is also available to admins from the dashboard (Aptitude
Bank -> Reading Passages -> Import SQuAD JSON), for datasets small enough
to upload through the browser without needing server access.
"""

import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.learning.services.squad_import import create_passages_in_db, parse_squad_to_passages


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
        seed = options["seed"]

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            raise CommandError(f"File not found: {file_path}")
        except json.JSONDecodeError as exc:
            raise CommandError(f"Not valid JSON: {exc}")

        try:
            passages, questions_skipped = parse_squad_to_passages(data, limit=limit, difficulty=difficulty, seed=seed)
        except ValueError as exc:
            raise CommandError(str(exc))

        self.stdout.write(f"{'APPLYING' if apply_changes else 'DRY RUN'} — scanning up to {limit} paragraph(s).\n")
        for p in passages:
            skipped_here = p["qas_in_paragraph"] - len(p["questions"])
            self.stdout.write(f"  Passage: {p['title']!r} — {len(p['questions'])} question(s) ({skipped_here} skipped, not enough distractors)")

        passages_created = questions_created = 0
        if apply_changes:
            with transaction.atomic():
                passages_created, questions_created = create_passages_in_db(passages)
        else:
            passages_created = len(passages)
            questions_created = sum(len(p["questions"]) for p in passages)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if apply_changes else 'Would create'}: {passages_created} passage(s), "
            f"{questions_created} question(s). Skipped {questions_skipped} question(s) with fewer "
            f"than 3 distractor candidates in their paragraph."
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run — re-run with --apply to write these changes."))
