from django.core.management.base import BaseCommand

from apps.learning.models import Problem
from apps.learning.services.problem_testcases import sync_problem_test_cases


class Command(BaseCommand):
    help = "Create sample TestCase rows from Problem.examples when a problem has none."

    def handle(self, *args, **options):
        created_total = 0
        touched_problems = 0

        for problem in Problem.objects.all().order_by("id"):
            created = sync_problem_test_cases(problem)
            if not created:
                continue

            touched_problems += 1
            created_total += created
            self.stdout.write(
                self.style.SUCCESS(
                    f"{problem.slug}: created {created} sample testcase(s)."
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Finished. Added {created_total} testcase(s) across {touched_problems} problem(s)."
            )
        )
