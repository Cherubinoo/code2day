# Contest Approval Workflow Implementation

## Overview
Complete contest management system with HOD approval workflow, flexible student assignment (batch-wise and individual), and comprehensive tracking.

## Database Changes

### Contest Model Enhancements
Added new fields to track approval workflow:

```python
# Status choices expanded
CONTEST_STATUS_CHOICES = (
    ("draft", "Draft"),
    ("pending_approval", "Pending Approval"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("published", "Published"),
    ("active", "Active"),
    ("completed", "Completed"),
    ("archived", "Archived"),
)

# New fields
approved_by = ForeignKey(StaffProfile)  # HOD who approved
approved_at = DateTimeField()
rejection_reason = TextField()
submitted_for_approval_at = DateTimeField()
assigned_batches = JSONField()  # List of batch codes
assigned_students = ManyToManyField(StudentProfile)  # Individual students
```

### Model Methods
- `submit_for_approval()` - Submit contest for HOD review
- `approve(hod_profile)` - Approve contest
- `reject(reason)` - Reject with reason
- `publish()` - Make approved contest visible to students

## API Endpoints

### Contest Management
- `POST /api/contests/` - Create contest (staff/HOD)
  - Supports batch assignment and individual student selection
  - Can submit for approval immediately or save as draft
  
- `GET /api/contests/` - List contests
  - Staff: See only their own contests
  - HOD: See all department contests
  
- `POST /api/contests/<id>/submit-for-approval/` - Submit draft for approval
- `POST /api/contests/<id>/approve/` - Approve/reject contest (HOD only)
- `POST /api/contests/<id>/publish/` - Publish approved contest

### Student Management
- `GET /api/students/filter/` - Filter students with search and batch filter
  - Query params: `batch`, `search`, `limit`
  - Returns students with solved count and streak

### Batch Management
- `GET /api/batches/` - List all batches in department
- `GET /api/batches/<batch_code>/students/` - Get students in batch

## Frontend Components

### 1. EnhancedContestCreator (Staff)
**Location:** `frontend/src/components/staff/EnhancedContestCreator.jsx`

**Features:**
- 3-step wizard interface
  - Step 1: Basic information (title, description, timing)
  - Step 2: Problem selection with difficulty indicators
  - Step 3: Student assignment

**Student Assignment Modes:**
1. **Batch-wise Selection**
   - Select entire batches
   - Shows student count per batch
   - Auto-assigns all students in selected batches

2. **Individual Selection**
   - Search by name or register number
   - Filter by batch
   - Bulk select/deselect
   - Shows student details (register number, name, batch, solved count)

**Actions:**
- Save as Draft
- Submit for Approval (validates problems and students)

### 2. ContestApprovalPanel (HOD)
**Location:** `frontend/src/components/hod/ContestApprovalPanel.jsx`

**Features:**
- Lists all pending contests
- Shows contest details:
  - Creator name and date
  - Problem count
  - Assigned student count
  - Duration and start time
- Actions:
  - Approve contest
  - Reject with reason (modal)

### 3. Updated StaffDashboard
**Features:**
- Uses EnhancedContestCreator
- Shows contest status badges
- Displays approval status
- Shows rejection reasons if applicable

## Workflow

### Staff Creates Contest
1. Click "Create Contest" button
2. Fill basic information (Step 1)
3. Select problems from list (Step 2)
4. Choose assignment mode:
   - **Batch-wise**: Select batches → Auto-assigns students
   - **Individual**: Search/filter → Select specific students
5. Choose action:
   - **Save as Draft**: Status = "draft"
   - **Submit for Approval**: Status = "pending_approval"

### HOD Reviews Contest
1. Navigate to HOD Dashboard
2. See "Contests Pending Approval" section
3. Review contest details
4. Choose action:
   - **Approve**: Status → "approved"
   - **Reject**: Provide reason → Status → "rejected"

### Publishing Contest
1. After approval, contest status = "approved"
2. Staff or HOD can publish
3. Status → "published"
4. Contest becomes visible to assigned students

### Staff Resubmits Rejected Contest
1. View rejected contest
2. See rejection reason
3. Edit contest
4. Submit for approval again

