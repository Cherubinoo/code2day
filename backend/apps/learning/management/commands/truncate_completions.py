"""
Management command to truncate (clear) all student completion history.

Usage:
    python manage.py truncate_completions
    python manage.py truncate_completions --dry-run  # Preview what would be deleted
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.learning.models import ProblemSolution, SolvedProblem, Submission, StudentActivity


class Command(BaseCommand):
    help = "Remove all completion history for all students (SolvedProblem, ProblemSolution, etc.)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be deleted without actually deleting",
        )
        parser.add_argument(
            "--keep-sessions",
            action="store_true",
            help="Keep problem session records (only clear completions)",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        keep_sessions = options["keep_sessions"]

        # Count records
        solved_count = SolvedProblem.objects.count()
        solution_count = ProblemSolution.objects.count()
        submission_count = Submission.objects.count()
        activity_count = StudentActivity.objects.filter(activity_type="solve").count()

        total = solved_count + solution_count + submission_count + activity_count

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No completion records found. Nothing to truncate."))
            return

        self.stdout.write("=" * 60)
        self.stdout.write("COMPLETION TRUNCATION SUMMARY")
        self.stdout.write("=" * 60)
        self.stdout.write(f"  SolvedProblem records:     {solved_count}")
        self.stdout.write(f"  ProblemSolution records:   {solution_count}")
        self.stdout.write(f"  Submission records:        {submission_count}")
        self.stdout.write(f"  StudentActivity (solve):   {activity_count}")
        self.stdout.write("-" * 60)
        self.stdout.write(f"  TOTAL RECORDS TO DELETE:   {total}")
        self.stdout.write("=" * 60)

        if dry_run:
            self.stdout.write(self.style.WARNING("\nDRY RUN - No records were deleted."))
            self.stdout.write("Run without --dry-run to actually delete.\n")
            return

        # Confirm deletion
        self.stdout.write("\n")
        self.stdout.write(self.style.WARNING("WARNING: This will permanently delete all completion history!"))
        
        # Execute deletion
        with transaction.atomic():
            # Delete in order to respect foreign keys
            deleted_solved = SolvedProblem.objects.all().count()
            SolvedProblem.objects.all().delete()

            deleted_solutions = ProblemSolution.objects.all().count()
            ProblemSolution.objects.all().delete()

            deleted_submissions = Submission.objects.all().count()
            Submission.objects.all().delete()

            deleted_activities = StudentActivity.objects.filter(activity_type="solve").count()
            StudentActivity.objects.filter(activity_type="solve").delete()

            self.stdout.write(self.style.SUCCESS(f"\n✓ Deleted {deleted_solved} SolvedProblem records"))
            self.stdout.write(self.style.SUCCESS(f"✓ Deleted {deleted_solutions} ProblemSolution records"))
            self.stdout.write(self.style.SUCCESS(f"✓ Deleted {deleted_submissions} Submission records"))
            self.stdout.write(self.style.SUCCESS(f"✓ Deleted {deleted_activities} StudentActivity (solve) records"))

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("ALL COMPLETION HISTORY TRUNCATED SUCCESSFULLY"))
        self.stdout.write("=" * 60)
        self.stdout.write("\nAll students now have 0 solved problems.")
        self.stdout.write("The problem set and student accounts remain intact.\n")
