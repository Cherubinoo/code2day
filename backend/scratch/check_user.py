import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import StudentProfile, StaffProfile

reg = "1607"
student = StudentProfile.objects.filter(register_number=reg).first()
staff = StaffProfile.objects.filter(faculty_id=reg).first()

print(f"Lookup for {reg}:")
if student:
    print(f"Student: {student.name}, Dept: {student.department}")
if staff:
    print(f"Staff: {staff.name}, Dept: {staff.department}, Role: {staff.role}")
if not student and not staff:
    print("Not found in StudentProfile or StaffProfile")
