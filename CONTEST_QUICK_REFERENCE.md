# Contest System - Quick Reference Card

## 🚨 Common Issues & Quick Fixes

### Issue: Students see empty contest page

**Quick Fix:**
```bash
cd backend
python fix_student_contests.py
# Type 'yes' when prompted to publish contests
```

**Why:** Students can only see contests with `status='published'`

---

## 📊 Monitoring Commands

### See All Contests (Table View)
```bash
cd backend
python manage.py track_contests
```

### Check Contest Status
```bash
python manage.py check_contests
```

### Publish Approved Contests
```bash
python manage.py publish_contests --all
```

---

## 🔄 Contest Workflow

```
Staff Creates → Staff Submits → HOD Approves → Publish → Students See
   (draft)    (pending_approval)  (approved)  (published)
```

---

## 🎯 Quick Checks

### Check if student can see contests
```bash
python manage.py shell
```
```python
from apps.learning.models import Contest, StudentProfile

student = StudentProfile.objects.get(register_number='YOUR_NUMBER')
contests = Contest.objects.filter(assigned_students=student, status='published')
print(f'Can see: {contests.count()} contests')
```

### Check contest assignments
```python
contest = Contest.objects.get(id=CONTEST_ID)
print(f'Assigned: {contest.assigned_students.count()} students')
print(f'Status: {contest.status}')
```

### Check participations
```python
from apps.learning.models import ContestParticipation
contest = Contest.objects.get(id=CONTEST_ID)
participations = ContestParticipation.objects.filter(contest=contest)
print(f'Participations: {participations.count()}')
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Empty contest page | Run `python fix_student_contests.py` |
| Contest not visible | Check status is 'published' |
| Student can't start | Check if student is assigned |
| Timer not working | Check browser console for errors |
| Can't create contest | Check CSRF token in request |

---

## 📁 Important Files

### Backend
- `backend/fix_student_contests.py` - Main diagnostic tool
- `backend/apps/learning/views.py` - Contest views
- `backend/apps/learning/models.py` - Contest models

### Frontend
- `frontend/src/components/student/pages/StudentContestsPage.jsx`
- `frontend/src/components/student/pages/ContestDetailPage.jsx`
- `frontend/src/components/staff/StaffDashboard.jsx`
- `frontend/src/components/hod/HODDashboard.jsx`

### Documentation
- `STUDENT_CONTEST_VISIBILITY_FIXED.md` - Complete fix documentation
- `QUICK_FIX_STUDENT_CONTESTS.md` - Quick fix guide
- `CONTEST_QUICK_REFERENCE.md` - This file

---

## 🎯 Key Points to Remember

1. **Students only see `published` contests**
2. **Students must be assigned** (batch or individual)
3. **Use tracking command** to monitor status
4. **Auto-submit works** when timer expires
5. **No re-attempts** once started

---

## 📞 Quick Commands Cheat Sheet

```bash
# Track all contests
python manage.py track_contests

# Check status
python manage.py check_contests

# Publish approved
python manage.py publish_contests --all

# Fix student visibility
python fix_student_contests.py

# Django shell
python manage.py shell
```

---

## ✅ Success Indicators

- [ ] `track_contests` shows published contests
- [ ] Students assigned count > 0
- [ ] Student can see contests in browser
- [ ] Student can start contest
- [ ] Timer counts down correctly
- [ ] Auto-submit works at 00:00:00

---

**Last Updated:** April 15, 2026
**Status:** All systems operational ✅
