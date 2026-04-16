# Test Student Dashboard Contest Widget

## 🚀 Quick Start

### 1. Start Backend
```bash
cd backend
python manage.py runserver
```

### 2. Start Frontend
```bash
cd frontend
npm start
```

### 3. Log In as Student
- Open browser to `http://localhost:3000`
- Click "Student Login"
- Enter student register number
- Enter password
- Click "Login"

### 4. View Contest Widget
- You should land on the Progress page (dashboard)
- Scroll down to "My Contests" section
- You should see:
  - 4 gradient statistics cards at the top
  - Tab navigation (Active/Upcoming/Completed)
  - List of contest cards below

---

## ✅ What to Verify

### Statistics Cards
```
✓ Total Contests card (purple gradient)
✓ Participated card (pink gradient)
✓ Completed card (blue gradient)
✓ Problems Solved card (green gradient)
✓ Numbers match actual contest data
```

### Tab Navigation
```
✓ Active tab shows currently running contests
✓ Upcoming tab shows future contests
✓ Completed tab shows past contests
✓ Tab counts are correct
✓ Active tab is highlighted
```

### Contest Cards
```
✓ Contest title displays
✓ Description shows (if available)
✓ Status badge shows correct state
✓ Start time formatted correctly
✓ Duration displays
✓ Problem count shows
✓ Hover effect works (card lifts)
```

### Participation Progress (if started)
```
✓ Progress section displays
✓ Problems solved count correct
✓ Score displays
✓ Progress bar shows correct percentage
✓ "In Progress" badge shows for active
```

### Empty States
```
✓ "No contests assigned" shows when no contests
✓ "No active contests" shows in Active tab
✓ "No upcoming contests" shows in Upcoming tab
✓ "No completed contests" shows in Completed tab
```

### Loading States
```
✓ Loading spinner shows while fetching
✓ "Loading contests..." message displays
```

### Error States
```
✓ Error message shows if API fails
✓ Error icon displays
```

---

## 🎯 Test Scenarios

### Scenario 1: Student with No Contests
**Expected:**
- Statistics show all zeros
- Empty state message displays
- "No contests assigned yet" with trophy icon

### Scenario 2: Student with Active Contests
**Expected:**
- Active tab shows contests
- "Start Contest" button visible
- Status badge shows "Active Now" in green

### Scenario 3: Student with Started Contest
**Expected:**
- Progress section displays
- Shows X/Y problems solved
- Shows current score
- Progress bar partially filled
- "In Progress" badge visible

### Scenario 4: Student with Completed Contests
**Expected:**
- Completed tab shows contests
- Status badge shows "Completed" in gray
- Final stats display
- Progress bar fully filled (if all solved)

### Scenario 5: Tab Switching
**Expected:**
- Clicking tabs changes content
- Tab counts update
- Active tab highlighted
- Smooth transition

### Scenario 6: Contest Navigation
**Expected:**
- Clicking contest card navigates
- Contest detail page loads
- Can return to dashboard

---

## 🐛 Common Issues & Fixes

### Issue: Widget Not Showing
**Check:**
- Backend server running?
- Frontend server running?
- Logged in as student?
- On Progress page?

**Fix:**
- Restart servers
- Clear browser cache
- Re-login

### Issue: No Contests Display
**Check:**
- Are contests published?
- Is student assigned to contests?
- Check browser console for errors

**Fix:**
```bash
cd backend
python fix_student_contests.py
# Type 'yes' to publish contests
```

### Issue: Statistics Show Zero
**Check:**
- Has student started any contests?
- Are participations recorded?

**Fix:**
- Start a contest
- Solve some problems
- Refresh page

### Issue: Progress Not Updating
**Check:**
- Is participation active?
- Are submissions recorded?

**Fix:**
- Check backend logs
- Verify API responses
- Refresh page

---

## 🔍 Browser Console Checks

### Check API Response
```javascript
// Open browser console (F12)
fetch('/api/student/contests/', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log('Contests:', data));
```

**Expected Output:**
```json
{
  "contests": [
    {
      "id": 1,
      "title": "Contest Name",
      "is_active": true,
      "problem_count": 5,
      ...
    }
  ]
}
```

### Check for Errors
```javascript
// Look for errors in console
// Should see no red error messages
```

---

## 📊 Backend Verification

### Check Contest Status
```bash
cd backend
python manage.py track_contests
```

**Expected:**
- Table showing all contests
- Status column shows "published"
- Assigned column shows student count

### Check Student Visibility
```bash
python test_student_visibility.py
```

**Expected:**
- Test passes ✅
- Shows contests student can see

---

## 🎨 Visual Checks

### Desktop View (1200px+)
```
✓ 4 statistics cards in a row
✓ Contest cards full width
✓ All elements properly spaced
✓ No horizontal scroll
```

### Tablet View (768px - 1199px)
```
✓ 2 statistics cards per row
✓ Contest cards full width
✓ Readable text sizes
✓ Touch-friendly buttons
```

### Mobile View (< 768px)
```
✓ 1 statistics card per column
✓ Contest cards stack vertically
✓ Text remains readable
✓ Buttons easy to tap
```

---

## 🎯 Performance Checks

### Load Time
```
✓ Widget loads within 1 second
✓ No visible layout shifts
✓ Smooth animations
```

### Interactions
```
✓ Tab switching instant
✓ Hover effects smooth
✓ Click responses immediate
```

### Data Updates
```
✓ Statistics calculate quickly
✓ Filtering happens instantly
✓ No lag when switching tabs
```

---

## ✅ Final Checklist

### Functionality
- [ ] Widget displays on Progress page
- [ ] Statistics cards show correct numbers
- [ ] Tab navigation works
- [ ] Contest cards display properly
- [ ] Hover effects work
- [ ] Click navigation works
- [ ] Progress tracking accurate
- [ ] Empty states display correctly
- [ ] Loading states show
- [ ] Error handling works

### Design
- [ ] Gradient cards look good
- [ ] Status badges clear
- [ ] Typography readable
- [ ] Spacing consistent
- [ ] Colors match design
- [ ] Icons display correctly
- [ ] Progress bars animate smoothly
- [ ] Responsive on all devices

### Integration
- [ ] API calls successful
- [ ] Data displays correctly
- [ ] Navigation functional
- [ ] No console errors
- [ ] Backend responds correctly

---

## 🎉 Success Criteria

If all checks pass:
- ✅ Widget is working correctly
- ✅ Ready for production use
- ✅ Students can view and manage contests
- ✅ UI is polished and professional

---

## 📞 Need Help?

### Check Documentation
- `STUDENT_DASHBOARD_CONTEST_WIDGET.md` - Technical details
- `CONTEST_WIDGET_VISUAL_GUIDE.md` - Visual guide
- `STUDENT_DASHBOARD_UPDATE_COMPLETE.md` - Summary

### Run Diagnostics
```bash
cd backend
python fix_student_contests.py
python test_student_visibility.py
python manage.py track_contests
```

### Check Logs
```bash
# Backend logs
# Look for errors in terminal running Django

# Frontend logs
# Check browser console (F12)
```

---

**Happy Testing! 🚀**
