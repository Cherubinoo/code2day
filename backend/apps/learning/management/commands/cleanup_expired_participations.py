from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.learning.models import ContestParticipation


class Command(BaseCommand):
    help = 'Clean up expired contest participations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be cleaned up without actually doing it',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        # Find active participations that have exceeded their contest duration
        active_participations = ContestParticipation.objects.filter(
            is_active=True
        ).select_related('contest')
        
        expired_count = 0
        
        for participation in active_participations:
            time_elapsed = timezone.now() - participation.started_at
            max_duration = timedelta(minutes=participation.contest.duration_minutes)
            
            if time_elapsed > max_duration:
                expired_count += 1
                
                if dry_run:
                    self.stdout.write(
                        f"Would end participation: {participation.student.register_number} "
                        f"in contest '{participation.contest.title}' "
                        f"(elapsed: {time_elapsed}, max: {max_duration})"
                    )
                else:
                    participation.end_participation()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Ended participation: {participation.student.register_number} "
                            f"in contest '{participation.contest.title}'"
                        )
                    )
        
        if expired_count == 0:
            self.stdout.write(self.style.SUCCESS("No expired participations found."))
        else:
            action = "Would end" if dry_run else "Ended"
            self.stdout.write(
                self.style.SUCCESS(f"{action} {expired_count} expired participation(s).")
            )