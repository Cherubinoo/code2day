import os
import django
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.append(os.getcwd())
django.setup()
from apps.learning.models import StaffProfile, StudentProfile

def check_spaces():
    print("Checking Staff Faculty IDs for spaces:")
    for s in StaffProfile.objects.all():
        if s.faculty_id.strip() != s.faculty_id:
            print(f"  - '{s.faculty_id}' has spaces!")
    
    print("Checking Student Register Numbers for spaces:")
    for s in StudentProfile.objects.all():
        if s.register_number and s.register_number.strip() != s.register_number:
            print(f"  - '{s.register_number}' has spaces!")

if __name__ == "__main__":
    check_spaces()
