"""
Management command to publish approved contests
Usage: python manage.py publish_contests [--all]
"""

from django.core.management.base import BaseCommand
from apps.learning.models import Contest


class Command(BaseCommand):
    help = 'Publish approved contests to make them visible to students'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all',
            action='store_true',
            help='Publish all approved contests without confirmation',
        )
        parser.add_argument(
            '--contest-id',
            type=int,
            help='Publish a specific contest by ID',
        )

    def handle(self, *args, **options):
        publish_all = options['all']
        contest_id = options.get('contest_id')
        
        if contest_id:
            # Publish specific contest
            try:
                contest = Contest.objects.get(id=contest_id)
                if contest.status != 'approved':
                    self.stdout.write(self.style.ERROR(
                        f"Contest '{contest.title}' has status '{contest.status}'. "
                        f"Only approved contests can be published."
                    ))
                    return
                
                contest.status = 'published'
                contest.save(update_fields=['status'])
                self.stdout.write(self.style.SUCCESS(
                    f"✓ Published contest: {contest.title} (ID: {contest.id})"
                ))
                self.stdout.write(f"  Assigned to {contest.assigned_students.count()} students")
                
            except Contest.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Contest with ID {contest_id} not found"))
            return
        
        # Get all approved contests
        approved_contests = Contest.objects.filter(status='approved').order_by('created_at')
        
        if not approved_contests.exists():
            self.stdout.write(self.style.WARNING("No approved contests found."))
            self.stdout.write("\nContest status flow:")
            self.stdout.write("  draft → pending_approval → approved → published")
            self.stdout.write("\nTo get approved contests:")
            self.stdout.write("  1. Staff creates contest")
            self.stdout.write("  2. Staff submits for approval")
            self.stdout.write("  3. HOD approves the contest")
            self.stdout.write("  4. Run this command to publish")
            return
        
        self.stdout.write(f"\nFound {approved_contests.count()} approved contest(s):\n")
        
        for contest in approved_contests:
            assigned_count = contest.assigned_students.count()
            self.stdout.write(f"  • {contest.title} (ID: {contest.id})")
            self.stdout.write(f"    Created by: {contest.created_by.name}")
            self.stdout.write(f"    Assigned students: {assigned_count}")
            if contest.start_time:
                self.stdout.write(f"    Start: {contest.start_time.strftime('%Y-%m-%d %H:%M')}")
            self.stdout.write("")
        
        if not publish_all:
            confirm = input("\nPublish all these contests? (yes/no): ")
            if confirm.lower() not in ['yes', 'y']:
                self.stdout.write(self.style.WARNING("Cancelled."))
                return
        
        # Publish all approved contests
        published_count = 0
        for contest in approved_contests:
            contest.status = 'published'
            contest.save(update_fields=['status'])
            published_count += 1
            self.stdout.write(self.style.SUCCESS(
                f"✓ Published: {contest.title} (ID: {contest.id})"
            ))
        
        self.stdout.write(self.style.SUCCESS(
            f"\n✓ Successfully published {published_count} contest(s)!"
        ))
        self.stdout.write("\nStudents can now see these contests in their Contests page.")
