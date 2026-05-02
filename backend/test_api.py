#!/usr/bin/env python3
"""
Test aptitude questions API
"""
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from django.test import Client
from django.contrib.auth.models import User
from apps.learning.models import StaffProfile, Department, Institution

def test_api():
    print("🧪 Testing Aptitude Questions API")
    print("=" * 50)
    
    client = Client()
    
    # Test without authentication
    print("📡 Testing without authentication:")
    response = client.get('/api/aptitude/questions/')
    print(f"  Status: {response.status_code}")
    
    # Test with authentication
    print("\n🔐 Testing with authentication:")
    try:
        # Get or create a staff user
        user = User.objects.filter(username='test_staff').first()
        if not user:
            user = User.objects.create_user(username='test_staff', password='test123')
        
        # Get or create staff profile
        staff = StaffProfile.objects.filter(account=user).first()
        if not staff:
            dept = Department.objects.first()
            inst = Institution.objects.first()
            staff = StaffProfile.objects.create(
                account=user,
                faculty_id='TEST001',
                name='Test Staff',
                department=dept,
                institution=inst,
                role='staff'
            )
        
        # Login
        client.force_login(user)
        
        # Test API calls
        response = client.get('/api/aptitude/questions/')
        print(f"  All questions: Status {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"  Questions returned: {len(data)}")
            if data:
                print(f"  Sample question: ID={data[0].get('id')}, Topic={data[0].get('topic')}")
        
        # Test with topic filter
        response = client.get('/api/aptitude/questions/?topic_id=88')
        print(f"  Topic 88 filter: Status {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"  Questions for topic 88: {len(data)}")
        
        # Test with multiple topics
        response = client.get('/api/aptitude/questions/?topic_id=88&topic_id=89')
        print(f"  Multiple topics: Status {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"  Questions for topics 88,89: {len(data)}")
            
    except Exception as e:
        print(f"  Error: {e}")

if __name__ == "__main__":
    test_api()