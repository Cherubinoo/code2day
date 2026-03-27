from django.core.management.base import BaseCommand

from apps.learning.data import FALLBACK_DASHBOARD, FALLBACK_PROBLEMS
from apps.learning.models import Problem, StudentProfile


class Command(BaseCommand):
    help = "Seed demo data for the code-2day dashboard"

    def handle(self, *args, **options):
        profile, _ = StudentProfile.objects.get_or_create(
            name=FALLBACK_DASHBOARD["user"]["name"],
            defaults={
                "title": FALLBACK_DASHBOARD["user"]["title"],
                "current_streak": FALLBACK_DASHBOARD["user"]["streak"],
                "login_days": FALLBACK_DASHBOARD["user"]["loginDays"],
                "campus_rank": FALLBACK_DASHBOARD["user"]["rank"],
            },
        )

        for item in FALLBACK_PROBLEMS:
            Problem.objects.get_or_create(
                slug=item["slug"],
                defaults={
                    "title": item["title"],
                    "description": item["description"],
                    "difficulty": item["difficulty"],
                    "tags": item["tags"],
                    "is_daily": item["is_daily"],
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded code-2day demo data for {profile.name}."
            )
        )