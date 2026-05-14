"""
Seed specific students that are present in the local DB but missing on the server.
Uses get_or_create so it is safe to run multiple times (idempotent).

Register numbers to seed:
  953623243001, 953623243002, 953623243003, 953623243004,
  953623243005, 953623243023, 953623243049, 953623243109

Register number format: 9536 | 23 | 243 | NNN
  9536 = institution code  → institution_id=9536
  23   = joining year      → batch 23-27
  243  = department code   → AD department
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.learning.models import Department, Institution, StudentProfile

# ── Students to seed ──────────────────────────────────────────────────────────
# Format: (register_number, name)
# Names are placeholders — the import_students command will overwrite them
# with real names from the source DB on the next sync.
MISSING_STUDENTS = [
    ("953623243001", "Student 953623243001"),
    ("953623243002", "Student 953623243002"),
    ("953623243003", "Student 953623243003"),
    ("953623243004", "Student 953623243004"),
    ("953623243005", "Student 953623243005"),
    ("953623243023", "Student 953623243023"),
    ("953623243049", "Student 953623243049"),
    ("953623243109", "Student 953623243109"),
]


class Command(BaseCommand):
    help = "Seed specific missing students into the database (idempotent)"

    def handle(self, *args, **options):
        # Resolve institution and department
        institution = Institution.objects.filter(institution_id=9536).first()
        if not institution:
            self.stdout.write(self.style.ERROR(
                "Institution 9536 not found. Run setup_ramco_institution first."
            ))
            return

        department = Department.objects.filter(code="243").first()
        if not department:
            self.stdout.write(self.style.WARNING(
                "Department code '243' (AD) not found — students will be created without a department."
            ))

        created_count = 0
        skipped_count = 0

        with transaction.atomic():
            for register_number, placeholder_name in MISSING_STUDENTS:
                if StudentProfile.objects.filter(register_number=register_number).exists():
                    self.stdout.write(f"  SKIP (exists): {register_number}")
                    skipped_count += 1
                    continue

                # Create Django User account
                user, _ = User.objects.get_or_create(
                    username=register_number,
                    defaults={
                        "first_name": placeholder_name[:150],
                        "is_active": True,
                    }
                )
                if not user.has_usable_password():
                    user.set_unusable_password()
                    user.save()

                StudentProfile.objects.create(
                    account=user,
                    institution=institution,
                    department=department,
                    register_number=register_number,
                    name=placeholder_name,
                    title=placeholder_name,
                    batch="23-27",
                    import_source="seed_missing_students",
                )

                self.stdout.write(self.style.SUCCESS(f"  CREATED: {register_number}"))
                created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nDone — created {created_count}, skipped {skipped_count} (already existed)."
        ))
        if created_count > 0:
            self.stdout.write(
                "Note: Names are placeholders. Run import_students to sync real names from the source DB."
            )
