# Student Contest System - Complete Implementation

## Overview
Comprehensive contest participation system for students with integrated code editor, Judge0 execution, topic-wise problem browsing, time-based restrictions, and contest start confirmation.

## Features Implemented

### 1. Contest Participation Tracking
- **ContestParticipation Model**: Tracks when students start/complete contests
- Unique constraint: One participation per student per contest
- Records: start time, completion time, score, problems solved
- Auto-ends when contest time expires

### 2. Student Contest Views

#### Contest List (`StudentContestsPage`)
- Shows all assigned contests
- Categorized by status:
  - **Active**: Currently running, can participate
  - **Upcoming**: Not started yet
  - **Completed**: Time expired
- Displays: problem count, duration, progress, score
- Start confirmation modal with warnings

#### Contest Detail (`ContestDetailPage`)
- Lists all problems in the contest
- Shows solved status for each problem
- Real-time countdown timer
- Color-coded difficulty badges
- Topic tags for each problem
- Prevents access after time expires

#### Problem Solving (`ContestProblemPage`)
- Full-screen IDE interface
- Integrated code editor with syntax highlighting
- Judge0 code execution
- Real-time timer with warnings
- Problem description, examples, hints
- Submission history
- Custom input testing
- Auto-prevents submission after time expires

### 3. Topic-Wise Problem Browsing
- **Endpoint**: `GET /api/problems/by-topic/`
- Groups all problems by tags/topics
- Shows problem count per topic
- Includes difficulty and title for each problem

### 4. Time-Based Restrictions

#### Before Contest Starts
- Cannot start contest
- Shows "Upcoming" status
- Displays start time

#### During Contest
- Can start contest (with confirmation)
- Timer counts down
- Warning when < 5 minutes remaining
- Can solve problems and submit

#### After Contest Ends
- Auto-ends participation
- Cannot submit new solutions
- Can view problems (read-only)
- Shows "Time Up" message
- Disables code editor and submit button

### 5. Contest Start Confirmation
- Modal dialog before starting
- Warnings:
  - Timer will start immediately
  - Cannot pause or restart
  - Need stable internet
  - Action cannot be undone
- Requires explicit confirmation

### 6. Integrated Code Editor
- Multi-language support: JavaScript, Python, Java, C++, C
- Syntax highlighting (dark theme)
- Run code with custom input
- Submit for judging against test cases
- Real-time output display
- Submission history per problem

### 7. Judge0 Integration
- Executes code against test cases
- Returns: status, passed/failed cases, score
- Handles compilation errors
- Shows execution time and memory
- Supports all contest languages

## Database Models

### ContestParticipation
```python
class ContestParticipation(models.Model):
    contest = ForeignKey(Contest)
    student = ForeignKey(StudentProfile)
    started_at = DateTimeField(auto_now_add=True)
    completed_at = DateTimeField(null=True)
    time_spent_seconds = PositiveIntegerField(default=0)
    is_active = BooleanField(default=True)
    has_started = BooleanField(default=True)
    total_score = PositiveIntegerField(default=0)
    problems_solved = PositiveIntegerField(default=0)
    
    # Unique constraint: one participation per student per contest
```

### ContestSubmission (Enhanced)
- Links to contest, student, problem
- Stores code, language, status
- Tracks score and timing
- Used for contest-specific submissions

## API Endpoints

### Student Contest Endpoints

#### List Contests
```
GET /api/student/contests/
```
Returns all contests assigned to the student with status and participation info.

#### Contest Detail
```
GET /api/student/contests/<contest_id>/
```
Returns contest details with all problems and their solved status.

#### Start Contest
```
POST /api/student/contests/<contest_id>/start/
```
Creates participation record. Validates:
- Contest is published
- Student is assigned
- Contest is active (not before start, not after end)
- Student hasn't already started

#### Get Problem in Contest
```
GET /api/student/contests/<contest_id>/problems/<problem_slug>/
```
Returns problem details with description, examples, hints, and submission history.
Validates:
- Student has started contest
- Contest hasn't ended
- Problem is in contest

#### Submit Solution
```
POST /api/student/contests/<contest_id>/problems/<problem_slug>/submit/
```
Submits code for judging. Process:
1. Validates contest is active
2. Runs code against test cases
3. Calculates score
4. Creates ContestSubmission
5. Updates participation (problems_solved, total_score)
6. Returns results

### Problem Browsing

#### Problems by Topic
```
GET /api/problems/by-topic/
```
Returns all problems grouped by tags/topics.

## Frontend Components

### 1. StudentContestsPage
**Location**: `frontend/src/components/student/pages/StudentContestsPage.jsx`

**Features**:
- Lists all assigned contests
- Categorizes by status (active/upcoming/completed)
- Shows progress and scores
- Start confirmation modal
- Navigates to contest detail

**Props**:
- `onNavigateToContest(contestId)` - Callback to navigate

### 2. ContestDetailPage
**Location**: `frontend/src/components/student/pages/ContestDetailPage.jsx`

**Features**:
- Shows all problems in contest
- Real-time countdown timer
- Solved status indicators
- Problem difficulty badges
- Topic tags
- Prevents access after time expires

**Props**:
- `contestId` - Contest ID
- `onBack()` - Navigate back
- `onSelectProblem(slug)` - Navigate to problem

### 3. ContestProblemPage
**Location**: `frontend/src/components/student/pages/ContestProblemPage.jsx`

