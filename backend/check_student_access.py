#!/usr/bin/env python3
"""
Check which students can access the contests
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

def check_student_access():
    print("=== Student Access Check ===\n")
    
    # Get AD department students who should see contests
    ad_dept = Department.objects.filter(code='243').first()
    if ad_dept:
        print(f"AD Department: {ad_dept.name} (Code: {ad_dept.code})")
        
        # Get students in batches that have contests
        contest_batches = ['23-27', '24-28']
        ad_students = StudentProfile.objects.filter(
            department=ad_dept,
            batch__in=contest_batches
        ).select_related('account')
        
        print(f"AD students in contest batches: {ad_students.count()}")
        
        # Show some sample students with their login info
        for student in ad_students[:10]:
            has_account = student.account is not None
            print(f"  - {student.name} ({student.register_number}) - Batch: {student.batch} - Has Account: {has_account}")
            if has_account:
                print(f"    Username: {student.account.username}")
    
    # Check CSE department students
    cse_dept = Department.objects.filter(code='104').first()
    if cse_dept:
        print(f"\nCSE Department: {cse_dept.name} (Code: {cse_dept.code})")
        cse_students = StudentProfile.objects.filter(department=cse_dept).select_related('account')
        print(f"CSE students total: {cse_students.count()}")
        
        # Check if any contests are assigned to CSE students
        cse_contests = Contest.objects.filter(
            Q(assigned_students__department=cse_dept) | Q(department=cse_dept),
            status='published'
        ).distinct()
        print(f"Contests accessible to CSE students: {cse_contests.count()}")
    
    # Show all departments with contests
    print(f"\n=== All Departments with Published Contests ===")
    contest_depts = Contest.objects.filter(status='published').values_list('department__code', 'department__name').distinct()
    for dept_code, dept_name in contest_depts:
        print(f"  - {dept_code}: {dept_name}")

if __name__ == "__main__":
    check_student_access()