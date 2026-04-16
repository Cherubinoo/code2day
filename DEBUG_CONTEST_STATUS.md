# Contest Status Debugging Guide

## Why Student Contest Page is Empty

Students can only see contests with **status = 'published'**

### Check Contest Status in Database

Run this SQL query in your PostgreSQL database:

```sql
-- Check all contests and their status
SELECT 
    id,
    title,
    status,
    created_by_id,
    start_time,
    end_time,
    created_at
FROM contests
ORDER BY created_at DESC;

-- Check which students are assigned to contests
SELECT 
    c.id as contest_id,
    c.title,
    c.status,
    COUNT(DISTINCT ca.studentprofile_id) as assigned_students
FROM contests c
LEFT JOIN contests_assigned_students ca ON c.id = ca.contest_id
GROUP BY c.id, c.title, c.status
ORDER BY c.created_at DESC;
```

### Contest Status Flow

```
draft → pending_approval → approved → published → active → completed
```

**Students can ONLY see contests with status = 'published'**

---

## How to Publish a Contest

### Option 1: Via HOD Dashboard (Recommended)
1. Log in as HOD (user 1223)
2. Go to "Contests" tab
3. Approve pending contests
4. Click "Publish" button on approved contests

### Option 2: Via Django Admin
1. Go to Django admin: `http://127.0.0.1:8000/admin/`
2. Navigate to Contests
3. Find your contest
4. Change status to "published"
5. Save

### Option 3: Via Database (Quick Fix)
```sql
-- Publish all approved contests
UPDATE contests 
SET status = 'published' 
WHERE status = 'approved';

-- Or publish a specific contest
UPDATE contests 
SET status = 'published' 
WHERE id = 1;  -- Replace with your contest ID
```

---

## Tracking Table for Contest Status

### Create a Contest Status Tracking View

Add this to your Django admin or create a management command:

```python
# backend/apps/learning/management/commands/check_contest_status.py

from django.core.management.base import BaseCommand
from apps.learning.models import Contest, ContestParticipation

class Command(BaseCommand):
    help = 'Check contest status and assignments'

    def handle(self, *args, **options):
        contests = Contest.objects.all().order_by('-created_at')
        
        self.stdout.write("\n" + "="*100)
        self.stdout.write("CONTEST STATUS REPORT")
        self.stdout.write("="*100 + "\n")
        
        for contest in contests:
            assigned_count = contest.assigned_students.count()
            participation_count = ContestParticipation.objects.filter(contest=contest).count()
            
            self.stdout.write(f"\nContest ID: {contest.id}")
            self.stdout.write(f"Title: {contest.title}")
            self.stdout.write(f"Status: {contest.status}")
            self.stdout.write(f"Created by: {contest.created_by.name} ({contest.created_by.faculty_id})")
            self.stdout.write(f"Department: {contest.department.name if contest.department else 'N/A'}")
            self.stdout.write(f"Assigned Students: {assigned_count}")
            self.stdout.write(f"Participations: {participation_count}")
            self.stdout.write(f"Start Time: {contest.start_time}")
            self.stdout.write(f"End Time: {contest.end_time}")
            self.stdout.write(f"Created: {contest.created_at}")
            
            if contest.status == 'published':
                self.stdout.write(self.style.SUCCESS("✓ Visible to students"))
            else:
                self.stdout.write(self.style.WARNING(f"✗ NOT visible to students (status: {contest.status})"))
            
            self.stdout.write("-" * 100)
```

**Run it:**
```bash
python manage.py check_contest_status
```

---

## Quick Fix Script

Create this script to publish all approved contests:

```python
# backend/scripts/publish_contests.py

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'code2day.settings')
django.setup()

from apps.learning.models import Contest

# Get all approved contests
approved_contests = Contest.objects.filter(status='approved')

print(f"Found {approved_contests.count()} approved contests")

for contest in approved_contests:
    contest.status = 'published'
    contest.save()
    print(f"✓ Published: {contest.title} (ID: {contest.id})")

print("\nDone! Students can now see these contests.")
```

