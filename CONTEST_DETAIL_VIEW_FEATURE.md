# Contest Detail View with Student Submissions

## Overview
Comprehensive contest analytics modal that allows staff and HOD to view detailed contest performance, individual student submissions, and problem-wise statistics.

---

## Features Implemented

### 1. Contest Detail Modal Component ✅
**File:** `frontend/src/components/common/ContestDetailModal.jsx`

**Features:**
- Full-screen modal with contest details
- Stats cards showing:
  - Total problems
  - Assigned students
  - Participants (only students who submitted)
  - Total submissions
  - Contest duration
- Student submissions table (ranked by score)
- Individual student submission viewer
- Problem-wise submission details

**Key Functionality:**
- **Only shows students who have submitted** - No empty rows
- Ranked leaderboard with medals (🥇🥈🥉)
- Click on any student to view their submissions
- Each submission shows:
  - Problem title
  - Language used
  - Status (Accepted/Wrong Answer/etc.)
  - Test cases passed
  - Execution time and memory
  - Score
  - Submission timestamp

---

### 2. Backend API Enhancements ✅

#### A. Enhanced Contest Analytics View
**File:** `backend/apps/learning/views.py` - `ContestAnalyticsView`

**Changes:**
- Added `participants` array with detailed student data
- Only includes students who have submitted
- Includes:
  - Register number
  - Name
  - Problems solved
  - Total score
  - Total submissions
  - Time spent
- Sorted by score (descending)

**Response Structure:**
```json
{
  "contest": { "id": 1, "title": "...", "status": "..." },
  "summary": {
    "total_participants": 15,
    "total_submissions": 45,
    "accepted_submissions": 30
  },
  "problem_stats": [...],
  "top_performers": [...],
  "participants": [
    {
      "register_number": "...",
      "name": "...",
      "problems_solved": 3,
      "score": 300,
      "total_submissions": 5,
      "time_spent": 1800
    }
  ]
}
```

#### B. New Student Submissions Endpoint
**File:** `backend/apps/learning/views.py` - `ContestStudentSubmissionsView`

**Endpoint:** `GET /api/contests/<contest_id>/student/<register_number>/submissions/`

**Purpose:** Fetch all submissions by a specific student in a contest

**Permissions:**
- Staff can view their own contests
- HOD can view all department contests

**Response:**
```json
{
  "student": {
    "register_number": "...",
    "name": "..."
  },
  "contest": {
    "id": 1,
    "title": "..."
  },
  "submissions": [
    {
      "id": 1,
      "problem_title": "Two Sum",
      "problem_slug": "two-sum",
      "language": "Python",
      "status": "Accepted",
      "passed_cases": 10,
      "total_cases": 10,
      "score": 100,
      "execution_time": "0.05s",
      "memory": "14.2 MB",
      "submitted_at": "2026-04-15T12:30:00Z"
    }
  ]
}
```

**URL Route Added:**
```python
path("contests/<int:contest_id>/student/<str:register_number>/submissions/", 
     ContestStudentSubmissionsView.as_view(), 
     name="contest-student-submissions"),
```

---

### 3. Integration with HOD Dashboard ✅
**File:** `frontend/src/components/hod/HODDashboard.jsx`

**Changes:**
- Added `ContestDetailModal` import
- Added `showContestDetail` state
- Contest cards now clickable - opens detail modal
- Removed old `handleContestClick` function (replaced with modal)

**User Flow:**
1. HOD navigates to Contests tab
2. Clicks on any contest card
3. Modal opens showing full contest analytics
4. Can click on any student to see their submissions
5. Can close modal to return to list

---

### 4. Integration with Staff Dashboard ✅
**File:** `frontend/src/components/staff/StaffDashboard.jsx`

**Changes:**
- Added `ContestDetailModal` import
- Added `showContestDetail` state
- Contest cards in "Contests" tab now clickable
- Added hover effects for better UX

**User Flow:**
1. Staff navigates to Contests tab
2. Sees all their created contests
3. Clicks on any contest
4. Modal opens with full analytics
5. Can view individual student performance
6. Can see each submission attempt

---

## UI/UX Features

### Contest Detail Modal

#### Header Section
- Contest title and description
- Creator name and creation date
- Close button (X)

