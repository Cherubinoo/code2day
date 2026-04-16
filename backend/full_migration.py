#!/usr/bin/env python
"""
Full MySQL to PostgreSQL Migration - ALL DATA
Migrates: Problems, TestCases, Institutions, Students, Staff, Submissions, etc.
"""
import os
import sys
import json
from datetime import datetime, date

# Django setup
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import django
django.setup()

import pymysql
from django.db import transaction
from django.contrib.auth.models import User

from apps.learning.models import (
    Problem, TestCase, Institution, StudentProfile, StaffProfile,
    Submission, ExecutionRecord, StudentActivity, DiscussionMessage,
    ProblemSolution, SolvedProblem, ProblemSession
)

# MySQL Connection (XAMPP default)
MYSQL_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': '',  # XAMPP default
    'database': 'ramcoad',
    'cursorclass': pymysql.cursors.DictCursor,
}

def mysql_connect():
    return pymysql.connect(**MYSQL_CONFIG)

def migrate_institutions(conn):
    """Migrate institutions from MySQL"""
    print("\n[1/7] Migrating Institutions...")
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM institutions")
        rows = cursor.fetchall()
    
    created = 0
    for row in rows:
        inst, _ = Institution.objects.update_or_create(
            institution_id=row['institution_id'],
            defaults={
                'name': row.get('name', ''),
                'short_code': row.get('short_code', ''),
                'address': row.get('address', ''),
                'contact_email': row.get('contact_email', ''),
                'contact_phone': row.get('contact_phone', ''),
                'is_active': bool(row.get('is_active', 1)),
            }
        )
        created += 1
    
    print(f"  ✓ {created} institutions")
    return rows

def migrate_staff(conn, institutions_map):
    """Migrate staff profiles and create Django users"""
    print("\n[2/7] Migrating Staff...")
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM staff_profiles")
        rows = cursor.fetchall()
    
    created = 0
    for row in rows:
        # Create Django User
        username = row['faculty_id']
        user, _ = User.objects.get_or_create(
            username=username,
            defaults={
                'first_name': row.get('name', '')[:150],
                'email': '',
                'is_active': True,
            }
        )
        
        # Get institution
        institution = None
        inst_id = row.get('institution_id')
        if inst_id and inst_id in institutions_map:
            institution = institutions_map[inst_id]
        
        staff, _ = StaffProfile.objects.update_or_create(
            faculty_id=row['faculty_id'],
            defaults={
                'account': user,
                'institution': institution,
                'name': row.get('name', ''),
                'role': row.get('role', 'staff'),
                'password': row.get('password', ''),
            }
        )
        created += 1
    
    print(f"  ✓ {created} staff profiles")
    return rows

def migrate_students(conn, institutions_map):
    """Migrate students and create Django users"""
    print("\n[3/7] Migrating Students...")
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM learning_studentprofile")
        rows = cursor.fetchall()
    
    created = 0
    for row in rows:
        register = row.get('register_number', '')
        if not register:
            continue
        
        # Create Django User
        user, _ = User.objects.get_or_create(
            username=register,
            defaults={
                'first_name': (row.get('name') or register)[:150],
                'email': row.get('personal_email', ''),
                'is_active': True,
            }
        )
        
        # Get institution
        institution = None
        inst_id = row.get('institution_id')
        if inst_id and inst_id in institutions_map:
            institution = institutions_map[inst_id]
        
        # Parse dates
        last_login = row.get('last_login_on')
        dob = row.get('date_of_birth')
        
        student, _ = StudentProfile.objects.update_or_create(
            register_number=register,
            defaults={
                'account': user,
                'institution': institution,
                'name': row.get('name', ''),
                'title': row.get('title', ''),
                'personal_email': row.get('personal_email', ''),
                'mobile_number': row.get('mobile_number', ''),
                'gender': row.get('gender', ''),
                'date_of_birth': dob,
                'father_name': row.get('father_name', ''),
                'mother_name': row.get('mother_name', ''),
                'current_streak': row.get('current_streak', 0),
                'login_days': row.get('login_days', 0),
                'last_login_on': last_login,
                'campus_rank': row.get('campus_rank', ''),
            }
        )
        created += 1
    
    print(f"  ✓ {created} students")
    return rows

def migrate_problems(conn):
    """Migrate problems and test cases"""
    print("\n[4/7] Migrating Problems & Test Cases...")
    
    # Problems
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM learning_problem")
        problems = cursor.fetchall()
    
    problem_map = {}  # MySQL id -> Django object
    for row in problems:
        problem, _ = Problem.objects.update_or_create(
            slug=row['slug'],
            defaults={
                'title': row.get('title', ''),
                'description': row.get('description', ''),
                'difficulty': row.get('difficulty', 'Medium'),
                'tags': _parse_json(row.get('tags'), []),
                'is_daily': bool(row.get('is_daily', 0)),
                'examples': _parse_json(row.get('examples'), []),
                'hints': _parse_json(row.get('hints'), []),
                'editorial': row.get('editorial', ''),
                'source_dataset_id': str(row.get('source_dataset_id', '')),
            }
        )
        problem_map[row['id']] = problem
    
    print(f"  ✓ {len(problems)} problems")
    
    # Test Cases
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM learning_testcase")
        testcases = cursor.fetchall()
    
    tc_count = 0
    for row in testcases:
        problem_id = row.get('problem_id')
        if problem_id and problem_id in problem_map:
            TestCase.objects.update_or_create(
                problem=problem_map[problem_id],
                order=row.get('order', 0),
                defaults={
                    'stdin': row.get('stdin', ''),
                    'expected_output': row.get('expected_output', ''),
                    'is_sample': bool(row.get('is_sample', 0)),
                }
            )
            tc_count += 1
    
    print(f"  ✓ {tc_count} test cases")
    return problem_map

