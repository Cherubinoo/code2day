# Test contest API endpoints
Write-Host "Testing Contest API Endpoints..." -ForegroundColor Cyan

# Test 1: Check if any published contests exist
Write-Host "`n1. Checking published contests in database..." -ForegroundColor Yellow
python backend/manage.py shell -c "
from apps.learning.models import Contest
contests = Contest.objects.filter(status='published')
print(f'Published contests: {contests.count()}')
for c in contests:
    print(f'  - {c.title} (ID: {c.id})')
    print(f'    Assigned students: {c.assigned_students.count()}')
    print(f'    Problems: {c.problems.count()}')
"

# Test 2: Check student profile
Write-Host "`n2. Checking student profiles..." -ForegroundColor Yellow
python backend/manage.py shell -c "
from apps.learning.models import StudentProfile
students = StudentProfile.objects.all()[:5]
print(f'Total students: {StudentProfile.objects.count()}')
for s in students:
    print(f'  - {s.user.username} (Register: {s.register_number})')
"

# Test 3: Check contest assignments
Write-Host "`n3. Checking contest assignments..." -ForegroundColor Yellow
python backend/manage.py shell -c "
from apps.learning.models import Contest, StudentProfile
contests = Contest.objects.filter(status='published')
for contest in contests:
    print(f'{contest.title}:')
    print(f'  Assigned students: {contest.assigned_students.count()}')
    if contest.assigned_students.exists():
        for student in contest.assigned_students.all()[:3]:
            print(f'    - {student.user.username}')
"

Write-Host "`nDone!" -ForegroundColor Green
