# Test Contest Navigation - Quick Guide

## 🚀 Quick Test

### 1. Start Backend & Frontend
```bash
# Terminal 1 - Backend
cd backend
python manage.py runserver

# Terminal 2 - Frontend
cd frontend
npm start
```

### 2. Log in as Student
- Open `http://localhost:3000`
- Click "Student Login"
- Enter student credentials
- Click "Login"

### 3. Navigate to Contests
- Click "Contests" in navigation menu
- OR go to Progress page and scroll to "My Contests" section

### 4. Test Start Contest Flow
```
Step 1: Click "Start Contest" button
   ✅ Modal should appear
   ✅ Shows warning about timer

Step 2: Click "Start Contest" in modal
   ✅ Modal closes
   ✅ API call to /api/student/contests/<id>/start/
   ✅ Page navigates to contest detail

Step 3: Verify Contest Detail Page
   ✅ Shows contest title
   ✅ Shows timer counting down
   ✅ Shows list of problems
   ✅ Shows "Back to Contests" button

Step 4: Click on a problem
   ✅ Navigates to problem solving page
   ✅ Shows code editor
   ✅ Shows problem description
   ✅ Shows Run and Submit buttons

Step 5: Click "Back" button
   ✅ Returns to contest detail page
   ✅ Problem list still visible

Step 6: Click "Back to Contests"
   ✅ Returns to contest list
   ✅ Contest now shows "Continue" instead of "Start"
```

---

## 🔍 Debug Checklist

### Open Browser Console (F12)

**Expected Console Logs:**

When clicking "Start Contest":
```
Navigating to contest: 1
Contest data loaded: {id: 1, title: "...", problems: [...]}
Rendering contest with problems: [...]
```

When clicking a problem:
```
Problem clicked: two-sum isTimeUp: false
Selecting problem: two-sum
Loading contest and problem: {contestId: 1, problemSlug: "two-sum"}
```

When clicking "Back":
```
Back to contest detail
```

---

## ✅ What Should Work

### Contest List Page
- [x] Shows all assigned contests
- [x] "Start Contest" button for new contests
- [x] "Continue" button for started contests
- [x] Contest cards clickable
- [x] Modal appears on "Start Contest"
- [x] Modal can be cancelled

### Contest Detail Page
- [x] Shows contest title and description
- [x] Timer displays and counts down
- [x] Timer turns yellow when <5 min
- [x] Timer turns red when expired
- [x] Problems list displays
- [x] Problem cards show difficulty
- [x] Problem cards show tags
- [x] Solved problems show checkmark
- [x] "Solve" button on unsolved problems
- [x] Problems clickable
- [x] "Back to Contests" button works

### Problem Solving Page
- [x] Code editor displays
- [x] Language selector works
- [x] Problem description shows
- [x] Examples display
- [x] Hints display (if available)
- [x] Run button works
- [x] Submit button works
- [x] Output panel shows results
- [x] Custom input section available
- [x] Timer displays
- [x] "Back" button works

---

## 🐛 Common Issues

### Issue 1: Not Navigating After "Start Contest"

**Symptoms:**
- Click "Start Contest"
- Modal closes
- Stay on same page

**Check:**
1. Open console - any errors?
2. Check network tab - did API call succeed?
3. Look for console.log: "Navigating to contest: X"

**Fix:**
- Refresh page
- Clear browser cache
- Check if backend is running

### Issue 2: Problems Not Showing

**Symptoms:**
- Contest detail page loads
- "No problems in this contest" message

**Check:**
1. Console log: "Contest data loaded"
2. Check if problems array is empty
3. Verify contest has problems assigned

**Fix:**
```bash
cd backend
python manage.py shell
```
```python
from apps.learning.models import Contest
contest = Contest.objects.first()
print(f'Problems: {contest.problems.count()}')
```

### Issue 3: Can't Click Problems

**Symptoms:**
- Problems display
- Clicking does nothing

**Check:**
1. Is timer expired? (red timer = expired)
2. Console errors?
3. Is onSelectProblem defined?

**Fix:**
- If timer expired, that's expected behavior
- Otherwise, check console for errors

### Issue 4: Code Editor Not Working

**Symptoms:**
- Problem page loads
- Can't type in editor
- Buttons don't work

**Check:**
1. Is timer expired?
2. Console errors?
3. Is Judge0 configured?

**Fix:**
- Check backend logs
- Verify Judge0 API key in settings
- Test with simple code: `console.log("test")`

---

## 📊 Test Scenarios

### Scenario 1: Complete Contest Flow
```
1. Start contest
2. Solve problem 1
3. Submit solution
4. Go back to problem list
5. Solve problem 2
6. Submit solution
7. Check score updates
8. Wait for timer to expire
9. Verify auto-submit
```

### Scenario 2: Multiple Problems
```
1. Start contest
2. Open problem 1
3. Write partial solution
4. Go back
5. Open problem 2
6. Solve completely
7. Go back
8. Return to problem 1
9. Complete solution
```

### Scenario 3: Timer Expiry
```
1. Start contest with short duration
2. Open problem
3. Wait for timer to expire
4. Verify can't submit
5. Verify auto-submit triggered
6. Check participation marked inactive
```

### Scenario 4: Continue Contest
```
1. Start contest
2. Solve 1 problem
3. Navigate away (go to Progress page)
4. Return to Contests
5. Click "Continue"
6. Verify progress preserved
7. Verify timer still running
```

---

## 🎯 Success Indicators

### Visual Indicators
- ✅ Smooth page transitions
- ✅ No flickering or layout shifts
- ✅ Timer updates every second
- ✅ Buttons respond to clicks
- ✅ Hover effects work
- ✅ Modal animations smooth

### Functional Indicators
- ✅ API calls succeed (check network tab)
- ✅ State updates correctly
- ✅ Navigation works both ways
- ✅ Data persists across navigation
- ✅ Timer continues running
- ✅ Submissions recorded

### Console Indicators
- ✅ No error messages
- ✅ Debug logs show correct flow
- ✅ API responses successful
- ✅ State changes logged

---

## 📞 Quick Fixes

### Clear Everything and Restart
```bash
# Stop servers
Ctrl+C (in both terminals)

# Clear browser
- Clear cache (Ctrl+Shift+Delete)
- Close all tabs
- Reopen browser

# Restart servers
cd backend && python manage.py runserver
cd frontend && npm start

# Test again
```

### Reset Contest Participation
```bash
cd backend
python manage.py shell
```
```python
from apps.learning.models import ContestParticipation
# Delete all participations (for testing only!)
ContestParticipation.objects.all().delete()
print("Participations reset")
```

### Check Contest Status
```bash
cd backend
python manage.py track_contests
```

---

## ✅ Final Checklist

Before reporting issues, verify:

- [ ] Backend server running
- [ ] Frontend server running
- [ ] Logged in as student
- [ ] Contests are published
- [ ] Student is assigned to contests
- [ ] Browser console open
- [ ] Network tab open
- [ ] No console errors
- [ ] API calls succeeding
- [ ] Tried refreshing page
- [ ] Tried different browser
- [ ] Cleared cache

---

**If all checks pass and navigation still doesn't work, check the console logs and network tab for specific errors!**

---

**Last Updated:** April 15, 2026  
**Test Type:** Contest Navigation  
**Status:** Ready for Testing
