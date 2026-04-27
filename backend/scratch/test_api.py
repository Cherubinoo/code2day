import os
import django
import sys
from django.test import RequestFactory
from django.contrib.auth import get_user_model

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.append(os.getcwd())
django.setup()

from apps.learning.views import DiscussionMessageListCreateView
from apps.learning.models import StudentProfile, StaffProfile

User = get_user_model()

def test_get_messages():
    # Find a student who has sent a message
    # From my previous script: 953623243084 sent to staff_1613
    student_user = User.objects.get(username="953623243084")
    staff_user = User.objects.get(username="staff_1613")
    staff_reg = staff_user.staff_profile.faculty_id
    
    print(f"Testing for student {student_user.username} talking to staff {staff_user.username} (reg={staff_reg})")
    
    factory = RequestFactory()
    request = factory.get(f'/api/discussions/?thread_type=individual&other_user_reg={staff_reg}')
    request.user = student_user
    
    view = DiscussionMessageListCreateView.as_view()
    response = view(request)
    
    print(f"Status Code: {response.status_code}")
    print(f"Data: {response.data}")

if __name__ == "__main__":
    test_get_messages()
