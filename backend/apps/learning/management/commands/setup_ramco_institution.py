"""
Create or update Ramco Institution and assign all existing users to it.
"""
from django.core.management.base import BaseCommand
from apps.learning.models import Institution, StudentProfile, StaffProfile


class Command(BaseCommand):
    help = "Setup Ramco Institution (ID 3000) and assign all existing users to it"

    def handle(self, *args, **options):
        # Create or get Ramco Institution
        ramco, created = Institution.objects.get_or_create(
            institution_id=3000,
            defaults={
                "name": "Ramco Institute of Technology",
                "short_code": "RIT",
                "address": "Ramco, Tamil Nadu, India",
                "contact_email": "contact@ramco.edu",
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created Ramco Institution (ID: 3000)"))
        else:
            self.stdout.write(self.style.WARNING(f"Ramco Institution already exists (ID: 3000)"))

        # Assign all students without institution to Ramco
        students_updated = StudentProfile.objects.filter(institution__isnull=True).update(institution=ramco)
        self.stdout.write(f"Updated {students_updated} students to Ramco Institution")

        # Assign all staff without institution to Ramco
        staff_updated = StaffProfile.objects.filter(institution__isnull=True).update(institution=ramco)
        self.stdout.write(f"Updated {staff_updated} staff to Ramco Institution")

        self.stdout.write(self.style.SUCCESS("Done!"))
