from django.core.management.base import BaseCommand
from django.db import transaction

from apps.learning.models import Department, Institution, StudentProfile


class Command(BaseCommand):
    help = "Map departments and batches for all students based on register number format"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without making changes",
        )
        parser.add_argument(
            "--create-depts",
            action="store_true",
            help="Create departments automatically if they don't exist",
        )
        parser.add_argument(
            "--institution-id",
            type=int,
            help="Institution ID to associate with created departments",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        create_depts = options["create_depts"]
        institution_id = options["institution_id"]

        institution = None
        if institution_id:
            try:
                institution = Institution.objects.get(institution_id=institution_id)
                self.stdout.write(f"Using institution: {institution.name}")
            except Institution.DoesNotExist:
                self.stdout.write(
                    self.style.ERROR(f"Institution with ID {institution_id} not found")
                )
                return

        # Get all students with register numbers
        students = StudentProfile.objects.exclude(
            register_number__isnull=True
        ).exclude(register_number="")

        total = students.count()
        self.stdout.write(f"Found {total} students with register numbers")

        # Track unique department codes found
        dept_codes_found = set()

        # First pass: collect all department codes
        for student in students:
            _, _, dept_code, _ = student.parse_register_number()
            if dept_code:
                dept_codes_found.add(dept_code)

        self.stdout.write(f"\nUnique department codes found: {sorted(dept_codes_found)}")

        # Get existing departments
        existing_depts = {
            d.code.lower(): d
            for d in Department.objects.filter(code__in=dept_codes_found)
        }

        self.stdout.write(f"Existing departments: {list(existing_depts.keys())}")

        # Create missing departments if requested
        created_depts = {}
        if create_depts and not dry_run:
            missing_codes = dept_codes_found - set(existing_depts.keys())
            for code in missing_codes:
                dept = Department.objects.create(
                    institution=institution,
                    name=f"Department {code}",
                    code=code,
                )
                created_depts[code.lower()] = dept
                self.stdout.write(self.style.SUCCESS(f"Created department: {code}"))
            # Refresh existing departments dict
            existing_depts = {
                d.code.lower(): d
                for d in Department.objects.filter(code__in=dept_codes_found)
            }
        elif missing_codes := dept_codes_found - set(existing_depts.keys()):
            self.stdout.write(
                self.style.WARNING(
                    f"Missing departments (use --create-depts to auto-create): {sorted(missing_codes)}"
                )
            )

        # Second pass: update students
        updated_count = 0
        skipped_count = 0
        error_count = 0

        self.stdout.write("\nProcessing students...")

        with transaction.atomic():
            for student in students:
                _, joining_year, dept_code, _ = student.parse_register_number()

                if not joining_year and not dept_code:
                    skipped_count += 1
                    if dry_run:
                        self.stdout.write(
                            f"  SKIP: {student.register_number} - Invalid format"
                        )
                    continue

                # Calculate batch
                batch = ""
                if joining_year:
                    try:
                        start_year = int(joining_year)
                        end_year = start_year + 4
                        batch = f"{start_year:02d}-{end_year:02d}"
                    except ValueError:
                        pass

                # Find department
                dept = None
                if dept_code:
                    dept = existing_depts.get(dept_code.lower())

                # Check if update needed
                needs_update = (
                    student.batch != batch or
                    student.department != dept
                )

                if needs_update:
                    if dry_run:
                        self.stdout.write(
                            f"  WOULD UPDATE: {student.register_number} -> "
                            f"batch={batch}, dept={dept.code if dept else 'None'}"
                        )
                    else:
                        student.batch = batch
                        student.department = dept
                        student.save(update_fields=["batch", "department"])
                        self.stdout.write(
                            f"  UPDATED: {student.register_number} -> "
                            f"batch={batch}, dept={dept.code if dept else 'None'}"
                        )
                    updated_count += 1
                else:
                    if dry_run:
                        self.stdout.write(
                            f"  NO CHANGE: {student.register_number} - "
                            f"batch={batch}, dept={dept.code if dept else 'None'}"
                        )

        # Summary
        self.stdout.write("\n" + "=" * 50)
        if dry_run:
            self.stdout.write(
                self.style.NOTICE(
                    f"DRY RUN - Would update {updated_count} students, "
                    f"skip {skipped_count}, errors {error_count}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Complete - Updated {updated_count} students, "
                    f"skip {skipped_count}, errors {error_count}"
                )
            )

        # Show sample of students with their new mappings
        self.stdout.write("\nSample mappings:")
        sample = StudentProfile.objects.exclude(register_number__isnull=True).exclude(
            register_number=""
        )[:5]
        for s in sample:
            _, joining_year, dept_code, unique = s.parse_register_number()
            dept_name = s.department.code if s.department else "Not mapped"
            self.stdout.write(
                f"  {s.register_number}: year={joining_year}, "
                f"dept_code={dept_code}, unique={unique}, "
                f"batch={s.batch}, dept={dept_name}"
            )
