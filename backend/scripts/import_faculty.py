"""
Load faculty/staff data from MySQL (faculty_management_general_information)
and import to code2day staff_profiles table.
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
django.setup()

import pymysql
from django.conf import settings
from apps.learning.models import StaffProfile


def fetch_faculty_from_source_db():
    """Fetch faculty data from ramco_academic_system database."""
    faculty_data = []
    
    # Connect directly to source database
    source_db_config = {
        'host': settings.DATABASES['default']['HOST'],
        'user': settings.DATABASES['default']['USER'],
        'password': settings.DATABASES['default']['PASSWORD'],
        'database': 'ramco_academic_system',
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor,
    }
    
    try:
        conn = pymysql.connect(**source_db_config)
        with conn.cursor() as cursor:
            # Only fetch faculty_id and name
            cursor.execute("""
                SELECT faculty_id, name
                FROM faculty_management_general_information
            """)
            faculty_data = cursor.fetchall()
        conn.close()
    except Exception as e:
        raise Exception(f"Cannot connect to source DB: {e}")
    
    return faculty_data


def import_faculty_to_code2day(faculty_list):
    """Import faculty into StaffProfile model."""
    imported_count = 0
    skipped_count = 0
    
    for faculty in faculty_list:
        # Check if already exists by faculty_id
        existing = StaffProfile.objects.filter(faculty_id=faculty['faculty_id']).first()
        
        if existing:
            skipped_count += 1
            continue
        
        # Create new staff profile - only faculty_id and name
        StaffProfile.objects.create(
            faculty_id=str(faculty['faculty_id']),
            name=faculty['name'],
        )
        imported_count += 1
    
    return imported_count, skipped_count


def main():
    print("=" * 60)
    print("FACULTY/STAFF IMPORT: ramco_academic_system → code2day")
    print("=" * 60)
    
    print("\n1. Fetching faculty from faculty_management_general_information...")
    try:
        faculty_list = fetch_faculty_from_source_db()
        print(f"Found {len(faculty_list)} active faculty records")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    if not faculty_list:
        print("No faculty found to import")
        sys.exit(0)
    
    print("\n2. Importing to code2day StaffProfile...")
    imported, skipped = import_faculty_to_code2day(faculty_list)
    
    print(f"\n✅ Import completed!")
    print(f"   Imported: {imported}")
    print(f"   Skipped (already exist): {skipped}")
    print(f"   Total: {len(faculty_list)}")


if __name__ == "__main__":
    main()
