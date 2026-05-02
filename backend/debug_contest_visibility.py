#!/usr/bin/env python3
"""
Debug script to check contest visibility issues
"""
import os
import sys
import django

# Setup Django
sys.path.append('/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Contest, StudentProfile, ContestParticipation
from django.contrib.auth.models import User

def debug_contest_visibility():
    print("=== Contest Visibility Debug ===\n")
    
    # Get all published contests
    published_contests = Contest.objects.filter(status='published')
    print(f"Total published contests: {published_contests.count()}")
    
    for contest in published_contests:
        print(f"\n--- Contest: {contest.title} (ID: {contest.id}) ---")
        print(f"Status: {contest.status}")
        print(f"Department: {contest.department}")
        print(f"Institution: {contest.institution}")
        print(f"Contest Type: {contest.contest_type}")
        print(f"Start Time: {contest.start_time}")
        print(f"End Time: {contest.end_time}")
        print(f"Assigned Batches: {contest.assigned_batches}")
        print(f"Assigned Students Count: {contest.assigned_students.count()}")
        
        if contest.assigned_students.exists():
            print("Assigned Students:")
            for student in contest.assigned_students.all()[:5]:  # Show first 5
                print(f"  - {student.name} ({student.register_number}) - Batch: {student.batch}")
        
        print(f"Problems Count: {contest.problems.count()}")
        print(f"Aptitude Questions Count: {contest.aptitude_questions.count()}")
    
    # Get a sample student
    print(f"\n=== Sample Student Analysis ===")
    sample_student = StudentProfile.objects.first()
    if sample_student:
        print(f"Student: {sample_student.name} ({sample_student.register_number})")
        print(f"Batch: {sample_student.batch}")
        print(f"Department: {sample_student.department}")
        print(f"Institution: {sample_student.institution}")
        
        # Check which contests this student should see
        from django.db.models import Q
        accessible_contests = Contest.objects.filter(
            Q(assigned_students=sample_student) | Q(assigned_batches__contains=sample_student.batch),
            status='published'
        ).distinct()
        
        print(f"Accessible contests for this student: {accessible_contests.count()}")
        for contest in accessible_contests:
            print(f"  - {contest.title} (ID: {contest.id})")
    
    # Check if there are any students with matching batches
    print(f"\n=== Batch Matching Analysis ===")
    for contest in published_contests:
        if contest.assigned_batches:
            print(f"\nContest '{contest.title}' assigned to batches: {contest.assigned_batches}")
            for batch in contest.assigned_batches:
                matching_students = StudentProfile.objects.filter(batch=batch)
                print(f"  Batch '{batch}': {matching_students.count()} students")
                if matching_students.exists():
                    print(f"    Sample students: {[s.register_number for s in matching_students[:3]]}")

if __name__ == "__main__":
    debug_contest_visibility()