# Expected Console Output

## When Contest Creator Opens Successfully

You should see this in the browser console (F12):

```
Starting to load initial data...
Problems response status: 200
Batches response status: 200
Raw problems data: Array(5) [ {…}, {…}, {…}, {…}, {…} ]
Is array? true
Data type: object
Problems array length: 5
First problem: Object { slug: "two-sum-variants", title: "Two Sum Variants", difficulty: "Easy", … }
Batches loaded: Object { batches: Array(3) }
```

## What Each Log Means

### `Starting to load initial data...`
✅ The component is attempting to fetch problems and batches

### `Problems response status: 200`
✅ The API responded successfully (200 = OK)
❌ If you see 401: Not authenticated
❌ If you see 404: Wrong API endpoint
❌ If you see 500: Server error

### `Raw problems data: Array(5) [ ... ]`
✅ The API returned an array with 5 problems
❌ If you see `Array(0)`: No problems in database - run seed command
❌ If you see `Object { ... }`: API returned object format (code handles this)

### `Is array? true`
✅ The response is an array (expected format)

### `Problems array length: 5`
✅ 5 problems were loaded into state
❌ If 0: No problems available

### `First problem: Object { slug: "two-sum-variants", ... }`
✅ Shows the first problem's data structure
✅ Confirms problems have required fields (slug, title, difficulty)

## If You See Errors

### Error: "Failed to load problems. Status: 401"
```
Failed to load problems. Status: 401 Error: {"detail":"Authentication required."}
```
**Fix**: Login as a staff member before opening contest creator

### Error: "Failed to load problems. Status: 404"
```
Failed to load problems. Status: 404 Error: Not Found
```
**Fix**: Check API URL configuration in frontend

### Error: "Problems array length: 0"
```
Problems array length: 0
First problem: undefined
```
**Fix**: Run seed command:
```bash
cd backend
python manage.py seed_code2day
```

### Error: Network error
```
Failed to load data: TypeError: Failed to fetch
Error stack: ...
```
**Fix**: Make sure backend is running:
```bash
cd backend
python manage.py runserver
```

## Visual Confirmation

### Step 1 (Basic Information)
You should see:
- Contest Title field
- Description textarea
- Start Time picker (datetime-local)
- End Time picker (datetime-local) ← NEW
- Duration field (minutes)

### Step 2 (Select Problems)
You should see:
- "Select Problems (0 selected)" label
- Scrollable list of problems with:
  - Checkbox for each problem
  - Problem title
  - Difficulty badge (colored: green/yellow/red)
- OR "Loading problems..." (briefly)
- OR "No problems available" (if database is empty)

### Step 3 (Assign Students)
You should see:
- Two mode buttons: "Batch-wise" and "Individual"
- Batch selection (if batch mode)
- Student search and filter (if individual mode)
