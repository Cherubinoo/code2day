#!/usr/bin/env python3
"""
Test script for session-based contest timing
"""
import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from django.utils import timezone
from apps.learning.models import Contest, ContestParticipation, StaffProfile, StudentProfile, Department, Institution

def test_session_based_contest():
    print("🧪 Testing Session-Based Contest Timing System")
    print("=" * 50)
    
    # Get test data
    try:
        staff = StaffProfile.objects.filter(role='staff').first()
        student = StudentProfile.objects.first()
        department = Department.objects.first()
        institution = Institution.objects.first()
        
        if not all([staff, student, department, institution]):
            print("❌ Missing test data (staff, student, department, or institution)")
            return
            
        print(f"✅ Using staff: {staff.faculty_id}")
        print(f"✅ Using student: {student.register_number}")
        print(f"✅ Using department: {department.code}")
        
        # Create a test contest with session-based timing
        now = timezone.now()
        contest = Contest.objects.create(
            title="Test Session-Based Contest",
            description="Testing individual session timing with auto-submit",
            created_by=staff,
            department=department,
            institution=institution,
            contest_type="programming",
            # Access window: available for next 2 hours
            access_start_time=now,
            access_end_time=now + timedelta(hours=2),
            # Individual session: 5 minutes per student
            session_duration_minutes=5,
            status="published",
            assigned_batches=[student.batch]
        )
        
        print(f"✅ Created contest: {contest.title} (ID: {contest.id})")
        print(f"   📅 Access window: {contest.access_start_time} to {contest.access_end_time}")
        print(f"   ⏱️  Session duration: {contest.session_duration_minutes} minutes")
        print(f"   🎯 Status: {contest.status}")
        
        # Test contest properties
        print(f"\n🔍 Contest Status Checks:")
        print(f"   is_active: {contest.is_active}")
        print(f"   is_upcoming: {contest.is_upcoming}")
        print(f"   is_ended: {contest.is_ended}")
        
        # Create a participation (simulate student starting contest)
        participation = ContestParticipation.objects.create(
            contest=contest,
            student=student
        )
        
        print(f"\n✅ Created participation for {student.register_number}")
        print(f"   🚀 Started at: {participation.started_at}")
        print(f"   ⏰ Session ends at: {participation.session_end_time}")
        print(f"   ⏳ Remaining time: {participation.remaining_time_seconds} seconds")
        print(f"   🔄 Is active: {participation.is_active}")
        print(f"   ⚠️  Is expired: {participation.is_session_expired}")
        
        # Test session expiry (simulate time passing)
        print(f"\n🕐 Simulating session expiry...")
        
        # Manually set session end time to past (simulate expiry)
        participation.session_end_time = now - timedelta(minutes=1)
        participation.save()
        
        print(f"   ⏰ Updated session end time to: {participation.session_end_time}")
        print(f"   ⚠️  Is expired now: {participation.is_session_expired}")
        print(f"   ⏳ Remaining time: {participation.remaining_time_seconds} seconds")
        
        # Test auto-submit
        if participation.is_session_expired and participation.is_active:
            participation.end_participation(auto_submitted=True)
            print(f"   ✅ Auto-submitted participation")
            print(f"   🏁 Completed at: {participation.completed_at}")
            print(f"   🤖 Auto-submitted: {participation.auto_submitted}")
            print(f"   ⏱️  Total time spent: {participation.time_spent_seconds} seconds")
        
        print(f"\n🎉 Session-based contest timing test completed successfully!")
        print(f"📊 Contest ID: {contest.id} (you can test this in the frontend)")
        
        return contest.id
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_session_based_contest()