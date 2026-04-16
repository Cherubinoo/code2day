from django.core.management.base import BaseCommand
from apps.learning.models import StaffProfile


class Command(BaseCommand):
    help = "Sync staff names from User account to StaffProfile"

    def handle(self, *args, **options):
        for staff in StaffProfile.objects.all():
            if not staff.account:
                continue
            
            user_name = staff.account.first_name or ""
            
            # Remove "Admin " or "Staff " prefix
            clean_name = user_name
            if clean_name.startswith("Admin "):
                clean_name = clean_name[6:]
            elif clean_name.startswith("Staff "):
                clean_name = clean_name[6:]
            
            # If profile name is empty but we have a cleaned name, update it
            if not staff.name and clean_name:
                staff.name = clean_name
                staff.save(update_fields=["name"])
                self.stdout.write(self.style.SUCCESS(f"{staff.faculty_id}: Updated to '{clean_name}'"))
            elif staff.name:
                self.stdout.write(f"{staff.faculty_id}: Already has name '{staff.name}'")
            else:
                self.stdout.write(f"{staff.faculty_id}: No name available")
