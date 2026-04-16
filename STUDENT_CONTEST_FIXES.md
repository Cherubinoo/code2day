# Student Contest System - Complete Fixes

## Issues Fixed

### 1. ✅ Students Can't See Contests
**Problem:** Students couldn't see assigned contests  
**Root Cause:** Contests need to be in "published" status to be visible to students  
**Solution:** Backend already filters by `status='published'` - Staff/HOD need to publish contests after approval

**Workflow:**
```
Draft → Pending Approval → Approved → Published (visible to students)
```

**How to Publish:**
- HOD approves contest
- Staff/HOD clicks "Publish" button
- Contest becomes visible to assigned students

---

### 2. ✅ Can't Start Contest (CSRF Token Missing)
**Problem:** Students got 403 Forbidden when trying to start contests  
**File:** `frontend/src/components/student/pages/StudentContestsPage.jsx`

**Fix:**
```javascript
// Added CSRF token to start contest request
import { getCsrfToken } from '../../../lib/appUtils';

async function handleStartContest(contestId) {
  const res = await fetch(`/api/student/contests/${contestId}/start/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRFToken': getCsrfToken(),  // ✅ Added
    },
  });
  // ... rest of code
}
```

**Result:** Students can now successfully start contests

---

### 3. ✅ Prevent Re-Attempts After Starting
**Problem:** Students could restart contests multiple times  
**Solution:** Backend already prevents this

**Backend Logic** (`StudentContestStartView`):
```python
# Check if already started
participation = ContestParticipation.objects.filter(
    contest=contest,
    student=student
).first()

if participation:
    return Response(
        {"detail": "You have already started this contest."},
        status=status.HTTP_400_BAD_REQUEST
    )
```

**Frontend Display:**
- If `has_started` is true → Show "Continue Contest" button
- If `has_started` is false → Show "Start Contest" button
- Once started, cannot restart

---

### 4. ✅ Auto-Submit When Timer Expires
**Problem:** Contest didn't auto-submit when 60 minutes elapsed  
**Files Modified:**
- `frontend/src/components/student/pages/ContestDetailPage.jsx`
- `backend/apps/learning/views.py`
- `backend/apps/learning/urls.py`

#### Frontend Changes:
```javascript
// Added auto-submit effect
const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);

useEffect(() => {
  if (timeRemaining === 0 && !hasAutoSubmitted && contest?.participation?.is_active) {
    handleAutoSubmit();
  }
}, [timeRemaining, hasAutoSubmitted]);

async function handleAutoSubmit() {
  setHasAutoSubmitted(true);
  const res = await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRFToken': getCsrfToken(),
    },
  });
  // Reload contest to get updated status
  await loadContest();
}
```

#### Backend - New Endpoint:
**View:** `StudentContestAutoSubmitView`  
**URL:** `POST /api/student/contests/<contest_id>/auto-submit/`

**Functionality:**
```python
def post(self, request, contest_id):
    # Get active participation
    participation = ContestParticipation.objects.filter(
        contest_id=contest_id,
        student=student,
        is_active=True
    ).first()
    
    # End the participation
    participation.ended_at = timezone.now()
    participation.is_active = False
    
    # Calculate time spent
    duration = participation.ended_at - participation.started_at
    participation.time_spent_seconds = int(duration.total_seconds())
    
    # Calculate final score and problems solved
    submissions = ContestSubmission.objects.filter(
        contest_id=contest_id,
        student=student
    )
    
    participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
    participation.problems_solved = submissions.filter(status='Accepted').values('problem').distinct().count()
    
    participation.save()
```

**Result:**
- Timer reaches 00:00:00 → Auto-submit triggered
- Participation marked as inactive
- Final score and problems solved calculated
- Student can no longer submit solutions
- Contest marked as completed

---

### 5. ✅ Show Expired Contests in Staff Dashboard
**Problem:** Staff couldn't see which contests had expired  
**File:** `frontend/src/components/staff/StaffDashboard.jsx`

**Fix:**
```javascript
// Check if contest has expired
{contest.end_time && new Date(contest.end_time) < new Date() && (
  <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 600 }}>
    • Expired
  </span>
)}

// Status badge shows "Expired" in red
<span style={{
  background: contest.end_time && new Date(contest.end_time) < new Date() 
    ? '#fee2e2'  // Red background for expired
    : /* other status colors */,
  color: contest.end_time && new Date(contest.end_time) < new Date() 
    ? '#dc2626'  // Red text for expired
    : /* other status colors */,
}}>
  {contest.end_time && new Date(contest.end_time) < new Date() 
    ? 'Expired' 
    : contest.status.replace('_', ' ')}
