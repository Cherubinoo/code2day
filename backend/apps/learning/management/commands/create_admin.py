"""
Create admin superuser with ID 0001.
Usage: python manage.py create_admin --id 0001 --name "Admin User"
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction


class Command(BaseCommand):
    help = "Create admin superuser with custom ID"

    def add_arguments(self, parser):
        parser.add_argument("--id", type=str, default="0001", help="Admin ID/username")
        parser.add_argument("--name", type=str, default="Administrator", help="Admin name")
        parser.add_argument("--password", type=str, help="Initial password (optional)")

    def handle(self, *args, **options):
        admin_id = options["id"]
        name = options["name"]
        password = options.get("password")

        with transaction.atomic():
            # Check if user exists
            if User.objects.filter(username=admin_id).exists():
                self.stdout.write(self.style.WARNING(f"Admin user '{admin_id}' already exists."))
                return

            # Create superuser
            user = User.objects.create_superuser(
                username=admin_id,
                email=f"{admin_id}@admin.local",
                first_name=name,
            )

            # Set unusable password if not provided (first login will set it)
            if password:
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Admin '{admin_id}' created with password."))
            else:
                user.set_unusable_password()
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Admin '{admin_id}' created. Set password on first login at /api/admin/first-login/"
                    )
                )
