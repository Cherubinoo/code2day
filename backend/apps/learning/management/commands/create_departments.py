from django.core.management.base import BaseCommand
from apps.learning.models import Department, Institution


class Command(BaseCommand):
    help = "Create departments with codes and names"

    DEPARTMENTS = {
        "243": "AD",
        "103": "Civil",
        "105": "EEE",
        "205": "IT",
        "244": "CSBS",
        "106": "ECE",
        "104": "CSE",
        "114": "Mech",
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--institution-id",
            type=int,
            default=9536,
            help="Institution ID to associate with departments",
        )

    def handle(self, *args, **options):
        institution_id = options["institution_id"]

        try:
            institution = Institution.objects.get(institution_id=institution_id)
        except Institution.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Institution with ID {institution_id} not found")
            )
            return

        self.stdout.write(f"Creating departments for: {institution.name}")
        self.stdout.write("-" * 40)

        created_count = 0
        existing_count = 0

        for code, name in self.DEPARTMENTS.items():
            dept, created = Department.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "institution": institution,
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created: {code} - {name}"))
                created_count += 1
            else:
                self.stdout.write(f"Exists: {code} - {name}")
                existing_count += 1

        self.stdout.write("-" * 40)
        self.stdout.write(
            self.style.SUCCESS(
                f"Done! Created: {created_count}, Existing: {existing_count}"
            )
        )
