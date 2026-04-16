#!/usr/bin/env python
"""Quick script to check PostgreSQL connection and show data counts"""
import os
import sys

# Set environment for PostgreSQL (hardcoded from settings)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
os.environ['DB_PASSWORD'] = '123'  # Matches settings.py default
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import django
    django.setup()
    
    from apps.learning.models import Problem, TestCase, StudentProfile, Institution, StaffProfile
    
    print("=" * 50)
    print("PostgreSQL Connection: OK")
    print("=" * 50)
    print()
    print("Data Counts:")
    print(f"  Problems:       {Problem.objects.count()}")
    print(f"  Test Cases:     {TestCase.objects.count()}")
    print(f"  Students:       {StudentProfile.objects.count()}")
    print(f"  Institutions:   {Institution.objects.count()}")
    print(f"  Staff:          {StaffProfile.objects.count()}")
    print()
    
    if Problem.objects.count() > 0:
        print("Sample Problems:")
        for p in Problem.objects.all()[:5]:
            tc_count = TestCase.objects.filter(problem=p).count()
            print(f"  - {p.slug}: {p.title} ({tc_count} test cases)")
    
except Exception as e:
    print("ERROR: Could not connect to PostgreSQL")
    print(f"Details: {e}")
    print()
    print("Make sure:")
    print("  1. PostgreSQL service is running")
    print("  2. Database 'code2day' exists in pgAdmin")
    print("  3. Password '123' is correct (update in settings.py if needed)")
