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
# Names sourced from local DB (collegeadmissiondb.personaldetails)
MISSING_STUDENTS = [
    ("953623243001", "ABI ALIAS MAHALAKSHMI R"),
    ("953623243002", "Abinaya S"),
    ("953623243003", "ABI RAJESHWARI P"),
    ("953623243004", "AKASH V"),
    ("953623243005", "AKSHAY A"),
    ("953623243023", "DELIGHT CHERUBINO I"),
    ("953623243049", "KISHORREKUMAR S"),
    ("953623243109", "UMADEVI K"),
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
        updated_count = 0

        with transaction.atomic():
            for register_number, real_name in MISSING_STUDENTS:
                existing = StudentProfile.objects.filter(register_number=register_number).first()

                if existing:
                    # Fix placeholder name if it was seeded with a generic name
                    needs_update = (
                        existing.name != real_name or
                        existing.title in ("", existing.register_number, f"Student {register_number}")
                    )
                    if needs_update:
                        existing.name = real_name
                        existing.title = real_name
                        existing.save(update_fields=["name", "title"])
                        # Also sync the Django User first_name
                        if existing.account:
                            existing.account.first_name = real_name[:150]
                            existing.account.save(update_fields=["first_name"])
                        self.stdout.write(self.style.SUCCESS(f"  UPDATED name: {register_number} → {real_name}"))
                        updated_count += 1
                    else:
                        self.stdout.write(f"  SKIP (already correct): {register_number} — {existing.name}")
                        skipped_count += 1
                    continue

                # Create Django User account
                user, _ = User.objects.get_or_create(
                    username=register_number,
                    defaults={
                        "first_name": real_name[:150],
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
                    name=real_name,
                    title=real_name,
                    batch="23-27",
                    import_source="seed_missing_students",
                )

                self.stdout.write(self.style.SUCCESS(f"  CREATED: {register_number} — {real_name}"))
                created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nDone — created {created_count}, updated {updated_count}, skipped {skipped_count}."
        ))
