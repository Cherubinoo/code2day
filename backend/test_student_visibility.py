#!/usr/bin/env python
"""
Test script to verify student contest visibility
Run this to confirm students can see published contests
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Contest, StudentProfile, ContestParticipation
from django.utils import timezone


def test_student_visibility():
    print("\n" + "="*80)
    print("STUDENT CONTEST VISIBILITY TEST")
    print("="*80 + "\n")
    
    # Get published contests
    published_contests = Contest.objects.filter(status='published')
    print(f"✓ Published contests: {published_contests.count()}")
    
    if published_contests.count() == 0:
        print("\n❌ No published contests found!")
        print("Run: python fix_student_contests.py")
        return False
    
    # Get a sample student who is actually assigned to a published contest
    published_contests = Contest.objects.filter(status='published')
    sample_student = None
    
    for contest in published_contests:
        sample_student = contest.assigned_students.first()
        if sample_student:
            break
    
    if not sample_student:
        # Fallback to any student
        sample_student = StudentProfile.objects.first()
    
    if not sample_student:
        print("\n❌ No students found in database!")
        return False
    
    print(f"✓ Testing with student: {sample_student.name} ({sample_student.register_number})")
    
    # Check what contests this student can see
    visible_contests = Contest.objects.filter(
        assigned_students=sample_student,
        status='published'
    )
    
    print(f"✓ Student can see: {visible_contests.count()} contest(s)")
    
    if visible_contests.count() == 0:
        print("\n⚠ Student cannot see any contests!")
        print("\nPossible reasons:")
        print("1. Student not assigned to any published contests")
        print("2. All contests have expired")
        
        # Check if student is assigned to any contest
        all_assignments = Contest.objects.filter(assigned_students=sample_student)
        print(f"\nStudent is assigned to {all_assignments.count()} contest(s) total")
        
        if all_assignments.count() > 0:
            print("\nContest status breakdown for this student:")
            for contest in all_assignments:
                print(f"  - {contest.title}: {contest.status}")
        
        return False
    
    # Show details of visible contests
    print("\n" + "-"*80)
    print("VISIBLE CONTESTS:")
    print("-"*80)
    
    now = timezone.now()
    for contest in visible_contests:
        # Check if active
        is_active = False
        is_ended = False
        
        if contest.start_time and contest.end_time:
            if contest.start_time <= now <= contest.end_time:
                is_active = True
            elif now > contest.end_time:
                is_ended = True
        
        status_emoji = "🟢" if is_active else ("🔴" if is_ended else "🔵")
        status_text = "Active" if is_active else ("Ended" if is_ended else "Upcoming")
        
        print(f"\n{status_emoji} {contest.title} (ID: {contest.id})")
        print(f"   Status: {status_text}")
        print(f"   Problems: {contest.problems.count()}")
        print(f"   Duration: {contest.duration_minutes} minutes")
        
        if contest.start_time:
            print(f"   Start: {contest.start_time.strftime('%Y-%m-%d %H:%M')}")
        if contest.end_time:
            print(f"   End: {contest.end_time.strftime('%Y-%m-%d %H:%M')}")
    
    # Test API response simulation
    print("\n" + "-"*80)
    print("API RESPONSE SIMULATION:")
    print("-"*80)
    
    api_data = []
    for contest in visible_contests:
        participation = ContestParticipation.objects.filter(
            contest=contest,
            student=sample_student
        ).first()
        
        now = timezone.now()
        is_active = False
        is_upcoming = False
        is_ended = False
        
        if contest.start_time and contest.end_time:
            if now < contest.start_time:
                is_upcoming = True
            elif contest.start_time <= now <= contest.end_time:
                is_active = True
            else:
                is_ended = True
        
        api_data.append({
            "id": contest.id,
            "title": contest.title,
            "is_active": is_active,
            "is_upcoming": is_upcoming,
            "is_ended": is_ended,
            "has_started": participation is not None,
        })
    
    print(f"\nAPI would return {len(api_data)} contest(s):")
    for item in api_data:
        status = "Active" if item['is_active'] else ("Upcoming" if item['is_upcoming'] else "Ended")
        started = "Started" if item['has_started'] else "Not Started"
        print(f"  - {item['title']}: {status}, {started}")
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    active_count = sum(1 for c in api_data if c['is_active'])
    upcoming_count = sum(1 for c in api_data if c['is_upcoming'])
    ended_count = sum(1 for c in api_data if c['is_ended'])
    
    print(f"✓ Total visible contests: {len(api_data)}")
    print(f"  - Active: {active_count}")
    print(f"  - Upcoming: {upcoming_count}")
    print(f"  - Ended: {ended_count}")
    
    if len(api_data) > 0:
        print("\n✅ TEST PASSED: Student can see contests!")
        print("\nNext steps:")
        print("1. Log in as student in browser")
        print("2. Navigate to Contests page")
        print("3. You should see the contests listed above")
        return True
    else:
        print("\n❌ TEST FAILED: Student cannot see any contests")
        return False


if __name__ == '__main__':
    success = test_student_visibility()
    sys.exit(0 if success else 1)
