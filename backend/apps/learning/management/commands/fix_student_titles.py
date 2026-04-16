from django.core.management.base import BaseCommand
from apps.learning.models import StudentProfile


class Command(BaseCommand):
    help = "Clear 'Imported from college admission database' titles from students"

    def handle(self, *args, **options):
        count = StudentProfile.objects.filter(
            title="Imported from college admission database"
        ).update(title="")
        self.stdout.write(self.style.SUCCESS(f"Updated {count} student(s)"))
