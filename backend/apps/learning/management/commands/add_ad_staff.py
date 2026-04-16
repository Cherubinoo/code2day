from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from apps.learning.models import Department, Institution, StaffProfile


class Command(BaseCommand):
    help = "Add new AD staff members"

    def handle(self, *args, **options):
        institution = Institution.objects.get(institution_id=9536)
        department = Department.objects.get(code='243')
        
        new_ids = ['1621', '1620']
        
        for staff_id in new_ids:
            username = f"staff_{staff_id}"
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={'first_name': staff_id, 'is_active': True}
            )
            staff, created = StaffProfile.objects.update_or_create(
                faculty_id=staff_id,
                defaults={
                    'account': user,
                    'institution': institution,
                    'department': department,
                    'name': '',
                    'role': 'staff',
                }
            )
            self.stdout.write(self.style.SUCCESS(f"{staff_id}: {'Created' if created else 'Updated'} - staff, AD"))
