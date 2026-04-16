# Student Contest Page Empty - Complete Fix Guide

## Problem
Student contest page shows "No contests assigned yet" even though contests exist.

## Root Cause
Students can **ONLY** see contests with `status = 'published'`

---

## Quick Diagnosis

### Step 1: Check if contests exist
```bash
cd backend
python manage.py check_contests
```

This will show:
- Total contests in database
- Contest status breakdown
- Which contests are visible to students
- Recommendations for fixes

### Step 2: Check specific student
```bash
python manage.py shell
```

```python
from apps.learning.models import Contest, StudentProfile

# Get student
student = StudentProfile.objects.get(register_number='YOUR_REGISTER_NUMBER')

# Check assigned contests
assigned = Contest.objects.filter(assigned_students=student)
print(f"Total assigned: {assigned.count()}")

# Check published contests
published = assigned.filter(status='published')
print(f"Published (visible): {published.count()}")

# Show all assigned contests with status
for c in assigned:
    print(f"- {c.title}: {c.status}")
```

---

## Solution 1: Publish Approved Contests (Recommended)

### Via Management Command:
```bash
cd backend

# Check what will be published
python manage.py publish_contests

# Publish all approved contests
python manage.py publish_contests --all

# Publish specific contest
python manage.py publish_contests --contest-id 1
```

### Via Django Shell:
```bash
python manage.py shell
```

```python
from apps.learning.models import Contest

# Publish all approved contests
approved = Contest.objects.filter(status='approved')
for contest in approved:
    contest.status = 'published'
    contest.save()
    print(f"Published: {contest.title}")
```

### Via SQL:
```sql
-- Connect to PostgreSQL
psql -U postgres -d code2day

-- Publish all approved contests
UPDATE contests 
SET status = 'published' 
WHERE status = 'approved';

-- Check result
SELECT id, title, status FROM contests;
```

---

## Solution 2: Complete Workflow

### For Staff (Create & Submit):
1. Log in as staff (e.g., user 1607)
2. Click "Create Contest" button
3. Fill out form:
   - Title, description
   - Select problems
   - Assign batches or students
4. Click "Submit for Approval"
5. Status changes: `draft` → `pending_approval`

### For HOD (Approve):
1. Log in as HOD (e.g., user 1223)
2. Go to "Contests" tab
3. See pending contests at top
4. Click "Approve Contest"
5. Status changes: `pending_approval` → `approved`

### For Staff/HOD (Publish):
1. After approval, contest status is `approved`
2. Click "Publish" button (if available in UI)
3. Or run: `python manage.py publish_contests`
4. Status changes: `approved` → `published`
5. **NOW students can see it!**

---

## Solution 3: Quick Test Contest

Create a test contest that's immediately published:

```bash
python manage.py shell
```

```python
from apps.learning.models import Contest, Problem, StudentProfile, StaffProfile, Department
from django.utils import timezone
from datetime import timedelta

# Get staff and department
staff = StaffProfile.objects.first()
department = Department.objects.first()

# Get some problems
problems = Problem.objects.all()[:3]

# Get some students
students = StudentProfile.objects.filter(department=department)[:10]

# Create contest
contest = Contest.objects.create(
    title="Test Contest - Published",
    description="This is a test contest that's immediately published",
    created_by=staff,
    department=department,
    institution=staff.institution,
    start_time=timezone.now(),
    end_time=timezone.now() + timedelta(hours=2),
    duration_minutes=120,
    status='published'  # ← Directly published!
)

# Add problems
contest.problems.set(problems)

# Assign students
contest.assigned_students.set(students)

print(f"✓ Created and published contest: {contest.title}")
print(f"  Assigned to {students.count()} students")
print(f"  Status: {contest.status}")
print(f"\nStudents can now see this contest!")
```

---

## Tracking Table

### Create Tracking View in Database

```sql
-- Create a view for easy contest tracking
CREATE OR REPLACE VIEW contest_tracking AS
SELECT 
    c.id,
    c.title,
    c.status,
    c.created_at,
    c.start_time,
    c.end_time,
    s.name as created_by,
    d.name as department,
    COUNT(DISTINCT ca.studentprofile_id) as assigned_students,
    COUNT(DISTINCT cp.id) as participations,
    CASE 
        WHEN c.status = 'published' THEN 'YES'
        ELSE 'NO'
    END as visible_to_students,
    CASE
        WHEN c.end_time < NOW() THEN 'EXPIRED'
        WHEN c.start_time > NOW() THEN 'UPCOMING'
        WHEN c.start_time <= NOW() AND c.end_time >= NOW() THEN 'ACTIVE'
        ELSE 'UNKNOWN'
    END as time_status
FROM contests c
LEFT JOIN staff_profiles s ON c.created_by_id = s.id
LEFT JOIN departments d ON c.department_id = d.id
LEFT JOIN contests_assigned_students ca ON c.id = ca.contest_id
LEFT JOIN contest_participations cp ON c.id = cp.contest_id
GROUP BY c.id, c.title, c.status, c.created_at, c.start_time, c.end_time, s.name, d.name
ORDER BY c.created_at DESC;

-- Query the view
SELECT * FROM contest_tracking;
```

