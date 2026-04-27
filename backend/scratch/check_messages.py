import os
import django
from django.utils import timezone
from datetime import timedelta

import sys
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import DiscussionMessage, User, StudentProfile, StaffProfile

def check_messages():
    cutoff = timezone.now() - timedelta(hours=24)
    all_msgs = DiscussionMessage.objects.all().order_by('-created_at')
    print(f"Total messages in DB: {all_msgs.count()}")
    
    for msg in all_msgs[:10]:
        print(f"ID: {msg.id}, Type: {msg.thread_type}, Sender: {msg.sender.username if msg.sender else 'None'}, Recipient: {msg.recipient.username if msg.recipient else 'None'}, Created: {msg.created_at}")
        if msg.thread_type == 'individual':
            print(f"  - Body: {msg.body[:30]}...")

if __name__ == "__main__":
    check_messages()