def migrate_submissions(conn, problem_map, student_map):
    """Migrate submissions"""
    print("\n[5/7] Migrating Submissions...")
    
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM learning_submission")
        rows = cursor.fetchall()
    
    created = 0
    for row in rows:
        student_id = row.get('student_id')
        problem_id = row.get('problem_id')
        
        if student_id in student_map and problem_id in problem_map:
            Submission.objects.update_or_create(
                student=student_map[student_id],
                problem=problem_map[problem_id],
                defaults={
                    'language': row.get('language', 'javascript'),
                    'status': row.get('status', 'Accepted'),
                    'submitted_at': row.get('submitted_at') or datetime.now(),
                }
            )
            created += 1
    
    print(f"  ✓ {created} submissions")
    return rows

def migrate_student_activities(conn, student_map):
    """Migrate student activities (login/solve/practice)"""
    print("\n[6/7] Migrating Student Activities...")
    
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM learning_studentactivity")
        rows = cursor.fetchall()
    
    created = 0
    for row in rows:
        student_id = row.get('student_id')
        if student_id in student_map:
            StudentActivity.objects.get_or_create(
                student=student_map[student_id],
                activity_date=row.get('activity_date') or date.today(),
                activity_type=row.get('activity_type', 'practice'),
                defaults={'created_at': row.get('created_at') or datetime.now()}
            )
            created += 1
    
    print(f"  ✓ {created} activities")
    return rows

def migrate_solved_problems(conn, problem_map, student_map):
    """Migrate solved problems"""
    print("\n[7/7] Migrating Solved Problems...")
    
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM learning_solvedproblem")
        rows = cursor.fetchall()
    
    created = 0
    for row in rows:
        student_id = row.get('student_id')
        problem_id = row.get('problem_id')
        
        if student_id in student_map and problem_id in problem_map:
            SolvedProblem.objects.get_or_create(
                student=student_map[student_id],
                problem=problem_map[problem_id],
                defaults={
                    'language': row.get('language', 'Python'),
                    'solved_at': row.get('solved_at') or datetime.now(),
                }
            )
            created += 1
    
    print(f"  ✓ {created} solved problems")
    return rows

def _parse_json(value, default):
    """Safely parse JSON"""
    if not value:
        return default
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except:
            return default
    return default

def main():
    print("=" * 60)
    print("FULL MySQL → PostgreSQL MIGRATION")
    print("=" * 60)
    print(f"Source: {MYSQL_CONFIG['database']} @ {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}")
    print(f"Target: PostgreSQL (code2day)")
    print("=" * 60)
    
    try:
        conn = mysql_connect()
        print("\n✓ MySQL Connected")
    except Exception as e:
        print(f"\n✗ MySQL Connection Failed: {e}")
        return
    
    with transaction.atomic():
        # 1. Institutions (needed first for FKs)
        inst_rows = migrate_institutions(conn)
        institutions_map = {r['id']: Institution.objects.filter(institution_id=r['institution_id']).first() 
                           for r in inst_rows if r.get('id')}
        
        # 2. Staff
        staff_rows = migrate_staff(conn, institutions_map)
        
        # 3. Students
        student_rows = migrate_students(conn, institutions_map)
        student_map = {}
        for r in student_rows:
            if r.get('register_number'):
                student = StudentProfile.objects.filter(register_number=r['register_number']).first()
                if student:
                    student_map[r['id']] = student
        
        # 4. Problems & Test Cases
        problem_map = migrate_problems(conn)
        
        # 5. Submissions
        migrate_submissions(conn, problem_map, student_map)
        
        # 6. Student Activities
        migrate_student_activities(conn, student_map)
        
        # 7. Solved Problems
        migrate_solved_problems(conn, problem_map, student_map)
    
    conn.close()
    
    # Summary
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE!")
    print("=" * 60)
    print(f"Institutions:   {Institution.objects.count()}")
    print(f"Staff:          {StaffProfile.objects.count()}")
    print(f"Students:       {StudentProfile.objects.count()}")
    print(f"Problems:       {Problem.objects.count()}")
    print(f"Test Cases:     {TestCase.objects.count()}")
    print(f"Submissions:    {Submission.objects.count()}")
    print(f"Activities:     {StudentActivity.objects.count()}")
    print(f"Solved:         {SolvedProblem.objects.count()}")
    print("=" * 60)

if __name__ == "__main__":
    main()
