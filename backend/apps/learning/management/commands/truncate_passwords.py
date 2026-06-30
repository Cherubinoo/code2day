"""
truncate_passwords — deploy-time management command.

Sets every Django User's password to unusable (Django's make_password(None))
AND clears the StaffProfile.password field so both students and staff are
forced through the first-login flow on next access.

Usage:
    python manage.py truncate_passwords
    python manage.py truncate_passwords --dry-run
    python manage.py truncate_passwords --exclude-superusers
"""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Reset all user passwords to unusable — forces first-login password setup on next login."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview how many users would be affected without making changes.',
        )
        parser.add_argument(
            '--exclude-superusers',
            action='store_true',
            help='Leave superuser accounts untouched.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        exclude_superusers = options['exclude_superusers']

        # Django User queryset
        user_qs = User.objects.all()
        if exclude_superusers:
            user_qs = user_qs.filter(is_superuser=False)

        user_count = user_qs.count()

        # StaffProfile queryset — must also clear the separate password field
        # so StaffProfile.password_is_set returns False and first-login is allowed
        from apps.learning.models import StaffProfile
        staff_qs = StaffProfile.objects.exclude(password='')
        if exclude_superusers:
            staff_qs = staff_qs.exclude(account__is_superuser=True)

        staff_count = staff_qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] Would reset passwords for {user_count} User(s) "
                    f"and clear StaffProfile.password for {staff_count} staff account(s). "
                    f"Run without --dry-run to apply."
                )
            )
            return

        # Clear Django auth_user passwords
        updated_users = user_qs.update(password=make_password(None))

        # Clear StaffProfile.password so staff can use first-login flow
        updated_staff = staff_qs.update(password='')

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ auth_user passwords cleared for {updated_users} user(s).\n"
                f"✓ StaffProfile passwords cleared for {updated_staff} staff account(s).\n"
                f"All affected users must set a new password on next login."
            )
        )
