# Session-Based Contest Timing Implementation

## Overview
Successfully implemented a session-based contest timing system that allows individual students to have their own contest timer, replacing the previous fixed start/end time system.

## Key Features Implemented

### 1. **Enhanced Contest Model**
- Added `access_start_time` and `access_end_time` for contest availability window
- Added `session_duration_minutes` for individual session timing
- Maintained backward compatibility with legacy `start_time`, `end_time`, `duration_minutes` fields
- Updated contest status properties (`is_active`, `is_ended`, `is_upcoming`) to use new timing logic

### 2. **Enhanced Contest Participation Model**
- Added `session_end_time` field calculated from `started_at + session_duration_minutes`
- Added `auto_submitted` boolean flag to track auto-submissions
- Added `is_session_expired` property to check if individual session has expired
- Added `remaining_time_seconds` property for real-time countdown
- Enhanced `end_participation()` method to handle auto-submission

### 3. **Updated Contest Creator Interface**
- Modified `EnhancedContestCreator.jsx` to use new session-based fields
- Changed labels to clarify the difference between access window and session duration
- Added helpful descriptions explaining session-based timing
- Removed auto-calculation of duration from start/end times

### 4. **Enhanced Backend API**
- Updated `StudentContestStartView` to handle session-based timing
- Enhanced `StudentContestAutoSubmitView` to check session expiry before auto-submit
- Added new `StudentContestSessionStatusView` for real-time session monitoring
- Updated `ContestListCreateView` to handle new timing fields

### 5. **Frontend Timer Component**
- Created `ContestSessionTimer.jsx` for real-time session countdown
- Automatic session status polling every 5 seconds
- Visual indicators for time warnings (orange < 10min, red < 5min)
- Automatic auto-submit when session expires
- Error handling and loading states

### 6. **Database Migration**
- Created migration `0046_add_session_based_contest_timing.py`
- Added new fields while maintaining backward compatibility
- Successfully applied to database

## How It Works

### Contest Creation Flow
1. **Staff creates contest** with:
   - `access_start_time`: When students can start accessing the contest
   - `access_end_time`: When contest link expires (no new participants)
   - `session_duration_minutes`: Individual session time (e.g., 30 minutes)

### Student Participation Flow
1. **Student starts contest**: Creates `ContestParticipation` record
2. **Session timer calculated**: `session_end_time = started_at + session_duration_minutes`
3. **Real-time monitoring**: Frontend polls session status every 5 seconds
4. **Auto-submit on expiry**: When `session_end_time` is reached, contest auto-submits
5. **Session tracking**: All timing is individual per student

### Key Differences from Previous System
| Previous System | New Session-Based System |
|----------------|-------------------------|
| Fixed start/end times for all | Individual session timing per student |
| Global contest timer | Personal session timer |
| Manual time tracking | Automatic session monitoring |
| No auto-submit | Automatic auto-submit on expiry |
| All students same window | Flexible access window + individual sessions |

## API Endpoints

### New Endpoints
- `GET /api/student/contests/{id}/session-status/` - Get current session status and remaining time
- Enhanced existing endpoints to handle session-based timing

### Updated Endpoints
- `POST /api/student/contests/{id}/start/` - Now returns session timing info
- `POST /api/student/contests/{id}/auto-submit/` - Enhanced with session expiry checks
- `POST /api/contests/` - Accepts new session-based timing fields

## Example Usage

### Creating a Session-Based Contest
```javascript
const contestData = {
  title: "30-Minute Programming Challenge",
  description: "Individual 30-minute coding session",
  contest_type: "programming",
  access_start_time: "2026-05-02T10:00:00",  // Contest available from 10 AM
  access_end_time: "2026-05-02T18:00:00",    // Contest link expires at 6 PM
  session_duration_minutes: 30,               // Each student gets 30 minutes
  problem_slugs: ["two-sum", "reverse-string"],
  assigned_batches: ["23", "24"]
};
```

### Student Session Flow
1. Student clicks "Start Contest" between 10 AM - 6 PM
2. Gets 30-minute individual session starting from their click time
3. Timer counts down from 30:00 to 00:00
4. Auto-submits at 00:00 if student hasn't manually submitted

## Testing

Created comprehensive test script `test_session_contest.py` that verifies:
- ✅ Contest creation with session-based timing
- ✅ Participation creation with session calculation
- ✅ Session expiry detection
- ✅ Auto-submit functionality
- ✅ Timing calculations

## Benefits

1. **Flexible Scheduling**: Students can start within a window, not at fixed time
2. **Fair Timing**: Everyone gets exactly the same session duration
3. **Automatic Management**: No manual intervention needed for time tracking
4. **Better UX**: Real-time countdown with visual warnings
5. **Robust System**: Handles network issues, page refreshes, etc.
6. **Backward Compatible**: Existing contests continue to work

## Files Modified

### Backend
- `backend/apps/learning/models.py` - Enhanced Contest and ContestParticipation models
- `backend/apps/learning/views.py` - Updated contest views and added session status endpoint
- `backend/apps/learning/urls.py` - Added new session status URL pattern
- `backend/apps/learning/migrations/0046_add_session_based_contest_timing.py` - Database migration

### Frontend
- `frontend/src/components/staff/EnhancedContestCreator.jsx` - Updated for session-based fields
- `frontend/src/components/student/pages/StudentContestsPage.jsx` - Updated to show session duration
- `frontend/src/components/common/ContestSessionTimer.jsx` - New timer component

### Testing
- `backend/test_session_contest.py` - Comprehensive test script

## Next Steps

The session-based contest timing system is now fully implemented and ready for use. Key features include:

1. ✅ **Topic-based question selection with difficulty distribution** (already existed)
2. ✅ **Session-based contest timing** (newly implemented)
3. ✅ **Auto-submit when session expires** (newly implemented)
4. ✅ **Real-time session monitoring** (newly implemented)

The system provides a much more flexible and user-friendly contest experience while maintaining all the existing functionality for topic selection and difficulty distribution.