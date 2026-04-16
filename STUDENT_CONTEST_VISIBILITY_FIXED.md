# Student Contest Visibility - FIXED ✅

## Problem Summary
Students were seeing an empty contest page with "No contests assigned yet" message.

## Root Cause
Students can **ONLY** see contests that meet BOTH criteria:
1. **Status = 'published'** (not draft, pending_approval, or approved)
2. **Student is assigned** (either individually or via batch)

The contests existed but were in 'approved' status, not 'published'.

---

## ✅ Solution Applied

### Published All Approved Contests
Ran `backend/fix_student_contests.py` which:
- Found 4 approved contests
- Published all 4 contests
- Verified student assignments

### Current Status (as of fix)
```
Total Contests: 4
Published (visible to students): 4
Currently Active: 4
Students Assigned: 120-126 per contest
```

---

## 🔍 Tracking & Monitoring

### Quick Status Check
```bash
cd backend
python manage.py track_contests
```

This displays a comprehensive table showing:
- Contest ID, Title, Status
- Live Status (Upcoming/Active/Ended)
- Assigned students count
- Participations and submissions
- Start/End times

### Example Output
```
+----+-------+-----------+-------------+----------+---------+--------+-------------+----------+
| ID | Title | Status    | Live Status | Assigned | Started | Active | Submissions | Problems |
+====+=======+===========+=============+==========+=========+========+=============+==========+
|  4 | test  | published | Active      |      120 |       0 |      0 |           0 |        3 |
|  3 | test  | published | Active      |      126 |       0 |      0 |           0 |        3 |
+----+-------+-----------+-------------+----------+---------+--------+-------------+----------+
```

### Check Specific Student
```bash
python manage.py shell
```

```python
from apps.learning.models import Contest, StudentProfile

# Find student
student = StudentProfile.objects.get(register_number='YOUR_REGISTER_NUMBER')

# Check visible contests
contests = Contest.objects.filter(
    assigned_students=student,
    status='published'
)

print(f'{student.name} can see {contests.count()} contests')
for c in contests:
    print(f'  - {c.title}')
```

---

## 📊 Contest Workflow

```
┌─────────┐     ┌──────────────────┐     ┌──────────┐     ┌───────────┐
│  Draft  │ --> │ Pending Approval │ --> │ Approved │ --> │ Published │
└─────────┘     └──────────────────┘     └──────────┘     └───────────┘
   Staff              Staff                   HOD            Auto/Manual
  Creates            Submits               Approves          Publishes
                                                          
                                                          ⬇️ Students can see
```

**Key Point:** Only 'published' contests are visible to students!

---

## 🛠️ Management Commands

### 1. Check Contest Status
```bash
python manage.py check_contests
```
Shows breakdown of contests by status.

### 2. Publish Approved Contests
```bash
python manage.py publish_contests --all
```
Publishes all approved contests at once.

### 3. Track Contests (NEW)
```bash
python manage.py track_contests
```
Comprehensive table view of all contests with participation stats.

---

## 🔧 Troubleshooting

### Students Still Can't See Contests?

**Check 1: Is contest published?**
```bash
python manage.py track_contests
```
Look for "Status" column - must be "published"

**Check 2: Is student assigned?**
```python
contest = Contest.objects.get(id=CONTEST_ID)
student = StudentProfile.objects.get(register_number='REGISTER_NUMBER')

is_assigned = contest.assigned_students.filter(id=student.id).exists()
print(f'Student assigned: {is_assigned}')
```

**Check 3: Has contest expired?**
```python
from django.utils import timezone
contest = Contest.objects.get(id=CONTEST_ID)
now = timezone.now()

if contest.end_time and now > contest.end_time:
    print('Contest has ended')
```

**Check 4: Browser cache**
- Clear browser cache
- Log out and log back in
- Try incognito/private mode

---

## 🎯 Features Implemented

### 1. Auto-Submit on Timer Expiry
When contest timer reaches 00:00:00, the system automatically submits the contest.

