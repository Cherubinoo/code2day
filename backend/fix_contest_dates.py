#!/usr/bin/env python3
"""
Fix contest dates to make them active now
"""
import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django
sys.path.append('/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Contest
from django.utils import timezone

def fix_contest_dates():
    print("=== Fixing Contest Dates ===\n")
    
    # Get all published contests
    contests = Contest.objects.filter(status='published')
    
    now = timezone.now()
    
    for contest in contests:
        print(f"Contest: {contest.title} (ID: {contest.id})")
        print(f"  Current start: {contest.start_time}")
        print(f"  Current end: {contest.end_time}")
        
        # Set new times: start now, end in 2 hours
        new_start = now
        new_end = now + timedelta(hours=2)
        
        contest.start_time = new_start
        contest.end_time = new_end
        contest.save(update_fields=['start_time', 'end_time'])
        
        print(f"  New start: {contest.start_time}")
        print(f"  New end: {contest.end_time}")
        print(f"  Status: ACTIVE\n")
    
    print(f"Updated {contests.count()} contests to be active now!")

if __name__ == "__main__":
    fix_contest_dates()