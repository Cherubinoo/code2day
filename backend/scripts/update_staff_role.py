#!/usr/bin/env python
"""
Script to update staff member role.
Usage: python scripts/update_staff_role.py <faculty_id> <role>
Example: python scripts/update_staff_role.py 1613 hod
"""

import sys
import os

# Add parent directory to path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, BACKEND_DIR)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
import django
django.setup()

from apps.learning.models import StaffProfile


def update_staff_role(faculty_id, new_role):
    """Update staff member role."""
    valid_roles = ['staff', 'hod', 'admin']
    
    if new_role not in valid_roles:
        print(f"Error: Invalid role '{new_role}'. Valid roles: {', '.join(valid_roles)}")
        return False
    
    try:
        staff = StaffProfile.objects.get(faculty_id=faculty_id)
        old_role = staff.role
        staff.role = new_role
        staff.save(update_fields=['role'])
        print(f"✓ Updated {staff.name} ({faculty_id}): {old_role} → {new_role}")
        return True
    except StaffProfile.DoesNotExist:
        print(f"✗ Staff with faculty_id '{faculty_id}' not found")
        return False


def list_staff():
    """List all staff members."""
    staff_list = StaffProfile.objects.all().order_by('faculty_id')
    print("\n" + "=" * 60)
    print(f"{'Faculty ID':<15} {'Name':<25} {'Role':<10} {'Active':<8}")
    print("=" * 60)
    for s in staff_list:
        active = "✓" if s.is_active else "✗"
        print(f"{s.faculty_id:<15} {s.name:<25} {s.role:<10} {active:<8}")
    print("=" * 60)


if __name__ == '__main__':
    if len(sys.argv) == 1:
        print("Usage: python update_staff_role.py <faculty_id> <role>")
        print("       python update_staff_role.py --list")
        print("\nRoles: staff, hod, admin")
        list_staff()
        sys.exit(0)
    
    if sys.argv[1] == '--list':
        list_staff()
        sys.exit(0)
    
    if len(sys.argv) != 3:
        print("Usage: python update_staff_role.py <faculty_id> <role>")
        sys.exit(1)
    
    faculty_id = sys.argv[2] if sys.argv[1] == 'hod' else sys.argv[1]
    new_role = sys.argv[2]
    
    update_staff_role(faculty_id, new_role)
