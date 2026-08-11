from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from apps.learning.models import Department, Institution, StaffProfile


class Command(BaseCommand):
    help = "Update staff roles and departments - AD staff to staff role, 0001 to admin"

    AD_STAFF_IDS = [
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
            help="Department code for AD staff (default: 243)",
        )

    def handle(self, *args, **options):
        institution_id = options["institution_id"]
        dept_code = options["dept_code"]

        # Get institution
        try:
            institution = Institution.objects.get(institution_id=institution_id)
        except Institution.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Institution with ID {institution_id} not found")
            )
            return

        # Get AD department
        try:
            ad_department = Department.objects.get(code=dept_code)
        except Department.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Department with code {dept_code} not found")
            )
            return

        self.stdout.write("=" * 50)
        self.stdout.write("UPDATING STAFF ROLES")
        self.stdout.write("=" * 50)

        # Step 1: Update 0001 to admin (Node Admin)
        self.stdout.write("\n1. Setting 0001 as Admin (admin)...")
        admin_user, _ = User.objects.get_or_create(
            username="staff_0001",
            defaults={
                "first_name": "Administrator",
                "is_active": True,
            },
        )

        admin_staff, created = StaffProfile.objects.update_or_create(
            faculty_id="0001",
            defaults={
                "account": admin_user,
                "institution": institution,
                "name": "Administrator",
                "role": "admin",
            },
        )
        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(f"  {action}: 0001 - Administrator (admin)")
        )

        # Step 2: Update AD staff to role='staff' with AD department, keep existing names
        self.stdout.write(f"\n2. Setting AD staff to 'staff' role with AD department...")
        self.stdout.write(f"   Department: {ad_department.name} ({ad_department.code})")
        self.stdout.write("-" * 40)

        updated_count = 0
        for staff_id in self.AD_STAFF_IDS:
            try:
                staff = StaffProfile.objects.get(faculty_id=staff_id)
                # Keep existing name, update role and department
                old_role = staff.role
                staff.role = "staff"
                staff.department = ad_department
                staff.institution = institution
                staff.save(update_fields=["role", "department", "institution"])
                updated_count += 1
                self.stdout.write(
                    f"  Updated: {staff_id} - {staff.name} ({old_role} → staff, AD)"
                )
            except StaffProfile.DoesNotExist:
                # Create new staff with default name
                username = f"staff_{staff_id}"
                user, _ = User.objects.get_or_create(
                    username=username,
                    defaults={
                        "first_name": f"Staff {staff_id}",
                        "is_active": True,
                    },
                )
                staff = StaffProfile.objects.create(
                    faculty_id=staff_id,
                    account=user,
                    institution=institution,
                    department=ad_department,
                    name=f"Staff {staff_id}",
                    role="staff",
                )
                updated_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  Created: {staff_id} - {staff.name} (staff, AD)")
                )

        self.stdout.write("-" * 40)
        self.stdout.write(
            self.style.SUCCESS(f"\nDone! Updated {updated_count} AD staff members.")
        )
        self.stdout.write("\nSummary:")
        self.stdout.write("  - 0001: Admin (no department)")
        self.stdout.write(f"  - {len(self.AD_STAFF_IDS)} staff: AD department, staff role")
