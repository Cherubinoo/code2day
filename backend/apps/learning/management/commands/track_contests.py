"""
Management command to track and display contest status in a table format
Usage: python manage.py track_contests
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.learning.models import Contest, ContestParticipation, ContestSubmission
from tabulate import tabulate


class Command(BaseCommand):
    help = 'Track contest status and participation in table format'

    def handle(self, *args, **options):
        contests = Contest.objects.all().order_by('-created_at')
        
        if not contests.exists():
            self.stdout.write(self.style.WARNING('No contests found in database'))
            return
        
        # Build table data
        table_data = []
        now = timezone.now()
        
        for contest in contests:
            # Calculate status
            if contest.status == 'published':
                if contest.start_time and contest.end_time:
                    if now < contest.start_time:
                        live_status = 'Upcoming'
                    elif contest.start_time <= now <= contest.end_time:
                        live_status = 'Active'
                    else:
                        live_status = 'Ended'
                else:
                    live_status = 'No Schedule'
            else:
                live_status = contest.get_status_display()
            
            # Get participation stats
            total_assigned = contest.assigned_students.count()
            participations = ContestParticipation.objects.filter(contest=contest).count()
            active_participations = ContestParticipation.objects.filter(
                contest=contest, 
                is_active=True
            ).count()
            submissions = ContestSubmission.objects.filter(contest=contest).count()
            
            # Format times
            start_str = contest.start_time.strftime('%Y-%m-%d %H:%M') if contest.start_time else 'N/A'
            end_str = contest.end_time.strftime('%Y-%m-%d %H:%M') if contest.end_time else 'N/A'
            
            table_data.append([
                contest.id,
                contest.title[:30],
                contest.status,
                live_status,
                total_assigned,
                participations,
                active_participations,
                submissions,
                contest.problems.count(),
                start_str,
                end_str,
            ])
        
        # Print table
        headers = [
            'ID', 'Title', 'Status', 'Live Status', 
            'Assigned', 'Started', 'Active', 'Submissions',
            'Problems', 'Start Time', 'End Time'
        ]
        
        self.stdout.write('\n' + '='*150)
        self.stdout.write(self.style.SUCCESS('CONTEST TRACKING TABLE'))
        self.stdout.write('='*150 + '\n')
        
        self.stdout.write(tabulate(table_data, headers=headers, tablefmt='grid'))
        
        # Summary
        self.stdout.write('\n' + '='*150)
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write('='*150)
        
        total = contests.count()
        published = contests.filter(status='published').count()
        active_now = 0
        
        for c in contests.filter(status='published'):
            if c.start_time and c.end_time:
                if c.start_time <= now <= c.end_time:
                    active_now += 1
        
        self.stdout.write(f'Total Contests: {total}')
        self.stdout.write(f'Published (visible to students): {published}')
        self.stdout.write(f'Currently Active: {active_now}')
        self.stdout.write(f'Total Participations: {ContestParticipation.objects.count()}')
        self.stdout.write(f'Total Submissions: {ContestSubmission.objects.count()}')
        self.stdout.write('')
