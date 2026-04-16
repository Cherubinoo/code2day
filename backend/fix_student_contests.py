#!/usr/bin/env python
"""
Quick fix script for student contest visibility
Run this to diagnose and fix why students can't see contests
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Contest, StudentProfile, ContestParticipation
from django.utils import timezone


def main():
    print("\n" + "="*80)
    print("STUDENT CONTEST VISIBILITY FIX")
    print("="*80 + "\n")
    
    # Check 1: Do contests exist?
    total_contests = Contest.objects.count()
    print(f"✓ Total contests in database: {total_contests}")
    
    if total_contests == 0:
        print("\n❌ NO CONTESTS FOUND!")
        print("\nTo create contests:")
        print("1. Log in as staff")
        print("2. Click 'Create Contest' button")
        print("3. Fill out form and submit")
        return
    
    # Check 2: Contest status breakdown
    print("\nContest Status Breakdown:")
    for status_choice in Contest.CONTEST_STATUS_CHOICES:
        status_code = status_choice[0]
        status_label = status_choice[1]
        count = Contest.objects.filter(status=status_code).count()
        if count > 0:
            print(f"  - {status_label}: {count}")
    
    # Check 3: Published contests
    published = Contest.objects.filter(status='published')
    published_count = published.count()
    
    print(f"\n{'✓' if published_count > 0 else '❌'} Published contests (visible to students): {published_count}")
    
    if published_count == 0:
        print("\n⚠ WARNING: No published contests!")
        print("Students can ONLY see contests with status='published'")
        
        # Check for approved contests
        approved = Contest.objects.filter(status='approved')
        approved_count = approved.count()
        
        if approved_count > 0:
            print(f"\n✓ Found {approved_count} approved contest(s) ready to publish:")
            for contest in approved:
                assigned = contest.assigned_students.count()
                print(f"  - {contest.title} (ID: {contest.id}) - {assigned} students assigned")
            
            print("\n" + "-"*80)
            response = input(f"\nPublish all {approved_count} approved contests? (yes/no): ")
            
            if response.lower() in ['yes', 'y']:
                for contest in approved:
                    contest.status = 'published'
                    contest.save()
                    print(f"✓ Published: {contest.title}")
                
                print(f"\n✓ Successfully published {approved_count} contest(s)!")
                print("Students can now see these contests.")
                
                # Recount published
                published_count = Contest.objects.filter(status='published').count()
            else:
                print("\nCancelled. To publish later, run:")
                print("  python manage.py publish_contests --all")
                return
        else:
            print("\n❌ No approved contests to publish.")
            print("\nWorkflow:")
            print("  1. Staff creates contest (draft)")
            print("  2. Staff submits for approval (pending_approval)")
            print("  3. HOD approves (approved)")
            print("  4. Run this script to publish (published)")
            return
    
    # Check 4: Student assignments
    print("\n" + "-"*80)
    print("Published Contest Details:")
    print("-"*80)
    
    for contest in Contest.objects.filter(status='published'):
        assigned = contest.assigned_students.count()
        participations = ContestParticipation.objects.filter(contest=contest).count()
        
        # Check if expired
        is_expired = contest.end_time and timezone.now() > contest.end_time
        
        print(f"\n📋 {contest.title} (ID: {contest.id})")
        print(f"   Created by: {contest.created_by.name}")
        if contest.department:
            print(f"   Department: {contest.department.name}")
        print(f"   Assigned students: {assigned}")
        print(f"   Participations: {participations}")
        if contest.start_time:
            print(f"   Start: {contest.start_time.strftime('%Y-%m-%d %H:%M')}")
        if contest.end_time:
            print(f"   End: {contest.end_time.strftime('%Y-%m-%d %H:%M')}")
        if is_expired:
            print(f"   ⏰ Status: EXPIRED")
        
        if assigned == 0:
            print(f"   ⚠ WARNING: No students assigned!")
        else:
            print(f"   ✓ Visible to {assigned} students")
    
    # Check 5: Sample student check
    print("\n" + "-"*80)
    print("Sample Student Check:")
    print("-"*80)
    
    sample_student = StudentProfile.objects.first()
    if sample_student:
        visible = Contest.objects.filter(
            assigned_students=sample_student,
            status='published'
        ).count()
        
        print(f"\nStudent: {sample_student.name} ({sample_student.register_number})")
        print(f"Can see: {visible} contest(s)")
        
        if visible == 0:
            print("\n⚠ This student cannot see any contests!")
            print("Possible reasons:")
            print("  1. Student not assigned to any published contests")
            print("  2. All contests expired")
            print("\nTo fix:")
            print("  - Edit contest and assign student's batch")
            print("  - Or assign student individually")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if published_count > 0:
        print(f"\n✓ {published_count} published contest(s)")
        print("✓ Students should be able to see contests")
        print("\nIf students still can't see contests:")
        print("  1. Check if student is assigned to contests")
        print("  2. Check if contests have expired")
        print("  3. Clear browser cache and re-login")
    else:
        print("\n❌ No published contests")
        print("Students cannot see any contests")
        print("\nRun this script again to publish approved contests")
    
    print("\n" + "="*80 + "\n")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
