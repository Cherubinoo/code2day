#!/usr/bin/env python3
"""
Check the logged in student and their contest access
"""
import os
import sys
import django

# Setup Django
sys.path.append('/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Contest, StudentProfile, Department
from django.contrib.auth.models import User
from django.db.models import Q

def check_logged_student():
    print("=== Logged Student Check ===\n")
    
    # Check student 953623243023
    student = StudentProfile.objects.filter(register_number='953623243023').first()
    if student:
        print(f"Student: {student.name} ({student.register_number})")
        print(f"Batch: {student.batch}")
        print(f"Department: {student.department}")
        print(f"Institution: {student.institution}")
        
        # Check accessible contests
        accessible_contests = Contest.objects.filter(
            Q(assigned_students=student) | Q(assigned_batches__contains=student.batch),
            status='published'
        ).distinct()
        
        print(f"\nAccessible contests: {accessible_contests.count()}")
        for contest in accessible_contests:
            print(f"  - {contest.title} (ID: {contest.id})")
            print(f"    Type: {contest.contest_type}")
            print(f"    Start: {contest.start_time}")
            print(f"    End: {contest.end_time}")
            print(f"    Problems: {contest.problems.count()}")
            
            # Check if student is directly assigned
            is_directly_assigned = contest.assigned_students.filter(id=student.id).exists()
            is_batch_assigned = student.batch in contest.assigned_batches
            print(f"    Direct assignment: {is_directly_assigned}")
            print(f"    Batch assignment: {is_batch_assigned}")
            print()
    else:
        print("Student 953623243023 not found!")

if __name__ == "__main__":
    check_logged_student()