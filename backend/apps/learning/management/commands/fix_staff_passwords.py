from django.core.management.base import BaseCommand
from apps.learning.models import StaffProfile


class Command(BaseCommand):
    help = "Fix staff passwords - sync from StaffProfile to User account"

    def handle(self, *args, **options):
        self.stdout.write("Checking staff passwords...")
        
        for staff in StaffProfile.objects.all():
            if not staff.account:
                self.stdout.write(self.style.WARNING(f"{staff.faculty_id}: No account"))
                continue
                
            if not staff.account.has_usable_password():
                if staff.password:
                    # Has password in StaffProfile but not in User - need to set
                    self.stdout.write(f"{staff.faculty_id}: Syncing password to User account...")
                    # We can't recover the raw password, so user needs first-login
                    staff.account.set_unusable_password()
                    staff.account.save()
                    self.stdout.write(self.style.SUCCESS(f"  Fixed (needs first-login)"))
                else:
                    self.stdout.write(f"{staff.faculty_id}: No password set anywhere")
            else:
                self.stdout.write(f"{staff.faculty_id}: OK")
