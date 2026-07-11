from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.learning.models import Contest, ContestParticipation
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Allocate winners for contests that ended 24 hours ago'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without actually doing it',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force allocation even if winners already exist',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']
        
        # Get contests that ended 24 hours ago.
        # `is_ended`/`is_published` aren't real model fields (is_ended is a Python
        # property, and there's no is_published field at all — status="published"
        # is the actual flag), so filter in Python instead of the ORM to avoid a
        # FieldError on every run.
        cutoff_time = timezone.now() - timedelta(hours=24)

        candidates = Contest.objects.filter(status__in=["published", "completed"])
        contests = [
            contest for contest in candidates
            if contest.is_ended and (contest.access_end_time or contest.end_time) <= cutoff_time
        ]

        if dry_run:
            self.stdout.write(f"DRY RUN: Found {len(contests)} contests to process")
        else:
            self.stdout.write(f"Processing {len(contests)} contests for winner allocation")
        
        processed_count = 0
        
        for contest in contests:
            try:
                # Check if winners already allocated (unless force is used)
                if not force and hasattr(contest, 'winners_allocated') and contest.winners_allocated:
                    self.stdout.write(f"Skipping contest '{contest.title}' - winners already allocated")
                    continue
                
                # Get all participations for this contest, ordered by performance
                participations = ContestParticipation.objects.filter(
                    contest=contest,
                    has_started=True
                ).select_related('student').order_by(
                    '-problems_solved',  # More problems solved first
                    'total_time_taken',  # Less time taken second
                    '-total_score'       # Higher score third
                )
                
                if participations.count() == 0:
                    self.stdout.write(f"No participants found for contest '{contest.title}'")
                    continue
                
                # Get top 3 winners
                winners = participations[:3]
                
                if dry_run:
                    self.stdout.write(f"\nDRY RUN - Contest: {contest.title}")
                    self.stdout.write(f"Total participants: {participations.count()}")
                    self.stdout.write("Winners would be:")
                    for i, winner in enumerate(winners):
                        self.stdout.write(
                            f"  {i+1}. {winner.student.name} "
                            f"({winner.student.register_number}) - "
                            f"{winner.problems_solved}/{contest.problems.count()} problems, "
                            f"{winner.total_score} points"
                        )
                else:
                    # Allocate winners
                    self.stdout.write(f"\nAllocating winners for contest: {contest.title}")
                    self.stdout.write(f"Total participants: {participations.count()}")
                    
                    # Update participation records with ranks
                    for i, participation in enumerate(participations):
                        participation.final_rank = i + 1
                        participation.is_winner = i < 3  # Top 3 are winners
                        participation.save()
                    
                    # Mark contest as having winners allocated
                    contest.winners_allocated = True
                    contest.winners_allocated_at = timezone.now()
                    contest.save()
                    
                    self.stdout.write("Winners allocated:")
                    for i, winner in enumerate(winners):
                        self.stdout.write(
                            f"  {i+1}. {winner.student.name} "
                            f"({winner.student.register_number}) - "
                            f"{winner.problems_solved}/{contest.problems.count()} problems, "
                            f"{winner.total_score} points"
                        )
                
                processed_count += 1
                
            except Exception as e:
                logger.error(f"Error processing contest {contest.id}: {str(e)}")
                self.stdout.write(
                    self.style.ERROR(f"Error processing contest '{contest.title}': {str(e)}")
                )
        
        if dry_run:
            self.stdout.write(f"\nDRY RUN completed. {processed_count} contests would be processed.")
        else:
            self.stdout.write(f"\nWinner allocation completed. {processed_count} contests processed.")