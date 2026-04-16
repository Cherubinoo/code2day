# Integration Guide for Student Contest System

## Components Created

### 1. StudentContestsPage
**Path**: `frontend/src/components/student/pages/StudentContestsPage.jsx`
- Lists all assigned contests
- Shows active, upcoming, and completed contests
- Handles contest start confirmation

### 2. ContestDetailPage
**Path**: `frontend/src/components/student/pages/ContestDetailPage.jsx`
- Shows all problems in a contest
- Real-time countdown timer
- Problem list with solved status

### 3. ContestProblemPage
**Path**: `frontend/src/components/student/pages/ContestProblemPage.jsx`
- Full IDE interface for solving problems
- Integrated code editor
- Judge0 execution

## Integration Steps

### Option 1: Add to App.jsx Navigation

1. **Import the components** in `frontend/src/App.jsx`:
```javascript
import StudentContestsPage from "./components/student/pages/StudentContestsPage";
import ContestDetailPage from "./components/student/pages/ContestDetailPage";
import ContestProblemPage from "./components/student/pages/ContestProblemPage";
```

2. **Add state for contest navigation**:
```javascript
const [activeContestId, setActiveContestId] = useState(null);
const [activeContestProblem, setActiveContestProblem] = useState(null);
```

3. **Add navigation handlers**:
```javascript
function handleNavigateToContest(contestId) {
  setActiveContestId(contestId);
  navigate('contest-detail');
}

function handleSelectProblem(problemSlug) {
  setActiveContestProblem(problemSlug);
  navigate('contest-problem');
}

function handleBackToContests() {
  setActiveContestId(null);
  setActiveContestProblem(null);
  navigate('contests');
}

function handleBackToContestDetail() {
  setActiveContestProblem(null);
  navigate('contest-detail');
}
```

4. **Add to page rendering logic**:
```javascript
// In the main render section
if (activePage === 'contests') {
  activeView = (
    <StudentContestsPage 
      onNavigateToContest={handleNavigateToContest}
    />
  );
}

if (activePage === 'contest-detail' && activeContestId) {
  activeView = (
    <ContestDetailPage
      contestId={activeContestId}
      onBack={handleBackToContests}
      onSelectProblem={handleSelectProblem}
    />
  );
}

if (activePage === 'contest-problem' && activeContestId && activeContestProblem) {
  activeView = (
    <ContestProblemPage
      contestId={activeContestId}
      problemSlug={activeContestProblem}
      onBack={handleBackToContestDetail}
    />
  );
}
```

5. **Add to navigation items** in `frontend/src/lib/appData.js`:
```javascript
export const navItems = [
  { id: "explore", label: "Explore", icon: "🏠" },
  { id: "problems", label: "Problems", icon: "💻" },
  { id: "contests", label: "Contests", icon: "🏆" },  // Add this
  { id: "progress", label: "Progress", icon: "📊" },
  { id: "discuss", label: "Discuss", icon: "💬" },
  { id: "roadmaps", label: "Roadmaps", icon: "🗺️" },
];
```

### Option 2: Standalone Contest App

Create a separate contest app that can be accessed via a route:

1. **Create ContestApp.jsx**:
```javascript
import { useState } from 'react';
import StudentContestsPage from './components/student/pages/StudentContestsPage';
import ContestDetailPage from './components/student/pages/ContestDetailPage';
import ContestProblemPage from './components/student/pages/ContestProblemPage';

function ContestApp() {
  const [view, setView] = useState('list'); // 'list', 'detail', 'problem'
  const [contestId, setContestId] = useState(null);
  const [problemSlug, setProblemSlug] = useState(null);

  if (view === 'list') {
    return (
      <StudentContestsPage
        onNavigateToContest={(id) => {
          setContestId(id);
          setView('detail');
        }}
      />
    );
  }

  if (view === 'detail') {
    return (
      <ContestDetailPage
        contestId={contestId}
        onBack={() => setView('list')}
        onSelectProblem={(slug) => {
          setProblemSlug(slug);
          setView('problem');
        }}
      />
    );
  }

  if (view === 'problem') {
    return (
      <ContestProblemPage
        contestId={contestId}
        problemSlug={problemSlug}
        onBack={() => setView('detail')}
      />
    );
  }

  return null;
}

export default ContestApp;
```

