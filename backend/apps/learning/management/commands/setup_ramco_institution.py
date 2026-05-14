"""
Create or update Ramco Institution and assign all existing users to it.
Uses institution_id=9536 (parsed from register numbers: 9536YYDDDNNN).
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.learning.models import Institution, StudentProfile, StaffProfile


class Command(BaseCommand):
    help = "Setup Ramco Institution (ID 9536) and assign all existing users to it. Removes duplicate institution 3000 if present."

    def handle(self, *args, **options):
        with transaction.atomic():
            # ── 1. Get or create the canonical institution (ID 9536) ──────────
            ramco, created = Institution.objects.get_or_create(
                institution_id=9536,
                defaults={
                    "name": "Ramco Institute of Technology",
                    "short_code": "RIT",
                    "display_name": "Ramco Institute of Technology",
                    "subheading": "(An Autonomous Institution)",
                    "address": "Rajapalayam, Tamil Nadu, India - 626 117.",
                    "contact_email": "contact@ramcoad.com",
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS("Created Ramco Institution (ID: 9536)"))
            else:
                self.stdout.write(self.style.WARNING("Ramco Institution already exists (ID: 9536)"))

            # ── 2. Remove duplicate institution 3000 if it exists ─────────────
            duplicate = Institution.objects.filter(institution_id=3000).first()
            if duplicate:
                # Re-point any students/staff that were assigned to the duplicate
                students_repointed = StudentProfile.objects.filter(institution=duplicate).update(institution=ramco)
                staff_repointed = StaffProfile.objects.filter(institution=duplicate).update(institution=ramco)
                duplicate.delete()
                self.stdout.write(self.style.SUCCESS(
                    f"Removed duplicate institution 3000 — re-pointed "
                    f"{students_repointed} students and {staff_repointed} staff to ID 9536"
                ))
            else:
                self.stdout.write("No duplicate institution 3000 found.")

            # ── 3. Assign all students/staff without institution to Ramco ─────
            students_updated = StudentProfile.objects.filter(institution__isnull=True).update(institution=ramco)
            staff_updated = StaffProfile.objects.filter(institution__isnull=True).update(institution=ramco)
            self.stdout.write(f"Assigned {students_updated} students and {staff_updated} staff to Ramco (ID: 9536)")

        self.stdout.write(self.style.SUCCESS("Done!"))
