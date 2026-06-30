"""
truncate_passwords — deploy-time management command.

Sets every Django User's password to unusable (Django's make_password(None)).
Users will need to go through the first-login flow to set a new password.

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

        qs = User.objects.all()
        if exclude_superusers:
            qs = qs.filter(is_superuser=False)

        count = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] Would reset passwords for {count} user(s). "
                    f"Run without --dry-run to apply."
                )
            )
            return

        # Set password to unusable — Django stores this as '!' prefix
        updated = qs.update(password=make_password(None))

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Passwords cleared for {updated} user(s). "
                f"All affected users must set a new password on next login."
            )
        )
