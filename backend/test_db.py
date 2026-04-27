import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.db_manager import delete_institution_db
from django.db import connection

try:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    delete_institution_db("code2day_inst_test99")
    print("Success")
except Exception as e:
    print(f"Error: {e}")