## Status Flow

```
draft → pending_approval → approved → published → active → completed
                ↓
            rejected → (edit) → pending_approval
```

## Permissions

### Staff
- Create contests
- View own contests
- Submit for approval
- Edit draft/rejected contests
- Publish approved contests (own only)

### HOD
- View all department contests
- Approve/reject pending contests
- Create contests (auto-approved)
- Publish any approved contest in department

## Database Migrations
- **Migration 0027**: Added approval workflow fields
  - `approved_by`, `approved_at`, `rejection_reason`
  - `submitted_for_approval_at`
  - Updated status choices

## Key Features

### 1. Flexible Student Assignment
- **Batch-wise**: Quick assignment of entire batches
- **Individual**: Granular control with search and filters
- **Mixed**: Can combine both methods
- **Validation**: Ensures at least one student assigned

### 2. Approval Workflow
- **Validation**: Checks for problems and students before submission
- **Tracking**: Records who approved and when
- **Rejection Handling**: Stores reason, allows resubmission
- **Notifications**: Clear status indicators

### 3. Student Filtering
- **Search**: By name or register number
- **Batch Filter**: Show only specific batch
- **Bulk Actions**: Select all filtered, clear all
- **Real-time**: Updates as you type

### 4. Contest Tracking
- **Creator**: Who created the contest
- **Approver**: Which HOD approved
- **Timestamps**: Created, submitted, approved dates
- **Status History**: Full audit trail

## UI/UX Highlights

### Contest Creator
- Step-by-step wizard prevents overwhelming users
- Progress indicator shows current step
- Validation at each step
- Summary before submission
- Clear action buttons (Draft vs Submit)

### Approval Panel
- Highlighted pending contests
- All relevant info at a glance
- Quick approve/reject actions
- Rejection reason modal
- Auto-refresh after actions

### Student Selection
- Dual-mode interface (batch/individual)
- Real-time search and filtering
- Visual feedback for selections
- Student count indicators
- Bulk selection tools

## Testing Checklist

### Staff Workflow
- [ ] Create contest with batch assignment
- [ ] Create contest with individual selection
- [ ] Create contest with mixed assignment
- [ ] Save as draft
- [ ] Submit for approval
- [ ] Edit rejected contest
- [ ] Resubmit after rejection

### HOD Workflow
- [ ] View pending contests
- [ ] Approve contest
- [ ] Reject contest with reason
- [ ] Publish approved contest
- [ ] View all department contests

### Student Assignment
- [ ] Batch-wise selection
- [ ] Individual selection with search
- [ ] Filter by batch
- [ ] Bulk select/deselect
- [ ] Verify correct students assigned

## Future Enhancements
1. Email notifications for approval/rejection
2. Contest templates
3. Recurring contests
4. Contest cloning
5. Advanced analytics per contest
6. Student performance comparison across contests
7. Automated contest scheduling
8. Contest categories/tags
9. Multi-department contests
10. Contest leaderboard widgets

## Files Modified/Created

### Backend
- `backend/apps/learning/models.py` - Enhanced Contest model
- `backend/apps/learning/views.py` - Added 4 new views
- `backend/apps/learning/serializers.py` - Updated serializers
- `backend/apps/learning/urls.py` - Added 4 new endpoints
- `backend/apps/learning/migrations/0027_*.py` - Approval workflow migration

### Frontend
- `frontend/src/components/staff/EnhancedContestCreator.jsx` - New 3-step creator
- `frontend/src/components/hod/ContestApprovalPanel.jsx` - New approval panel
- `frontend/src/components/staff/StaffDashboard.jsx` - Updated to use new creator
- `frontend/src/components/hod/HODDashboard.jsx` - Integrated approval panel

## Summary

This implementation provides a complete contest management system with:
- ✅ HOD approval workflow
- ✅ Flexible student assignment (batch + individual)
- ✅ Advanced filtering and search
- ✅ Proper status tracking
- ✅ Rejection handling with reasons
- ✅ Role-based permissions
- ✅ Comprehensive audit trail
- ✅ Intuitive UI/UX

The system ensures proper oversight while giving staff flexibility in contest creation and student assignment.
