"""
Create staff/faculty user with faculty_id for login.
Usage: python manage.py create_staff --faculty-id FAC001 --name "Dr. Smith"
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction
from apps.learning.models import StaffProfile


class Command(BaseCommand):
    help = "Create staff/faculty user with first-time password setup flow"

    def add_arguments(self, parser):
        parser.add_argument("--faculty-id", type=str, required=True, help="Faculty ID for login")
        parser.add_argument("--name", type=str, required=True, help="Staff member name")
        parser.add_argument("--password", type=str, help="Initial password (optional, skips first-login)")

    def handle(self, *args, **options):
        faculty_id = options["faculty_id"]
        name = options["name"]
        password = options.get("password")

        with transaction.atomic():
            # Check if user exists
            if User.objects.filter(username=faculty_id).exists():
                self.stdout.write(self.style.WARNING(f"User with ID '{faculty_id}' already exists."))
                return

            if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
                self.stdout.write(self.style.WARNING(f"Staff profile '{faculty_id}' already exists."))
                return

            # Create user (not superuser, just regular user)
            user = User.objects.create_user(
                username=faculty_id,
                email=f"{faculty_id}@staff.local",
                first_name=name,
            )

            # Create staff profile
            profile = StaffProfile.objects.create(
                account=user,
                faculty_id=faculty_id,
                name=name,
            )

            # Set unusable password if not provided (first login will set it)
            if password:
                profile.set_password(password)
                self.stdout.write(self.style.SUCCESS(
                    f"Staff '{faculty_id}' ({name}) created with password."
                ))
            else:
                self.stdout.write(self.style.SUCCESS(
                    f"Staff '{faculty_id}' ({name}) created.\n"
                    f"Set password on first login at /api/staff/first-login/"
                ))