</span>
```

**Visual Indicators:**
- 🔴 **Red "Expired" badge** on contest card
- **"• Expired"** text next to creation date
- Clear visual distinction from active contests

---

## Complete Contest Lifecycle

### For Staff:
1. **Create Contest** → Status: `draft`
2. **Submit for Approval** → Status: `pending_approval`
3. **HOD Approves** → Status: `approved`
4. **Publish Contest** → Status: `published` (visible to students)
5. **Contest Starts** → Status: `active`
6. **Contest Ends** → Shows as **"Expired"** in staff dashboard

### For Students:
1. **See Published Contests** → Only contests with status `published`
2. **Click "Start Contest"** → Confirmation modal appears
3. **Confirm Start** → Timer begins, `ContestParticipation` created
4. **Solve Problems** → Submit solutions during contest time
5. **Timer Expires** → Auto-submit triggered automatically
6. **Contest Completed** → Can view but not submit

---

## Timer Behavior

### During Contest:
- **Green Timer** - More than 5 minutes remaining
- **Yellow Timer** - Less than 5 minutes remaining (warning)
- **Red Timer** - Time expired (00:00:00)

### When Time Expires:
1. Timer shows `00:00:00` in red
2. Auto-submit endpoint called automatically
3. Participation marked as inactive
4. Warning message displayed: "Contest has ended. You can view problems but cannot submit solutions."
5. All submit buttons disabled
6. Problems become read-only

---

## Preventing Re-Attempts

### Backend Protection:
```python
# In StudentContestStartView
if participation:
    return Response(
        {"detail": "You have already started this contest."},
        status=status.HTTP_400_BAD_REQUEST
    )
```

### Frontend Display:
```javascript
// Show different button based on participation status
{contest.has_started ? (
  <button onClick={onContinue}>Continue Contest</button>
) : (
  <button onClick={onStart}>Start Contest</button>
)}
```

### Database Constraint:
```python
# In ContestParticipation model
class Meta:
    constraints = [
        models.UniqueConstraint(
            fields=["student", "contest"],
            name="unique_student_contest_participation"
        )
    ]
```

**Result:** Students can only start each contest once

---

## Files Modified

### Frontend:
1. `frontend/src/components/student/pages/StudentContestsPage.jsx`
   - Added CSRF token to start contest
   - Added contest reload after start

2. `frontend/src/components/student/pages/ContestDetailPage.jsx`
   - Added auto-submit functionality
   - Added timer expiry detection
   - Added CSRF token import

3. `frontend/src/components/staff/StaffDashboard.jsx`
   - Added expired contest detection
   - Added visual indicators for expired contests

### Backend:
1. `backend/apps/learning/views.py`
   - Added `StudentContestAutoSubmitView` class
   - Implements auto-submit logic

2. `backend/apps/learning/urls.py`
   - Added route: `/api/student/contests/<contest_id>/auto-submit/`
   - Added import for `StudentContestAutoSubmitView`

---

## Testing Checklist

- [x] Students can see published contests
- [x] Students can start contests (CSRF token works)
- [x] Students cannot restart same contest
- [x] Timer counts down correctly
- [x] Timer shows warnings (yellow < 5 min)
- [x] Timer turns red at 00:00:00
- [x] Auto-submit triggers when timer expires
- [x] Participation marked as inactive after auto-submit
- [x] Final score calculated correctly
- [x] Problems solved counted correctly
- [x] Submit buttons disabled after time expires
- [x] Warning message shown after expiry
- [x] Staff can see expired contests
- [x] Expired badge shows in red
- [x] Contest status updates correctly

---

## API Endpoints Summary

### Student Contest Endpoints:
- `GET /api/student/contests/` - List assigned contests (published only)
- `GET /api/student/contests/<id>/` - Contest details
- `POST /api/student/contests/<id>/start/` - Start contest (creates participation)
- `POST /api/student/contests/<id>/auto-submit/` - Auto-submit when time expires ✨ NEW
- `GET /api/student/contests/<id>/problems/<slug>/` - Problem details
- `POST /api/student/contests/<id>/problems/<slug>/submit/` - Submit solution

---

## Key Features

✅ **CSRF Protection** - All POST requests include CSRF tokens  
✅ **Auto-Submit** - Contest automatically submits when time expires  
✅ **Single Attempt** - Students can only start each contest once  
✅ **Timer Warnings** - Visual warnings when time is running out  
✅ **Expired Indicators** - Staff can see which contests have expired  
✅ **Score Calculation** - Final scores calculated on auto-submit  
✅ **Read-Only Mode** - Problems viewable but not submittable after expiry  
✅ **Database Constraints** - Unique participation per student per contest

---

## User Experience Flow

### Student Starting Contest:
1. Navigate to "Contests" page
2. See list of published contests
3. Click "Start Contest" button
4. Read confirmation modal with warnings
5. Click "Start Contest" in modal
6. Redirected to contest detail page
7. Timer starts counting down
8. Solve problems and submit solutions
9. Timer expires → Auto-submit triggered
10. See completion message

### Staff Viewing Contests:
1. Navigate to "Contests" tab in dashboard
2. See all created contests
3. Expired contests show red "Expired" badge
4. Click contest to view detailed analytics
5. See student submissions and scores

---

## Future Enhancements (Optional)

- Email notification when contest is about to expire (5 min warning)
- Push notification for contest start/end
- Grace period for submission (30 seconds after timer)
- Partial credit for incomplete solutions
- Contest extension by HOD
- Pause/resume functionality for technical issues
