import os
import django
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.append(os.getcwd())
django.setup()
from apps.learning.models import User, StaffProfile, StudentProfile

def check_profiles():
    staff = StaffProfile.objects.all()
    print("Staff Profiles:")
    for s in staff[:5]:
        print(f"  User: {s.account.username}, Faculty ID: {s.faculty_id}, Name: {s.name}")
    
    students = StudentProfile.objects.all()
    print("Student Profiles:")
    for s in students[:5]:
        print(f"  User: {s.account.username}, Reg: {s.register_number}, Name: {s.name}")

if __name__ == "__main__":
    check_profiles()
