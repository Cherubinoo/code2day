"""
Management command to check contest status and assignments
Usage: python manage.py check_contests
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.learning.models import Contest, ContestParticipation, StudentProfile


class Command(BaseCommand):
    help = 'Check contest status, assignments, and visibility'

    def handle(self, *args, **options):
        self.stdout.write("\n" + "="*100)
        self.stdout.write(self.style.SUCCESS("CONTEST STATUS REPORT"))
        self.stdout.write("="*100 + "\n")
        
        contests = Contest.objects.all().order_by('-created_at')
        
        if not contests.exists():
            self.stdout.write(self.style.WARNING("⚠ No contests found in database"))
            self.stdout.write("\nTo create contests:")
            self.stdout.write("1. Log in as staff")
            self.stdout.write("2. Click 'Create Contest' button")
            self.stdout.write("3. Fill out the form and submit for approval")
            return
        
        # Summary statistics
        total = contests.count()
        by_status = {}
        for status_choice in Contest.CONTEST_STATUS_CHOICES:
            status_code = status_choice[0]
            count = contests.filter(status=status_code).count()
            by_status[status_code] = count
        
        self.stdout.write(f"\nTotal Contests: {total}")
        self.stdout.write("\nBy Status:")
        for status, count in by_status.items():
            if count > 0:
                self.stdout.write(f"  - {status}: {count}")
        
        published_count = by_status.get('published', 0)
        if published_count == 0:
            self.stdout.write(self.style.WARNING("\n⚠ No published contests! Students cannot see any contests."))
            self.stdout.write("\nTo publish contests:")
            self.stdout.write("1. HOD approves pending contests")
            self.stdout.write("2. Staff/HOD clicks 'Publish' button")
            self.stdout.write("3. Or run: python manage.py publish_contests")
        
        self.stdout.write("\n" + "-"*100)
        self.stdout.write("DETAILED CONTEST LIST")
        self.stdout.write("-"*100 + "\n")
        
        for contest in contests:
            assigned_count = contest.assigned_students.count()
            participation_count = ContestParticipation.objects.filter(contest=contest).count()
            
            # Check if expired
            now = timezone.now()
            is_expired = contest.end_time and now > contest.end_time
            
            self.stdout.write(f"\n📋 Contest #{contest.id}: {contest.title}")
            self.stdout.write(f"   Status: {contest.status}")
            self.stdout.write(f"   Created by: {contest.created_by.name} ({contest.created_by.faculty_id})")
            
            if contest.department:
                self.stdout.write(f"   Department: {contest.department.name} ({contest.department.code})")
            
            self.stdout.write(f"   Assigned Students: {assigned_count}")
            self.stdout.write(f"   Participations: {participation_count}")
            
            if contest.start_time:
                self.stdout.write(f"   Start: {contest.start_time.strftime('%Y-%m-%d %H:%M')}")
            if contest.end_time:
                self.stdout.write(f"   End: {contest.end_time.strftime('%Y-%m-%d %H:%M')}")
            
            if is_expired:
                self.stdout.write(self.style.ERROR("   ⏰ EXPIRED"))
            
            # Visibility check
            if contest.status == 'published':
                if assigned_count > 0:
                    self.stdout.write(self.style.SUCCESS(f"   ✓ VISIBLE to {assigned_count} students"))
                else:
                    self.stdout.write(self.style.WARNING("   ⚠ Published but NO students assigned"))
            else:
                self.stdout.write(self.style.WARNING(f"   ✗ NOT visible to students (status: {contest.status})"))
            
            # Show assigned batches
            if contest.assigned_batches:
                self.stdout.write(f"   Batches: {', '.join(contest.assigned_batches)}")
            
            self.stdout.write("")
        
        self.stdout.write("\n" + "="*100)
        self.stdout.write("RECOMMENDATIONS")
        self.stdout.write("="*100 + "\n")
        
        # Check for issues and provide recommendations
        pending = contests.filter(status='pending_approval').count()
        approved = contests.filter(status='approved').count()
        draft = contests.filter(status='draft').count()
        
        if pending > 0:
            self.stdout.write(f"• {pending} contest(s) pending HOD approval")
            self.stdout.write("  → HOD should review and approve/reject")
        
        if approved > 0:
            self.stdout.write(f"• {approved} approved contest(s) ready to publish")
            self.stdout.write("  → Run: python manage.py publish_contests")
        
        if draft > 0:
            self.stdout.write(f"• {draft} draft contest(s)")
            self.stdout.write("  → Staff should submit for approval")
        
        # Check for contests with no students
        no_students = contests.filter(status='published', assigned_students=None).count()
        if no_students > 0:
            self.stdout.write(f"• {no_students} published contest(s) with NO students assigned")
            self.stdout.write("  → Staff should assign batches or students")
        
        self.stdout.write("\n" + "="*100 + "\n")
