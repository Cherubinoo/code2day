#!/usr/bin/env python
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
import django
django.setup()

from apps.learning.models import StaffProfile

print("Staff Check:")
print("=" * 70)
print(f"{'FID':<8} {'Name':<25} {'Role':<8} {'Active':<8} {'Dept ID':<10}")
print("=" * 70)
for fid in ['1223', '1613', '1618', '1620']:
    try:
        s = StaffProfile.objects.get(faculty_id=fid)
        dept_id = s.department.id if s.department else 'None'
        active = '✓' if s.is_active else '✗ LOCKED'
        print(f'{fid:<8} {s.name:<25} {s.role:<8} {active:<8} {str(dept_id):<10}')
    except Exception as e:
        print(f'{fid}: Error - {e}')
print("=" * 70)
