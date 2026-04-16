from django.core.management.base import BaseCommand
from apps.learning.models import StaffProfile


class Command(BaseCommand):
    help = "Restore original staff names (remove 'Admin ' prefix)"

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

    def handle(self, *args, **options):
        self.stdout.write("Restoring original staff names...")
        self.stdout.write("-" * 40)

        for staff_id in self.STAFF_IDS:
            try:
                staff = StaffProfile.objects.get(faculty_id=staff_id)
                old_name = staff.name
                # Restore original name (just the ID, or empty if that was original)
                # If name starts with "Admin " or "Staff ", remove that prefix
                if staff.name.startswith("Admin ") or staff.name.startswith("Staff "):
                    staff.name = ""  # Set to empty to use default
                    staff.save(update_fields=["name"])
                    self.stdout.write(f"  {staff_id}: '{old_name}' → '' (empty/original)")
                else:
                    self.stdout.write(f"  {staff_id}: '{old_name}' (unchanged)")
            except StaffProfile.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"  {staff_id}: Not found"))

        self.stdout.write("-" * 40)
        self.stdout.write(self.style.SUCCESS("Done! Names restored."))
