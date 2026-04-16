#!/usr/bin/env python
"""
Reset all user passwords to a default for testing
"""
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import django
django.setup()

from django.contrib.auth.models import User
from apps.learning.models import StudentProfile, StaffProfile

DEFAULT_PASSWORD = "123456"

print("=" * 50)
print("RESETTING ALL PASSWORDS")
print("=" * 50)
print(f"New default password: {DEFAULT_PASSWORD}")
print()

# Reset all Django user passwords
count = 0
for user in User.objects.all():
    user.set_password(DEFAULT_PASSWORD)
    user.save()
    count += 1
    print(f"  ✓ {user.username}")

# Clear staff profile passwords (they use Django auth)
for staff in StaffProfile.objects.all():
    staff.password = ""  # Clear legacy password field
    staff.save()

print()
print("=" * 50)
print(f"✓ {count} users updated")
print("=" * 50)
print()
print("LOGIN INSTRUCTIONS:")
print("  Username: Register Number (students) or Faculty ID (staff)")
print(f"  Password: {DEFAULT_PASSWORD}")
print()
print("Example logins:")
if StudentProfile.objects.first():
    s = StudentProfile.objects.first()
    print(f"  Student: {s.register_number} / {DEFAULT_PASSWORD}")
if StaffProfile.objects.first():
    s = StaffProfile.objects.first()
    print(f"  Staff:   {s.faculty_id} / {DEFAULT_PASSWORD}")
