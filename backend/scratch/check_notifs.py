import os
import django
from django.utils import timezone
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Notification

cutoff = timezone.now() - timedelta(minutes=10)
notifs = Notification.objects.filter(created_at__gte=cutoff)

print(f"Notifications in the last 10 minutes: {notifs.count()}")
for n in notifs:
    print(f"ID: {n.id}, Recipient: {n.recipient}, Title: {n.title}, Created At: {n.created_at}")