**Implementation:**
- `ContestDetailPage.jsx` - useEffect watches timer
- `/api/student/contests/<id>/auto-submit/` - Backend endpoint
- Prevents students from continuing after time expires

### 2. Prevent Re-Attempts
Once a student starts a contest, they cannot restart it.

**Implementation:**
- Unique constraint on `ContestParticipation` model
- Backend checks for existing participation
- Frontend shows "Continue" instead of "Start"

### 3. Expired Contest Badge
Staff dashboard shows red "Expired" badge for past contests.

**Implementation:**
- `StaffDashboard.jsx` - checks `contest.end_time < now`
- Visual indicator for contest status

### 4. Contest Detail Modal
View individual student submissions and performance.

**Implementation:**
- `ContestDetailModal.jsx` - Shows leaderboard and submissions
- Only displays students who have submitted
- Accessible from both HOD and Staff dashboards

---

## 📝 API Endpoints

### Student Contest Endpoints

**List Contests**
```
GET /api/student/contests/
```
Returns only published contests assigned to the student.

**Contest Detail**
```
GET /api/student/contests/<id>/
```
Returns contest details with problems and participation status.

**Start Contest**
```
POST /api/student/contests/<id>/start/
```
Creates ContestParticipation record. Requires CSRF token.

**Auto-Submit Contest**
```
POST /api/student/contests/<id>/auto-submit/
```
Automatically submits when timer expires. Requires CSRF token.

---

## 🚀 Next Steps

### For Students
1. Log in to student account
2. Navigate to "Contests" page
3. You should now see 4 active contests
4. Click "Start Contest" to begin
5. Timer will auto-submit when it reaches 00:00:00

### For Staff
1. Create contests using "Create Contest" button
2. Submit for approval
3. Wait for HOD approval
4. Once approved, run: `python manage.py publish_contests --all`
5. Students can now see the contest

### For HOD
1. Check "Pending Approvals" section in dashboard
2. Review contest details
3. Approve or reject contests
4. Approved contests need to be published (see above)

---

## 📦 Files Modified/Created

### Backend
- `backend/fix_student_contests.py` - Diagnostic and fix script
- `backend/apps/learning/management/commands/track_contests.py` - Tracking command
- `backend/apps/learning/management/commands/check_contests.py` - Status checker
- `backend/apps/learning/management/commands/publish_contests.py` - Bulk publisher
- `backend/apps/learning/views.py` - StudentContestAutoSubmitView added
- `backend/apps/learning/urls.py` - Auto-submit route added

### Frontend
- `frontend/src/components/student/pages/StudentContestsPage.jsx` - CSRF token fix
- `frontend/src/components/student/pages/ContestDetailPage.jsx` - Auto-submit feature
- `frontend/src/components/staff/StaffDashboard.jsx` - Expired badge
- `frontend/src/components/common/ContestDetailModal.jsx` - Analytics modal

### Documentation
- `STUDENT_CONTEST_VISIBILITY_FIXED.md` - This file
- `QUICK_FIX_STUDENT_CONTESTS.md` - Quick reference guide
- `STUDENT_CONTEST_FIXES.md` - Technical details
- `DEBUG_CONTEST_STATUS.md` - Debugging guide

---

## ✅ Verification

Run this to verify everything is working:

```bash
cd backend

# 1. Check contest status
python manage.py track_contests

# 2. Verify a student can see contests
python manage.py shell -c "
from apps.learning.models import Contest, StudentProfile
student = StudentProfile.objects.first()
contests = Contest.objects.filter(assigned_students=student, status='published')
print(f'{student.name} can see {contests.count()} contests')
"

# 3. Check in browser
# - Log in as student
# - Go to Contests page
# - Should see list of active contests
```

---

## 🎉 Success Criteria

- ✅ 4 contests published
- ✅ 120-126 students assigned per contest
- ✅ Students can see contests in UI
- ✅ Auto-submit on timer expiry
- ✅ Prevent re-attempts
- ✅ Expired contest badges
- ✅ Contest analytics modal
- ✅ Tracking command available

**Status: FIXED AND VERIFIED** ✅
