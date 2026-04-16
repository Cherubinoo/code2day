# Quick Test Guide - Contest Creator Problem Loading

## What Was Fixed

1. ✅ Added `end_time` field (already present, confirmed working)
2. ✅ Added loading state for problems
3. ✅ Added empty state message when no problems available
4. ✅ Enhanced debug logging to diagnose issues
5. ✅ Fixed API response handling (supports both array and object formats)

## Test Now

### 1. Start Backend (if not running)
```bash
cd backend
python manage.py runserver
```

### 2. Seed Problems (if database is empty)
```bash
cd backend
python manage.py seed_code2day
```

### 3. Test in Browser
1. Open http://localhost:5173 (or your frontend URL)
2. Login as staff member
3. Go to Staff Dashboard
4. Click "Create Contest"
5. **Open Browser Console (F12)** - This is important!
6. Look for these logs:
   ```
   Starting to load initial data...
   Problems response status: 200
   Problems array length: X
   ```
7. Click "Next" to go to Step 2
8. You should see:
   - "Loading problems..." (briefly)
   - Then checkboxes for each problem
   - OR "No problems available" if database is empty

### 4. Check End Time Field
In Step 1 (Basic Information):
- You should see both "Start Time" and "End Time" fields
- Both use date-time pickers
- Located side by side in a grid layout

## What to Look For

### ✅ Success Indicators
- Console shows: `Problems array length: 5` (or any number > 0)
- Step 2 shows checkboxes with problem titles
- Each problem shows difficulty badge (Easy/Medium/Hard)
- Can select/deselect problems
- End time field is visible in Step 1

### ❌ Problem Indicators
- Console shows: `Problems array length: 0`
- Step 2 shows: "No problems available"
- Console shows errors (red text)
- API returns 401 (not logged in)
- API returns 404 (wrong URL)

## If Problems Still Don't Load

Share these details:
1. All console logs (copy from browser console)
2. Network tab response for `/api/problems/` request
3. Result of: `cd backend; python manage.py shell` then:
   ```python
   from apps.learning.models import Problem
   print(f"Problems in DB: {Problem.objects.count()}")
   ```

## Common Issues

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Login as staff member first |
| 0 problems in DB | Run `python manage.py seed_code2day` |
| Frontend not loading | Check if frontend dev server is running |
| Backend not responding | Check if backend is running on port 8000 |
| CORS errors | Check backend CORS settings |