2. **Use in App.jsx**:
```javascript
import ContestApp from './ContestApp';

// In render logic
if (activePage === 'contests') {
  activeView = <ContestApp />;
}
```

## Testing the Integration

### 1. Test Contest List
- Navigate to contests page
- Should see list of assigned contests
- Check active/upcoming/completed categorization

### 2. Test Contest Start
- Click "Start Contest" on an active contest
- Verify confirmation modal appears
- Confirm and check if redirected to contest detail

### 3. Test Problem Selection
- In contest detail, click on a problem
- Should navigate to problem solving page
- Verify editor loads with problem description

### 4. Test Code Execution
- Write code in editor
- Click "Run" to test with custom input
- Click "Submit" to judge against test cases

### 5. Test Timer
- Verify countdown timer is visible
- Check warning appears at 5 minutes
- Verify submission disabled when time expires

## Debugging Tips

### Check Browser Console
The components have debug logging:
```javascript
console.log('Contest data loaded:', data);
console.log('Problem clicked:', problem.slug);
```

### Check Network Tab
Verify API calls are being made:
- `GET /api/student/contests/` - List contests
- `GET /api/student/contests/<id>/` - Contest detail
- `POST /api/student/contests/<id>/start/` - Start contest
- `GET /api/student/contests/<id>/problems/<slug>/` - Problem detail
- `POST /api/student/contests/<id>/problems/<slug>/submit/` - Submit solution

### Common Issues

1. **"Contest not found"**
   - Check if contest is published (status='published')
   - Verify student is assigned to contest
   - Check contest ID is correct

2. **"You must start the contest first"**
   - Student needs to click "Start Contest" before accessing problems
   - Check ContestParticipation record exists

3. **"Contest has ended"**
   - Verify contest end_time hasn't passed
   - Check server time vs client time

4. **Problems not loading**
   - Check if contest has problems assigned
   - Verify problems are in contest.problems array
   - Check backend is returning problems correctly

5. **Cannot submit code**
   - Verify contest is active (not ended)
   - Check participation exists
   - Verify problem has test cases

## Backend Requirements

Ensure these endpoints are working:
- ✅ `GET /api/student/contests/`
- ✅ `GET /api/student/contests/<id>/`
- ✅ `POST /api/student/contests/<id>/start/`
- ✅ `GET /api/student/contests/<id>/problems/<slug>/`
- ✅ `POST /api/student/contests/<id>/problems/<slug>/submit/`
- ✅ `GET /api/problems/by-topic/`

## Staff/HOD Requirements

Before students can access contests:
1. Staff creates contest with EnhancedContestCreator
2. Staff assigns problems to contest
3. Staff assigns students (batch-wise or individual)
4. Staff submits for approval (or saves as draft)
5. HOD approves contest
6. Staff/HOD publishes contest (status='published')

## Quick Test

To quickly test if everything is working:

1. **As Staff**:
   - Create a contest
   - Add 2-3 problems
   - Assign to a batch
   - Submit for approval

2. **As HOD**:
   - Approve the contest
   - Publish it

3. **As Student**:
   - Navigate to contests page
   - Should see the contest
   - Start the contest
   - Select a problem
   - Write and submit code

## Next Steps

After integration:
1. Test all user flows
2. Add error boundaries
3. Add loading states
4. Optimize performance
5. Add analytics tracking
6. Test on mobile devices
7. Add keyboard shortcuts
8. Implement auto-save
9. Add contest notifications
10. Create user documentation
