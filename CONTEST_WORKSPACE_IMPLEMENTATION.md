# Contest Workspace Implementation

## Overview
Implemented a contest workspace that matches the `/problems` page layout exactly, providing students with a familiar three-column interface for solving contest problems.

## Key Features

### 1. Exact Layout Match
- **Three-column layout**: Problem list (left) | Editor (center) | Problem description (right)
- **Same CSS classes**: Uses identical classes from ProblemsPage (`problem-page`, `leetcode-layout`, `judge-sidebar`, etc.)
- **Collapsible sidebar**: Problem list can be hidden/shown
- **Monaco Editor**: Same code editor with syntax highlighting and autocomplete

### 2. Contest Timer
- **Countdown timer**: Shows remaining time in MM:SS or HH:MM:SS format
- **Calculation**: Based on `participation.started_at + contest.duration_minutes`
- **Display**: Shown in header and toolbar with `timer-countdown` class
- **Auto-update**: Updates every second

### 3. Problem Navigation
- **All problems visible**: Left sidebar shows all contest problems
- **Click to switch**: Select any problem to load it in the editor
- **Solved indicators**: Checkmarks (✓) shown for solved problems
- **Problem metadata**: Shows difficulty, tags, and solve status

### 4. Code Execution
- **Run button**: Test code with custom input
- **Submit button**: Submit solution for judging
- **Same backend**: Uses Judge0 integration like regular problems
- **Output console**: Shows execution results, status, time, and memory

### 5. Navigation Flow
```
Contest List → Start Contest → Contest Workspace → Finish Contest → Back to List
```

## File Structure

### Frontend Files
1. **ContestWorkspacePage.jsx** (NEW)
   - Main workspace component
   - Three-column layout matching ProblemsPage
   - Timer logic and problem switching
   - Code execution and submission

2. **ContestContainer.jsx** (UPDATED)
   - Manages navigation between list and workspace
   - Passes contestId to workspace
   - Handles back navigation

3. **StudentContestsPage.jsx** (EXISTING)
   - Lists available contests
   - Start/Continue buttons
   - Calls `onNavigateToContest(contestId)`

4. **App.jsx** (UPDATED)
   - Changed import from `ContestPage` to `ContestContainer`
   - Simplified routing: `case "contest": activeView = <ContestContainer />`

### Backend Endpoints Used

1. **GET /api/student/contests/{contest_id}/**
   - Returns contest details, problems list, participation data
   - Fields: title, description, duration_minutes, start_time, end_time
   - Problems: id, slug, title, difficulty, tags, is_solved

2. **GET /api/student/contests/{contest_id}/problems/{problem_slug}/**
   - Returns full problem details
   - Fields: description, examples, hints, submissions

3. **POST /api/student/contests/{contest_id}/problems/{problem_slug}/submit/**
   - Submits code for judging
   - Body: `{ source_code, language, language_id }`
   - Returns: status, message, time, memory, all_tests_passed

4. **POST /api/student/contests/{contest_id}/auto-submit/**
   - Finishes contest and calculates final score
   - Ends participation and marks as inactive

## Timer Implementation

### Countdown Logic
```javascript
const startTime = new Date(contest.participation.started_at).getTime();
const durationMs = contest.duration_minutes * 60 * 1000;
const elapsed = Date.now() - startTime;
const remaining = durationMs - elapsed;
const contestSecondsLeft = Math.floor(remaining / 1000);
```

### Display Format
- Uses `formatDuration(seconds)` from `appUtils.js`
- Shows as `MM:SS` for < 60 minutes
- Shows as `HH:MM:SS` for >= 60 minutes
- Example: `59:45`, `01:30:00`

## CSS Classes Used (Same as ProblemsPage)

### Layout
- `page-stack problem-page` - Main container
- `problem-layout leetcode-layout` - Three-column grid
- `problem-sidebar judge-sidebar` - Left sidebar
- `center-column judge-center` - Middle column (editor)
- `right-column judge-right` - Right column (description)

### Header
- `page-header compact-header problem-page-header` - Top header
- `workspace-brief contest-timer-brief` - Timer container
- `timer-countdown` - Timer text (styled for emphasis)

### Toolbar
- `surface-card leetcode-toolbar` - Filter/concept bar
- `toolbar-row` - Horizontal layout
- `chip-scroll dense` - Scrollable problem chips

### Editor
- `surface-card editor-main-card judge-editor` - Editor card
- `editor-topbar` - Language selector row
- `editor-frame` - Monaco editor container
- `editor-actions compact-row` - Run/Submit buttons

### Problem Statement
- `surface-card statement-panel judge-statement` - Description card
- `tab-strip dense` - Problem/Hints tabs
- `statement-scroll` - Scrollable content
- `problem-description` - Problem text
- `info-box` - Examples and tags sections

## User Experience

### Starting a Contest
1. Student clicks "Start Contest" on contest card
2. Confirmation modal appears with warning
3. On confirm, participation record created
4. Navigates to ContestWorkspacePage
5. Timer starts counting down

### Solving Problems
1. All problems visible in left sidebar
2. Click problem to load description and editor
3. Write code in Monaco editor
4. Click "Run" to test with custom input
5. Click "Submit" to submit for judging
6. Solved problems show checkmark (✓)

### Finishing Contest
1. Click "Finish Contest" button in header
2. Confirmation dialog appears
3. On confirm, calls auto-submit endpoint
4. Participation ended, score calculated
5. Returns to contest list

## Key Differences from ProblemsPage

1. **No topic filters**: Contest shows only assigned problems
2. **Timer display**: Shows contest countdown instead of session time
3. **Problem list**: Fixed set of contest problems (no pagination)
4. **Finish button**: Allows early contest completion
5. **Solved tracking**: Uses `is_solved` from contest submissions

## Testing Checklist

- [ ] Contest list loads correctly
- [ ] Start contest creates participation
- [ ] Timer counts down correctly
- [ ] All problems visible in sidebar
- [ ] Click problem switches view
- [ ] Code editor loads with starter code
- [ ] Run button executes code
- [ ] Submit button submits solution
- [ ] Solved problems show checkmark
- [ ] Finish contest ends participation
- [ ] Back button returns to list
- [ ] Layout matches /problems page
- [ ] Timer shows in MM:SS format
- [ ] Sidebar can be collapsed

## Next Steps

1. Test with real contest data
2. Verify timer accuracy
3. Test problem switching
4. Verify submission flow
5. Test finish contest flow
6. Check mobile responsiveness
7. Add loading states
8. Add error handling
9. Test with multiple problems
10. Verify solved status updates
