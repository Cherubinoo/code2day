#!/usr/bin/env python
import sys, os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
import django
django.setup()
from apps.learning.models import StaffProfile

s = StaffProfile.objects.get(faculty_id='1223')
print(f'Role value: "{s.role}"')
print(f'Role length: {len(s.role)}')
print(f'Role repr: {repr(s.role)}')
print(f'Is hod: {s.role == "hod"}')
