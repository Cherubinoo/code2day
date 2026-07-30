"""
Management command: remove_sql_problems
========================================
Deletes all Problem records that are SQL-related, identified by EITHER:
  1. tags JSONField contains "SQL"  (e.g. tags=["SQL", "Database"])
  2. description contains "SQL Schema"  (LeetCode-style SQL problems that
     embed their table schema in the description)

Cascades to: Submission, ProblemSolution, SolvedProblem, ExecutionRecord,
             TestCase, DailyProblem, ContestSubmission (via Problem FK).

Usage
-----
# Dry-run (safe — prints what WOULD be deleted, touches nothing):
    python manage.py remove_sql_problems

# Actually delete:
    python manage.py remove_sql_problems --confirm

Run this on the server after deploying. The command is idempotent —
re-running after completion will report 0 SQL problems found.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q


class Command(BaseCommand):
    help = (
        "Remove all SQL problems — matched by SQL tag OR 'SQL Schema' in description — "
        "and their related data."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            default=False,
            help="Actually perform the deletion. Without this flag the command runs as a dry-run.",
        )

    def handle(self, *args, **options):
        from apps.learning.models import (
            Problem,
            Submission,
            ProblemSolution,
            SolvedProblem,
            ExecutionRecord,
            TestCase,
            DailyProblem,
            ContestSubmission,
        )

        dry_run = not options["confirm"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\n[DRY RUN] No changes will be made. "
                    "Pass --confirm to execute.\n"
                )
            )

        # ── Find SQL problems ────────────────────────────────────────────────
        # Match EITHER:
        #   • tags JSONField contains the string "SQL"
        #   • description contains the literal text "SQL Schema"
        sql_problems = Problem.objects.filter(
            Q(tags__contains=["SQL"]) |
            Q(description__icontains="SQL Schema")
        ).distinct()

        count = sql_problems.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No SQL problems found. Nothing to do."))
            return

        # Breakdown by match reason
        by_tag    = Problem.objects.filter(tags__contains=["SQL"]).count()
        by_schema = Problem.objects.filter(description__icontains="SQL Schema").exclude(
                        tags__contains=["SQL"]).count()

        self.stdout.write(f"\nFound {count} SQL problem(s) to remove:")
        self.stdout.write(f"  • {by_tag}  matched by SQL tag")
        self.stdout.write(f"  • {by_schema}  matched by 'SQL Schema' in description (no SQL tag)\n")

        # ── Count related records for reporting ─────────────────────────────
        problem_ids = list(sql_problems.values_list("id", flat=True))

        sub_count        = Submission.objects.filter(problem_id__in=problem_ids).count()
        sol_count        = ProblemSolution.objects.filter(problem_id__in=problem_ids).count()
        solved_count     = SolvedProblem.objects.filter(problem_id__in=problem_ids).count()
        exec_count       = ExecutionRecord.objects.filter(problem_id__in=problem_ids).count()
        tc_count         = TestCase.objects.filter(problem_id__in=problem_ids).count()
        daily_count      = DailyProblem.objects.filter(problem_id__in=problem_ids).count()
        contest_sub_count = ContestSubmission.objects.filter(problem_id__in=problem_ids).count()

        # Print problem list
        for p in sql_problems.order_by("id"):
            self.stdout.write(f"  [{p.id:>6}] {p.title[:70]}")

        self.stdout.write("\nRelated records that will also be deleted (cascade):")
        self.stdout.write(f"  Submissions         : {sub_count}")
        self.stdout.write(f"  ProblemSolutions    : {sol_count}")
        self.stdout.write(f"  SolvedProblems      : {solved_count}")
        self.stdout.write(f"  ExecutionRecords    : {exec_count}")
        self.stdout.write(f"  TestCases           : {tc_count}")
        self.stdout.write(f"  DailyProblem refs   : {daily_count}")
        self.stdout.write(f"  ContestSubmissions  : {contest_sub_count}")

        total_non_sql = Problem.objects.exclude(tags__contains=["SQL"]).count()
        self.stdout.write(f"\nNon-SQL problems (will remain untouched): {total_non_sql}")

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\n[DRY RUN COMPLETE] Re-run with --confirm to actually delete.\n"
                )
            )
            return

        # ── Perform deletion inside a transaction ────────────────────────────
        self.stdout.write(self.style.WARNING("\nDeleting..."))

        with transaction.atomic():
            deleted, breakdown = sql_problems.delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Deleted {deleted} total records.\nBreakdown: {breakdown}\n"
            )
        )

        # Sanity check
        remaining_sql = Problem.objects.filter(
            Q(tags__contains=["SQL"]) |
            Q(description__icontains="SQL Schema")
        ).count()
        remaining_all = Problem.objects.count()
        self.stdout.write(
            f"SQL problems remaining : {remaining_sql}\n"
            f"Total problems remaining: {remaining_all}\n"
        )

        if remaining_sql == 0:
            self.stdout.write(self.style.SUCCESS("All SQL problems successfully removed."))
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"WARNING: {remaining_sql} SQL problem(s) still present. Check manually."
                )
            )