**Features**:
- Full-screen IDE interface
- Code editor with syntax highlighting
- Language selector
- Run code with custom input
- Submit for judging
- Problem description with examples
- Submission history
- Real-time timer with warnings
- Auto-disables after time expires

**Props**:
- `contestId` - Contest ID
- `problemSlug` - Problem slug
- `onBack()` - Navigate back

## User Flow

### Starting a Contest
1. Student views contest list
2. Sees active contest
3. Clicks "Start Contest"
4. Confirmation modal appears with warnings
5. Student confirms
6. API creates participation record
7. Redirects to contest detail page
8. Timer starts counting down

### Solving Problems
1. Student views contest problems
2. Clicks on a problem
3. Opens full-screen editor
4. Reads problem description
5. Writes code in editor
6. Tests with custom input (Run)
7. Submits for judging (Submit)
8. Views results and score
9. Continues to next problem

### Time Expiry
1. Timer reaches 00:00:00
2. UI shows "Time Up" message
3. Submit button disabled
4. Code editor disabled
5. Participation auto-ended
6. Can view problems but not submit

## Security & Validation

### Contest Access
- Only assigned students can access
- Only published contests visible
- Validates student profile exists

### Time Validation
- Checks contest start/end times
- Prevents early starts
- Prevents late submissions
- Auto-ends participation

### Submission Validation
- Requires contest participation
- Validates problem is in contest
- Checks code is not empty
- Validates language ID

### Duplicate Prevention
- Unique constraint on participation
- Cannot start same contest twice
- Handles race conditions

## UI/UX Highlights

### Visual Indicators
- **Status Badges**: Color-coded (active/upcoming/completed)
- **Difficulty**: Easy (green), Medium (yellow), Hard (red)
- **Solved Status**: Checkmark icon, green border
- **Timer**: Color changes (blue → yellow → red)

### Warnings
- Time warning at 5 minutes
- "Time Up" alert when expired
- Start confirmation modal
- Cannot restart warning

### Responsive Design
- Full-screen editor for focus
- Split-pane layout (description | editor)
- Resizable panels
- Mobile-friendly (future)

### Real-time Updates
- Timer updates every second
- Auto-disables on expiry
- Live submission feedback

## Testing Checklist

### Contest Lifecycle
- [ ] View assigned contests
- [ ] Start contest with confirmation
- [ ] Cannot start twice
- [ ] Cannot start before start time
- [ ] Cannot start after end time
- [ ] Timer counts down correctly
- [ ] Warning at 5 minutes
- [ ] Auto-ends at 00:00:00

### Problem Solving
- [ ] View all contest problems
- [ ] Open problem in editor
- [ ] Write and run code
- [ ] Submit solution
- [ ] View test results
- [ ] See submission history
- [ ] Cannot submit after time expires

### Edge Cases
- [ ] Network interruption during submission
- [ ] Browser refresh during contest
- [ ] Multiple tabs open
- [ ] Contest ends while solving
- [ ] Invalid code submission
- [ ] Empty code submission

### Topic Browsing
- [ ] View problems by topic
- [ ] See problem counts
- [ ] Filter by difficulty
- [ ] Navigate to problems

## Performance Optimizations

### Backend
- Select_related for foreign keys
- Prefetch_related for many-to-many
- Indexed fields (contest, student, problem)
- Efficient queries with annotations

### Frontend
- Debounced timer updates
- Lazy loading of submissions
- Cached problem data
- Optimistic UI updates

## Future Enhancements

1. **Real-time Leaderboard**: Live rankings during contest
2. **Code Playback**: Review submission history with code
3. **Hints System**: Progressive hints with penalties
4. **Partial Credit**: Score based on test cases passed
5. **Contest Chat**: Q&A with staff during contest
6. **Mobile App**: Native mobile experience
7. **Offline Mode**: Cache problems for offline solving
8. **Code Templates**: Language-specific starter code
9. **Auto-save**: Periodic code backup
10. **Contest Replay**: Review contest after completion

## Files Created/Modified

### Backend
- `backend/apps/learning/models.py` - Added ContestParticipation model
- `backend/apps/learning/views.py` - Added 6 student contest views
- `backend/apps/learning/urls.py` - Added 5 contest endpoints
- `backend/apps/learning/migrations/0028_*.py` - ContestParticipation migration

### Frontend
- `frontend/src/components/student/pages/StudentContestsPage.jsx` - Contest list
- `frontend/src/components/student/pages/ContestDetailPage.jsx` - Contest problems
- `frontend/src/components/student/pages/ContestProblemPage.jsx` - Problem solver

## Integration Points

### With Existing Systems
- Uses existing Judge0 integration
- Leverages Problem and TestCase models
- Integrates with student authentication
- Uses existing code execution utilities

### With Staff System
- Staff creates contests
- HOD approves contests
- Published contests appear for students
- Analytics track student performance

## Summary

This implementation provides a complete contest participation system with:
- ✅ Topic-wise problem browsing
- ✅ Contest start confirmation
- ✅ Integrated code editor
- ✅ Judge0 execution
- ✅ Time-based restrictions
- ✅ Real-time countdown
- ✅ Auto-expiry handling
- ✅ Submission tracking
- ✅ Score calculation
- ✅ Read-only after expiry

The system ensures fair contest participation with proper time management and prevents any form of restart or resubmission after the contest ends.
