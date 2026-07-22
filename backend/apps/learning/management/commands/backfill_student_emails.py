"""
One-time data fix: set every student's email (both their login account email
and their profile's personal_email) to their official institution address,
derived from their register number — e.g. register number 953623243023
becomes 953623243023@ritrjpm.ac.in.

This is meant to be run ONCE, manually, after deploying — it is NOT wired
into `migrate` and will not run automatically. Defaults to a dry run; pass
--apply to actually write changes.

Usage:
    python manage.py backfill_student_emails                # dry run (default)
    python manage.py backfill_student_emails --apply         # actually writes
    python manage.py backfill_student_emails --apply --institution-id 9536
"""

import re

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.learning.models import StudentProfile

EMAIL_DOMAIN = "ritrjpm.ac.in"
DEFAULT_INSTITUTION_ID = 9536  # Ramco Institute of Technology (RIT)
REGISTER_NUMBER_RE = re.compile(r"^\d+$")


class Command(BaseCommand):
    help = "Set every student's email to {register_number}@ritrjpm.ac.in (profile + login account)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write the changes. Without this flag, only a preview is printed.",
        )
        parser.add_argument(
            "--institution-id", type=int, default=DEFAULT_INSTITUTION_ID,
            help=f"Only touch students of this institution_id (default: {DEFAULT_INSTITUTION_ID}, Ramco Institute of Technology).",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        institution_id = options["institution_id"]

        students = (
            StudentProfile.objects
            .filter(institution__institution_id=institution_id)
            .exclude(register_number__isnull=True)
            .exclude(register_number="")
            .select_related("account")
            .order_by("register_number")
        )

        total = students.count()
        if total == 0:
            self.stdout.write(self.style.WARNING(f"No students found for institution_id={institution_id}."))
            return

        self.stdout.write(f"{'APPLYING' if apply_changes else 'DRY RUN'} — {total} student(s) to process.\n")

        updated_profiles = 0
        updated_accounts = 0
        unchanged = 0
        no_account = 0
        skipped_bad_regno = []

        with transaction.atomic():
            for student in students.iterator():
                if not REGISTER_NUMBER_RE.match(student.register_number):
                    skipped_bad_regno.append(student.register_number)
                    continue

                new_email = f"{student.register_number}@{EMAIL_DOMAIN}"

                profile_changed = student.personal_email != new_email
                account_changed = bool(student.account) and student.account.email != new_email

                if not student.account:
                    no_account += 1

                if profile_changed or account_changed:
                    if total <= 20 or (updated_profiles + updated_accounts) < 10:
                        self.stdout.write(
                            f"  {student.register_number}: "
                            f"'{student.personal_email}' -> '{new_email}'"
                            + ("" if student.account else "  [no linked login account]")
                        )
                    if apply_changes:
                        if profile_changed:
                            student.personal_email = new_email
                            student.save(update_fields=["personal_email"])
                        if account_changed:
                            student.account.email = new_email
                            student.account.save(update_fields=["email"])
                    if profile_changed:
                        updated_profiles += 1
                    if account_changed:
                        updated_accounts += 1
                else:
                    unchanged += 1

            if not apply_changes:
                # Dry run: roll back even though nothing was written, just to
                # be explicit that this transaction makes no lasting change.
                transaction.set_rollback(True)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Applied' if apply_changes else 'Would apply'}: "
            f"{updated_profiles} profile email(s), {updated_accounts} login account email(s). "
            f"Already correct: {unchanged}. No linked login account: {no_account}."
        ))
        if skipped_bad_regno:
            self.stdout.write(self.style.WARNING(
                f"Skipped {len(skipped_bad_regno)} student(s) whose register_number isn't a plain "
                f"numeric ID (e.g. {skipped_bad_regno[0]!r}) — left untouched. Fix their register "
                f"numbers first, then re-run this command to pick them up."
            ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run — re-run with --apply to write these changes."))
