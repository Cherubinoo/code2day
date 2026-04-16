import re
from django.core.management.base import BaseCommand
from apps.learning.models import StudentProfile


class Command(BaseCommand):
    help = "Check register number formats in the database"

    def handle(self, *args, **options):
        students = StudentProfile.objects.exclude(
            register_number__isnull=True
        ).exclude(register_number="")

        total = students.count()
        self.stdout.write(f"Total students: {total}")
        self.stdout.write("=" * 60)

        # Categorize by format
        valid_12_digit = []
        year_slash_format = []  # 2024-25/053
        other_formats = []

        for student in students:
            reg = str(student.register_number).strip()
            digits_only = re.sub(r'\D', '', reg)

            if len(digits_only) >= 12:
                valid_12_digit.append(student)
            elif '/' in reg or '-' in reg:
                year_slash_format.append(student)
            else:
                other_formats.append((reg, digits_only))

        # Show stats
        self.stdout.write(f"\nValid 12-digit format (953623243023): {len(valid_12_digit)}")
        self.stdout.write(f"Year-slash format (2024-25/053): {len(year_slash_format)}")
        self.stdout.write(f"Other formats: {len(other_formats)}")

        # Show samples
        if valid_12_digit:
            self.stdout.write("\n--- Valid 12-digit samples ---")
            for s in valid_12_digit[:5]:
                reg = str(s.register_number).strip()
                digits = re.sub(r'\D', '', reg)
                inst = digits[0:4] if len(digits) >= 4 else ""
                year = digits[4:6] if len(digits) >= 6 else ""
                dept = digits[6:9] if len(digits) >= 9 else ""
                unique = digits[9:12] if len(digits) >= 12 else ""
                self.stdout.write(
                    f"  {reg}\n"
                    f"    -> Inst:{inst}, Year:{year}, Dept:{dept}, Unique:{unique}"
                )

        if year_slash_format:
            self.stdout.write("\n--- Year-slash format samples ---")
            for s in year_slash_format[:10]:
                self.stdout.write(f"  {s.register_number}")

        if other_formats:
            self.stdout.write("\n--- Other format samples ---")
            for reg, digits in other_formats[:10]:
                self.stdout.write(f"  '{reg}' -> digits: '{digits}' (length: {len(digits)})")

        # Department code summary from valid numbers
        self.stdout.write("\n--- Department codes found ---")
        dept_codes = {}
        for s in valid_12_digit:
            digits = re.sub(r'\D', '', str(s.register_number))
            if len(digits) >= 9:
                dept = digits[6:9]
                dept_codes[dept] = dept_codes.get(dept, 0) + 1

        for code, count in sorted(dept_codes.items()):
            self.stdout.write(f"  {code}: {count} students")