**Run it:**
```bash
cd backend
python scripts/publish_contests.py
```

---

## Add Publish Button to Backend

Update the Contest model to add a publish method:

```python
# In backend/apps/learning/models.py - Contest model

def publish(self):
    """Publish an approved contest"""
    if self.status != 'approved':
        raise ValueError("Only approved contests can be published")
    
    self.status = 'published'
    self.save(update_fields=['status'])
    return True
```

---

## Frontend: Add Better Error Messages

Update StudentContestsPage to show why contests might be empty:

```javascript
{contests.length === 0 && (
  <div style={{
    padding: 60,
    textAlign: 'center',
    background: '#f9fafb',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
  }}>
    <Trophy size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
    <p style={{ color: '#666', margin: '0 0 8px' }}>No contests assigned yet</p>
    <p style={{ color: '#999', margin: 0, fontSize: 14 }}>
      Contests will appear here once your instructor publishes them
    </p>
  </div>
)}
```

---

## Debugging Checklist

### 1. Check if contests exist
```sql
SELECT COUNT(*) FROM contests;
```

### 2. Check contest status
```sql
SELECT status, COUNT(*) FROM contests GROUP BY status;
```

### 3. Check student assignments
```sql
SELECT 
    c.title,
    c.status,
    COUNT(ca.studentprofile_id) as assigned_students
FROM contests c
LEFT JOIN contests_assigned_students ca ON c.id = ca.contest_id
GROUP BY c.id, c.title, c.status;
```

### 4. Check if student is assigned
```sql
-- Replace with your student's register number
SELECT 
    c.id,
    c.title,
    c.status
FROM contests c
JOIN contests_assigned_students ca ON c.id = ca.contest_id
JOIN student_profiles sp ON ca.studentprofile_id = sp.id
WHERE sp.register_number = 'YOUR_REGISTER_NUMBER';
```

### 5. Check API response
Open browser console and check:
```javascript
fetch('/api/student/contests/', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log('Contests:', data));
```

---

## Common Issues & Solutions

### Issue 1: No contests in database
**Solution:** Create contests via staff dashboard

### Issue 2: Contests exist but status is 'draft' or 'approved'
**Solution:** Publish the contests (change status to 'published')

### Issue 3: Student not assigned to contest
**Solution:** 
- Staff: Edit contest → Assign batches or individual students
- Or use batch assignment when creating contest

### Issue 4: Contest expired (end_time passed)
**Solution:** 
- Edit contest and update end_time
- Or create a new contest

### Issue 5: Student not logged in properly
**Solution:** 
- Check if session cookie exists
- Re-login as student

---

## Monitoring Dashboard (Optional)

Create a simple monitoring page for admins:

```python
# backend/apps/learning/views.py

class ContestStatusDashboardView(APIView):
    """Admin view to see contest status"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required"}, status=403)
        
        contests = Contest.objects.all().order_by('-created_at')
        
        data = []
        for contest in contests:
            data.append({
                "id": contest.id,
                "title": contest.title,
                "status": contest.status,
                "created_by": contest.created_by.name,
                "assigned_students": contest.assigned_students.count(),
                "participations": ContestParticipation.objects.filter(contest=contest).count(),
                "visible_to_students": contest.status == 'published',
                "start_time": contest.start_time,
                "end_time": contest.end_time,
            })
        
        return Response({"contests": data})
```

---

## Quick Commands

### Check contest status
```bash
python manage.py shell
>>> from apps.learning.models import Contest
>>> Contest.objects.values('id', 'title', 'status')
```

### Publish all approved contests
```bash
python manage.py shell
>>> from apps.learning.models import Contest
>>> Contest.objects.filter(status='approved').update(status='published')
```

### Check student assignments
```bash
python manage.py shell
>>> from apps.learning.models import Contest
>>> contest = Contest.objects.first()
>>> contest.assigned_students.count()
```
