"""
Create or update Ramco Institution and assign all existing users to it.
Uses institution_id=9536 (parsed from register numbers: 9536YYDDDNNN).
"""
import os

from django.core.files import File
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.learning.models import Institution, StudentProfile, StaffProfile

# The crest used in the app's own UI (TopBar/AuthScreen) — reused here so
# generated PDF report headers/watermarks match the branding students and
# staff already see on screen, without depending on an external URL.
_LOGO_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "..",
    "frontend", "public", "logo", "logo.jpeg",
)
_BRANDING_DEFAULTS = {
    "name": "Ramco Institute of Technology",
    "short_code": "RIT",
    "display_name": "Ramco Institute of Technology",
    "subheading": "(An Autonomous Institution)",
    "address": (
        "Approved By AICTE, New Delhi & Affiliated to Anna University\n"
        "NAAC Accredited with 'A+' Grade & An ISO 9001:2015 Certified Institution\n"
        "Rajapalayam, Tamil Nadu, India - 626 117."
    ),
    "contact_email": "contact@ramcoad.com",
}


class Command(BaseCommand):
    help = "Setup Ramco Institution (ID 9536) and assign all existing users to it. Removes duplicate institution 3000 if present."

    def handle(self, *args, **options):
        with transaction.atomic():
            # ── 1. Get or create the canonical institution (ID 9536) ──────────
            ramco, created = Institution.objects.get_or_create(
                institution_id=9536,
                defaults=_BRANDING_DEFAULTS,
            )

            if created:
                self.stdout.write(self.style.SUCCESS("Created Ramco Institution (ID: 9536)"))
            else:
                self.stdout.write(self.style.WARNING("Ramco Institution already exists (ID: 9536)"))
                # Keep branding text current on re-runs (e.g. after the
                # accreditation lines below were added) without clobbering
                # any other fields a staff member may have customised.
                changed = []
                for field, value in _BRANDING_DEFAULTS.items():
                    if not getattr(ramco, field):
                        setattr(ramco, field, value)
                        changed.append(field)
                if changed:
                    ramco.save(update_fields=changed)

            if not ramco.logo_file and os.path.exists(_LOGO_PATH):
                with open(_LOGO_PATH, "rb") as f:
                    ramco.logo_file.save("ramco_logo.jpeg", File(f), save=True)
                self.stdout.write(self.style.SUCCESS("Set Ramco Institution logo from frontend/public/logo/logo.jpeg"))

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
