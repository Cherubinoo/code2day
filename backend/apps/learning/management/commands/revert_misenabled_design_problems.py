"""
One-time data fix: the generic judging framework (services/judging/) supports
ONLY single-function problems — it has zero awareness of class-based "design"
problems (a constructor plus multiple callable methods, e.g. an Iterator with
__init__/next/hasNext, or LRUCache's get/put). The admin bulk sweeps
("Generate Judge Schemas" / "Validate & Enable Judge") were nonetheless
generating a function-only generic_schema for design-shaped problems too (the
LLM faithfully captured just ONE of the class's methods), that schema passed
structural validation (it's a syntactically fine function schema), and
Problem.uses_generic_judge got flipped on — after which the problem is
unrunnable via the new framework, even though the legacy execution path
(services/param_types.py + services/execution_adapter.py) already runs design
problems correctly today.

This command finds every Problem with uses_generic_judge=True whose legacy
param_schema is design-shaped (param_types.is_design_schema()) and reverts
uses_generic_judge to False, routing execution back through the
already-working legacy path (see views.execute_problem_test_case_batch's
is_design_schema() branch). Not wired into `migrate`; run it manually.
Defaults to a dry run.

Usage:
    python manage.py revert_misenabled_design_problems             # dry run (default)
    python manage.py revert_misenabled_design_problems --apply      # actually writes
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.learning.models import Problem
from apps.learning.services.param_types import is_design_schema


class Command(BaseCommand):
    help = "Revert uses_generic_judge=True on design-shaped problems the generic judge can't actually run."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write the changes. Without this flag, only a preview is printed.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]

        candidates = Problem.objects.filter(uses_generic_judge=True).order_by("title")
        total = candidates.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No problems have uses_generic_judge=True — nothing to check."))
            return

        self.stdout.write(f"{'APPLYING' if apply_changes else 'DRY RUN'} — checking {total} generic-judge-enabled problem(s).\n")

        reverted = 0
        with transaction.atomic():
            for problem in candidates.iterator():
                if not is_design_schema(problem.param_schema):
                    continue
                reverted += 1
                self.stdout.write(f"  {problem.id}: {problem.title!r} — design-shaped, reverting to legacy execution")
                if apply_changes:
                    problem.uses_generic_judge = False
                    problem.save(update_fields=["uses_generic_judge"])

            if not apply_changes:
                transaction.set_rollback(True)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Reverted' if apply_changes else 'Would revert'}: {reverted} design-shaped problem(s) out of {total} checked."
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run — re-run with --apply to write these changes."))
