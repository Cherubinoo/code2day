import re
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.learning.models import Department, Institution, StudentProfile


class Command(BaseCommand):
    help = "Create departments and map them to students"

    DEPARTMENTS = {
        "243": "AD",
        "103": "Civil",
        "105": "EEE",
        "205": "IT",
        "244": "CSBS",
        "106": "ECE",
        "104": "CSE",
        "114": "Mech",
        "148": "Other",  # From your output
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--institution-id",
            type=int,
            default=9536,
            help="Institution ID",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without making changes",
        )

    def handle(self, *args, **options):
        institution_id = options["institution_id"]
        dry_run = options["dry_run"]

        # Get institution
        try:
            institution = Institution.objects.get(institution_id=institution_id)
            self.stdout.write(f"Using institution: {institution.name}")
        except Institution.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"Institution {institution_id} not found"))
            return

        # Step 1: Create departments
        self.stdout.write("\n=== Creating Departments ===")
        depts_by_code = {}
        for code, name in self.DEPARTMENTS.items():
            if dry_run:
                try:
                    dept = Department.objects.get(code=code)
                    depts_by_code[code] = dept
                    self.stdout.write(f"  EXISTS: {code} - {name}")
                except Department.DoesNotExist:
                    self.stdout.write(f"  WOULD CREATE: {code} - {name}")
            else:
                dept, created = Department.objects.get_or_create(
                    code=code,
                    defaults={"name": name, "institution": institution},
                )
                depts_by_code[code] = dept
                if created:
                    self.stdout.write(self.style.SUCCESS(f"  CREATED: {code} - {name}"))
                else:
                    self.stdout.write(f"  EXISTS: {code} - {name}")

        if dry_run and not depts_by_code:
            self.stdout.write(self.style.WARNING("\nDry run - no departments exist yet. Run without --dry-run to create."))
            return

        # Refresh departments from DB
        if not dry_run:
            depts_by_code = {
                d.code: d for d in Department.objects.filter(code__in=self.DEPARTMENTS.keys())
            }

        # Step 2: Map students
        self.stdout.write("\n=== Mapping Students ===")
        students = StudentProfile.objects.exclude(register_number__isnull=True).exclude(register_number="")

        updated = 0
        skipped = 0

        for student in students:
            reg = str(student.register_number).strip()
            digits = re.sub(r'\D', '', reg)

            if len(digits) < 12:
                skipped += 1
                continue

            # Extract parts
            joining_year = digits[4:6]
            dept_code = digits[6:9]

            # Calculate batch
            batch = ""
            try:
                start = int(joining_year)
                batch = f"{start:02d}-{start+4:02d}"
            except ValueError:
                pass

            # Find department
            dept = depts_by_code.get(dept_code)

            # Only fill in what's currently missing — this runs on every
            # deploy, so overwriting an already-set batch/department would
            # silently revert any manual correction staff made afterward
            # (e.g. a student moved section, or a source-data error was
            # fixed by hand). New/blank students still get auto-mapped.
            needs_batch = not student.batch and batch
            needs_dept = student.department_id is None and dept is not None
            if needs_batch or needs_dept:
                if not dry_run:
                    update_fields = []
                    if needs_batch:
                        student.batch = batch
                        update_fields.append("batch")
                    if needs_dept:
                        student.department = dept
                        update_fields.append("department")
                    student.save(update_fields=update_fields)
                updated += 1
                status = "WOULD UPDATE" if dry_run else "UPDATED"
                dept_name = dept.name if dept else "None"
                self.stdout.write(f"  {status}: {reg} -> batch={batch}, dept={dept_name}")

        # Summary
        self.stdout.write("\n" + "=" * 50)
        if dry_run:
            self.stdout.write(self.style.NOTICE(f"DRY RUN - Would update {updated} students, skip {skipped}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"DONE - Updated {updated} students, skipped {skipped}"))

        # Show sample
        self.stdout.write("\nSample students after mapping:")
        samples = StudentProfile.objects.exclude(register_number__isnull=True).exclude(register_number="")[:5]
        for s in samples:
            dept_name = s.department.name if s.department else "Not mapped"
            self.stdout.write(f"  {s.register_number}: batch={s.batch}, dept={dept_name}")
