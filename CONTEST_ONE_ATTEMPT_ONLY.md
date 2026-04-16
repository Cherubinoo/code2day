# Contest One Attempt Only - Implementation

## Overview
Implemented a system where each contest can only be attempted once by a student. Once started, students cannot continue or reattempt the contest.

## Key Changes

### 1. Frontend Changes

#### StudentContestsPage.jsx
- **Removed "Continue Contest" button**: Replaced with "Contest Already Attempted" message
- **Updated ContestCard component**: Shows locked state for started contests
- **Removed onContinue prop**: No longer needed since continuing is not allowed

**Before:**
```jsx
{contest.has_started ? (
  <button onClick={onContinue}>Continue Contest</button>
) : (
  <button onClick={onStart}>Start Contest</button>
)}
```

**After:**
```jsx
{contest.has_started ? (
  <div style={{ background: '#f3f4f6', padding: '12px', textAlign: 'center' }}>
    <div>Contest Already Attempted</div>
    <div>You can only attempt each contest once</div>
  </div>
) : (
  <button onClick={onStart}>Start Contest</button>
)}
```

#### ContestWorkspacePage.jsx
- **Added "Leave Contest" button**: Allows students to exit and end their attempt
- **Updated "Finish Contest" messaging**: Clearer warnings about finality
- **Both buttons call auto-submit**: Ends participation when clicked

### 2. Backend Changes

#### StudentContestDetailView (views.py)
- **Auto-end expired participations**: Checks if time exceeded contest duration
- **Block access after completion**: Returns 403 if participation has ended
- **Time-based validation**: Uses `timedelta` to calculate if duration exceeded

```python
# Auto-end participation if time has expired
if participation and participation.is_active:
    time_elapsed = timezone.now() - participation.started_at
    max_duration = timedelta(minutes=contest.duration_minutes)
    
    if time_elapsed > max_duration:
        participation.end_participation()

# Prevent access if participation has ended
if participation and not participation.is_active:
    return Response({
        "detail": "You have already completed this contest. Each contest can only be attempted once."
    }, status=status.HTTP_403_FORBIDDEN)
```

#### StudentContestListView (views.py)
- **Auto-end expired participations**: Same logic as detail view
- **Accurate status display**: Shows correct has_started status after auto-end

### 3. Management Command

#### cleanup_expired_participations.py
- **Batch cleanup**: Finds and ends all expired participations
- **Dry-run support**: Test what would be cleaned up
- **Detailed logging**: Shows which participations were ended

**Usage:**
```bash
# Test what would be cleaned up
python manage.py cleanup_expired_participations --dry-run

# Actually clean up expired participations
python manage.py cleanup_expired_participations
```

## How It Works

### 1. Starting a Contest
1. Student clicks "Start Contest"
2. Confirmation modal warns about one-attempt policy
3. `ContestParticipation` record created with `is_active=True`
4. Student enters contest workspace

### 2. During Contest
1. Timer counts down from contest duration
2. Student can solve problems and submit
3. Two exit options:
   - **"Leave Contest"**: Exits early, ends participation
   - **"Finish Contest"**: Completes contest, ends participation

### 3. Time Expiration
1. Backend automatically detects when `started_at + duration_minutes` is exceeded
2. Calls `participation.end_participation()` which:
   - Sets `is_active=False`
   - Sets `completed_at=now()`
   - Calculates `time_spent_seconds`

### 4. Returning to Dashboard
1. Student sees "Contest Already Attempted" message
2. Cannot access contest workspace (403 Forbidden)
3. No "Continue" or "Reattempt" options

## Auto-End Triggers

Participations are automatically ended when:

1. **Student clicks "Leave Contest"** → Calls `/api/student/contests/{id}/auto-submit/`
2. **Student clicks "Finish Contest"** → Calls `/api/student/contests/{id}/auto-submit/`
3. **Time expires** → Auto-detected in `StudentContestDetailView` and `StudentContestListView`
4. **Cleanup command runs** → `cleanup_expired_participations` management command

## Database Changes

No schema changes required. Uses existing `ContestParticipation` model:
- `is_active`: Boolean indicating if participation is ongoing
- `completed_at`: Timestamp when participation ended
- `time_spent_seconds`: Total time spent in contest

## User Experience

### Before (Multiple Attempts)
1. Start contest → Can leave and return
2. "Continue Contest" button always available
3. Multiple attempts possible

### After (One Attempt Only)
1. Start contest → **Warning: "This action cannot be undone"**
2. Once started → **Cannot return to dashboard and continue**
3. Must finish in one session → **"Contest Already Attempted" if they try to return**

## Error Messages

- **Trying to access completed contest**: "You have already completed this contest. Each contest can only be attempted once."
- **Leave contest confirmation**: "Are you sure you want to leave this contest? Your attempt will be submitted and you cannot return."
- **Finish contest confirmation**: "Are you sure you want to finish this contest? This action cannot be undone."

## Testing Checklist

- [ ] Start contest shows warning modal
- [ ] After starting, cannot return to continue
- [ ] "Leave Contest" button ends participation
- [ ] "Finish Contest" button ends participation  
- [ ] Time expiration auto-ends participation
- [ ] Cleanup command finds and ends expired participations
- [ ] Contest list shows "Already Attempted" for completed contests
- [ ] Trying to access completed contest returns 403 error
- [ ] Multiple students can still start the same contest independently

## Maintenance

Run the cleanup command periodically (e.g., via cron job) to ensure expired participations are ended:

```bash
# Add to crontab to run every 15 minutes
*/15 * * * * cd /path/to/project && python backend/manage.py cleanup_expired_participations
```

This ensures students who close their browser or lose connection don't have "zombie" active participations.