#### Stats Cards (5 cards)
- **Total Problems** - Blue badge
- **Assigned Students** - Light blue badge
- **Participants** - Green badge (only who submitted)
- **Total Submissions** - Orange badge
- **Duration** - Gray badge

#### Student Submissions Table
**Columns:**
1. **Rank** - Medal icons for top 3 (🥇🥈🥉)
2. **Student** - Full name
3. **Register No** - Monospace font
4. **Solved** - Green badge (X / Total)
5. **Score** - Large purple number
6. **Submissions** - Total attempts
7. **Time Spent** - Minutes and seconds
8. **Actions** - "View" button

**Features:**
- Sorted by score (highest first)
- Row highlights when selected
- Empty state if no submissions
- Responsive grid layout

#### Student Submission Detail Panel
**Appears below table when student is selected**

Shows all submissions by that student:
- Problem title
- Submission timestamp
- Language used
- Status badge (✅ Accepted or ❌ Failed)
- Test cases passed (X / Total)
- Execution time
- Memory used
- Score earned

**Features:**
- Chronological order (newest first)
- Color-coded status badges
- Detailed metrics per submission
- Close button to return to table

---

## Data Flow

### 1. Contest List → Detail Modal
```
User clicks contest card
  ↓
setShowContestDetail(contestId)
  ↓
ContestDetailModal renders
  ↓
Fetches /api/contests/{id}/
Fetches /api/contests/{id}/analytics/
  ↓
Displays contest info + participants table
```

### 2. Student Selection → Submissions
```
User clicks "View" on student row
  ↓
handleStudentClick(student)
  ↓
Fetches /api/contests/{id}/student/{register}/submissions/
  ↓
Displays submission detail panel below table
```

---

## Key Implementation Details

### Only Show Students Who Submitted
**Backend Logic:**
```python
# Filter participants who have submissions
for participation in participations:
    student_submissions = submissions.filter(student=student)
    
    # Skip students with no submissions
    if student_submissions.count() == 0:
        continue
    
    # Add to participants list
    participants_data.append({...})
```

**Frontend Display:**
```javascript
// Filter to only show students who have submitted
const participantsWithSubmissions = (analytics.participants || [])
  .filter(p => p.total_submissions > 0);
```

### Ranking System
- Sorted by score (descending)
- Then by problems solved (descending)
- Top 3 get special medal badges
- Rank numbers for all others

### Performance Metrics
- **Time Spent**: Tracked via ContestParticipation model
- **Score**: Sum of all submission scores
- **Problems Solved**: Distinct count of accepted problems
- **Submissions**: Total attempts across all problems

---

## Testing Checklist

- [x] HOD can click contest and see detail modal
- [x] Staff can click contest and see detail modal
- [x] Only students with submissions appear in table
- [x] Students ranked by score correctly
- [x] Top 3 show medal badges
- [x] Click student shows their submissions
- [x] Submissions show correct status badges
- [x] Test cases passed/total displayed correctly
- [x] Execution time and memory shown
- [x] Close button works on modal
- [x] Close button works on submission panel
- [x] Empty state shows when no submissions
- [x] Loading states work correctly

---

## Files Modified/Created

### Created:
1. `frontend/src/components/common/ContestDetailModal.jsx` - New modal component

### Modified:
1. `backend/apps/learning/views.py` - Enhanced analytics + new endpoint
2. `backend/apps/learning/urls.py` - Added new route
3. `frontend/src/components/hod/HODDashboard.jsx` - Integrated modal
4. `frontend/src/components/staff/StaffDashboard.jsx` - Integrated modal

---

## Benefits

✅ **Detailed Analytics** - See exactly how each student performed  
✅ **Individual Tracking** - View every submission attempt  
✅ **Clean UI** - Only show relevant data (students who submitted)  
✅ **Easy Navigation** - Click to drill down, close to go back  
✅ **Performance Metrics** - Time, memory, score all visible  
✅ **Status Clarity** - Color-coded badges for quick understanding  
✅ **Responsive Design** - Works on all screen sizes  
✅ **Reusable Component** - Same modal for HOD and Staff

---

## Future Enhancements (Optional)

- Export contest results to CSV
- Filter submissions by problem
- Filter submissions by status (Accepted/Failed)
- View student's code for each submission
- Compare multiple students side-by-side
- Time-series graph of submissions
- Problem difficulty analysis
