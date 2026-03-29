"""
Load faculty/staff data from MySQL (faculty_management_general_information)
and push to Convex database.
"""
import os
import sys
import requests
from dotenv import load_dotenv
import pymysql
from pymysql.cursors import DictCursor

# Load environment variables
load_dotenv()

# Convex Configuration
CONVEX_HTTP_URL = os.getenv("CONVEX_HTTP_URL", "https://rare-pig-419.convex.site")

# MySQL Configuration (source database)
MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": "ramco_academic_system",
    "charset": "utf8mb4",
    "cursorclass": DictCursor,
}


def fetch_faculty_from_mysql():
    """Fetch faculty data from MySQL database."""
    try:
        conn = pymysql.connect(**MYSQL_CONFIG)
        with conn.cursor() as cursor:
            sql = """
                SELECT faculty_id, name, email, department, designation, 
                       phone, joining_date, status
                FROM faculty_management_general_information
                WHERE status = 'Active'
            """
            cursor.execute(sql)
            results = cursor.fetchall()
            return results
    except Exception as e:
        print(f"Error fetching faculty from MySQL: {e}")
        return []
    finally:
        if conn:
            conn.close()


def transform_faculty_data(faculty_record):
    """Transform MySQL faculty record to Convex format."""
    return {
        "facultyId": str(faculty_record["faculty_id"]),
        "name": faculty_record["name"],
        "email": faculty_record.get("email", ""),
        "department": faculty_record.get("department", ""),
        "designation": faculty_record.get("designation", ""),
        "phone": faculty_record.get("phone", ""),
        "joiningDate": faculty_record.get("joining_date").isoformat() if faculty_record.get("joining_date") else None,
        "status": faculty_record.get("status", "Active"),
        "role": "staff",  # For authentication purposes
        "createdAt": None,  # Will be set by Convex
    }


def push_to_convex(staff_data):
    """Push staff data to Convex database."""
    endpoint = f"{CONVEX_HTTP_URL}/staff/bulk"
    
    try:
        response = requests.post(
            endpoint,
            json={"staff": staff_data},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"Successfully pushed {result.get('count', 0)} staff records to Convex")
            return True
        else:
            print(f"Failed to push to Convex: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Error pushing to Convex: {e}")
        return False


def main():
    print("=" * 60)
    print("FACULTY/STAFF DATA MIGRATION: MySQL → Convex")
    print("=" * 60)
    
    # Step 1: Fetch from MySQL
    print("\n1. Fetching faculty data from MySQL...")
    faculty_records = fetch_faculty_from_mysql()
    
    if not faculty_records:
        print("No faculty records found or error occurred.")
        sys.exit(1)
    
    print(f"Found {len(faculty_records)} faculty records")
    
    # Step 2: Transform data
    print("\n2. Transforming data for Convex...")
    transformed_data = [transform_faculty_data(record) for record in faculty_records]
    
    # Step 3: Push to Convex
    print("\n3. Pushing to Convex database...")
    success = push_to_convex(transformed_data)
    
    if success:
        print("\n✅ Migration completed successfully!")
        print(f"Total records migrated: {len(transformed_data)}")
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
