import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import StudentProfile, StaffProfile

# Assuming the current user is a student
students = StudentProfile.objects.all()
for s in students:
    print(f"Student: {s.name} ({s.register_number}), Dept: {s.department}")

staff_1607 = StaffProfile.objects.filter(faculty_id="1607").first()
print(f"\nTarget Staff: {staff_1607.name}, Dept ID: {staff_1607.department_id if staff_1607 else 'N/A'}")
