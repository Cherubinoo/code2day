from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from apps.learning.models import Department, Institution, StaffProfile


class Command(BaseCommand):
    help = "Create staff members with AD department and HOD role"

    STAFF_IDS = [
        "1608",
        "1603",
        "1619",
        "1613",
        "1605",
        "1604",
        "1616",
        "1607",
        "1618",
        "1223",
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--institution-id",
            type=int,
            default=9536,
            help="Institution ID",
        )
        parser.add_argument(
            "--dept-code",
            default="243",
            help="Department code (default: 243 for AD)",
        )
        parser.add_argument(
            "--role",
            default="hod",
            choices=["staff", "hod", "admin"],
            help="Role for the staff members (default: hod)",
        )
        parser.add_argument(
            "--name-prefix",
            default="Staff",
            help="Prefix for auto-generated names",
        )

    def handle(self, *args, **options):
        institution_id = options["institution_id"]
        dept_code = options["dept_code"]
        role = options["role"]
        name_prefix = options["name_prefix"]

        # Get institution
        try:
            institution = Institution.objects.get(institution_id=institution_id)
        except Institution.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Institution with ID {institution_id} not found")
            )
            return

        # Get department
        try:
            department = Department.objects.get(code=dept_code)
        except Department.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Department with code {dept_code} not found")
            )
            return

        self.stdout.write(f"Institution: {institution.name}")
        self.stdout.write(f"Department: {department.name} ({department.code})")
        self.stdout.write(f"Role: {role}")
        self.stdout.write("-" * 40)

        created_count = 0
        updated_count = 0

        for staff_id in self.STAFF_IDS:
            # Create user
            username = f"staff_{staff_id}"
            user, user_created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": f"{name_prefix} {staff_id}",
                    "is_active": True,
                },
            )
            if user_created:
                user.set_unusable_password()
                user.save()

            # Create/update staff profile
            staff, created = StaffProfile.objects.update_or_create(
                faculty_id=staff_id,
                defaults={
                    "account": user,
                    "institution": institution,
                    "department": department,
                    "name": f"{name_prefix} {staff_id}",
                    "role": role,
                },
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Created: {staff_id} - {staff.name} ({role})")
                )
            else:
                updated_count += 1
                self.stdout.write(f"Updated: {staff_id} - {staff.name} ({role})")

        self.stdout.write("-" * 40)
        self.stdout.write(
            self.style.SUCCESS(
                f"Done! Created: {created_count}, Updated: {updated_count}"
            )
        )