### Use the Tracking View:
```sql
-- See all contests
SELECT * FROM contest_tracking;

-- See only visible contests
SELECT * FROM contest_tracking WHERE visible_to_students = 'YES';

-- See contests by status
SELECT status, COUNT(*) FROM contest_tracking GROUP BY status;

-- See active contests
SELECT * FROM contest_tracking WHERE time_status = 'ACTIVE';
```

---

## Monitoring Commands

### Check Contest Status:
```bash
python manage.py check_contests
```

**Output:**
```
================================================================================
CONTEST STATUS REPORT
================================================================================

Total Contests: 5

By Status:
  - draft: 1
  - pending_approval: 1
  - approved: 2
  - published: 1

⚠ Only 1 published contest! Students can only see published contests.

--------------------------------------------------------------------------------
DETAILED CONTEST LIST
--------------------------------------------------------------------------------

📋 Contest #5: Weekly Challenge
   Status: published
   Created by: John Doe (1607)
   Department: Computer Science (CSE)
   Assigned Students: 25
   Participations: 5
   Start: 2026-04-15 10:00
   End: 2026-04-15 12:00
   ✓ VISIBLE to 25 students
   Batches: 2023, 2024

📋 Contest #4: Algorithm Contest
   Status: approved
   Created by: Jane Smith (1608)
   Department: Computer Science (CSE)
   Assigned Students: 30
   Participations: 0
   ✗ NOT visible to students (status: approved)

================================================================================
RECOMMENDATIONS
================================================================================
• 2 approved contest(s) ready to publish
  → Run: python manage.py publish_contests
• 1 draft contest(s)
  → Staff should submit for approval
```

### Publish Contests:
```bash
python manage.py publish_contests --all
```

**Output:**
```
Found 2 approved contest(s):

  • Algorithm Contest (ID: 4)
    Created by: Jane Smith
    Assigned students: 30
    Start: 2026-04-16 14:00

  • Data Structures Quiz (ID: 3)
    Created by: John Doe
    Assigned students: 20
    Start: 2026-04-17 10:00

✓ Published: Algorithm Contest (ID: 4)
✓ Published: Data Structures Quiz (ID: 3)

✓ Successfully published 2 contest(s)!

Students can now see these contests in their Contests page.
```

---

## Verification

### 1. Check via API (Browser Console):
```javascript
// Open browser console on student page
fetch('/api/student/contests/', { credentials: 'include' })
  .then(r => r.json())
  .then(data => {
    console.log('Contests:', data.contests);
    console.log('Count:', data.contests.length);
  });
```

### 2. Check via Database:
```sql
-- Contests visible to a specific student
SELECT 
    c.id,
    c.title,
    c.status
FROM contests c
JOIN contests_assigned_students ca ON c.id = ca.contest_id
JOIN student_profiles sp ON ca.studentprofile_id = sp.id
WHERE sp.register_number = 'YOUR_REGISTER_NUMBER'
  AND c.status = 'published';
```

### 3. Check via Django Shell:
```python
from apps.learning.models import Contest, StudentProfile

student = StudentProfile.objects.get(register_number='YOUR_REGISTER_NUMBER')
visible_contests = Contest.objects.filter(
    assigned_students=student,
    status='published'
)

print(f"Student can see {visible_contests.count()} contests:")
for c in visible_contests:
    print(f"  - {c.title}")
```

---

## Common Issues

### Issue 1: "No contests found"
**Cause:** No contests in database  
**Fix:** Create contests via staff dashboard

### Issue 2: "Contests exist but page is empty"
**Cause:** Contests not published  
**Fix:** Run `python manage.py publish_contests --all`

### Issue 3: "Published but still empty"
**Cause:** Student not assigned to contest  
**Fix:** 
- Edit contest
- Assign student's batch or individual student
- Save

### Issue 4: "Student assigned but still empty"
**Cause:** Student not logged in properly  
**Fix:**
- Clear browser cache
- Log out and log in again
- Check session cookie exists

### Issue 5: "Contest expired"
**Cause:** end_time has passed  
**Fix:**
- Edit contest
- Update end_time to future date
- Save

---

## Files Created

1. `backend/apps/learning/management/commands/check_contests.py`
   - Check contest status and visibility
   - Usage: `python manage.py check_contests`

2. `backend/apps/learning/management/commands/publish_contests.py`
   - Publish approved contests
   - Usage: `python manage.py publish_contests --all`

3. `backend/check_contest_db.sql`
   - SQL queries for database checking
   - Run in PostgreSQL

4. `DEBUG_CONTEST_STATUS.md`
   - Detailed debugging guide

5. `STUDENT_CONTEST_EMPTY_FIX.md` (this file)
   - Complete fix guide

---

## Summary

**The student contest page is empty because:**
1. No contests exist, OR
2. Contests exist but status is NOT 'published', OR
3. Student is not assigned to any contests

**Quick fix:**
```bash
cd backend
python manage.py check_contests  # Diagnose
python manage.py publish_contests --all  # Fix
```

**Then refresh student page - contests should appear!**
