-- Contest Status Check SQL Script
-- Run this in PostgreSQL to check contest status

-- 1. Check all contests and their status
SELECT 
    id,
    title,
    status,
    start_time,
    end_time,
    duration_minutes,
    created_at
FROM contests
ORDER BY created_at DESC;

-- 2. Count contests by status
SELECT 
    status,
    COUNT(*) as count
FROM contests
GROUP BY status
ORDER BY count DESC;

-- 3. Check student assignments per contest
SELECT 
    c.id,
    c.title,
    c.status,
    COUNT(DISTINCT ca.studentprofile_id) as assigned_students,
    c.start_time,
    c.end_time
FROM contests c
LEFT JOIN contests_assigned_students ca ON c.id = ca.contest_id
GROUP BY c.id, c.title, c.status, c.start_time, c.end_time
ORDER BY c.created_at DESC;

-- 4. Check which contests are visible to students (published only)
SELECT 
    c.id,
    c.title,
    c.status,
    COUNT(DISTINCT ca.studentprofile_id) as assigned_students,
    CASE 
        WHEN c.status = 'published' THEN 'VISIBLE ✓'
        ELSE 'NOT VISIBLE ✗'
    END as visibility
FROM contests c
LEFT JOIN contests_assigned_students ca ON c.id = ca.contest_id
GROUP BY c.id, c.title, c.status
ORDER BY c.created_at DESC;

-- 5. Check participations
SELECT 
    c.id as contest_id,
    c.title,
    c.status,
    COUNT(DISTINCT cp.id) as participations,
    COUNT(DISTINCT cp.student_id) as unique_students
FROM contests c
LEFT JOIN contest_participations cp ON c.id = cp.contest_id
GROUP BY c.id, c.title, c.status
ORDER BY c.created_at DESC;

-- 6. Find contests for a specific student (replace register number)
SELECT 
    c.id,
    c.title,
    c.status,
    c.start_time,
    c.end_time,
    sp.register_number,
    sp.name as student_name
FROM contests c
JOIN contests_assigned_students ca ON c.id = ca.contest_id
JOIN student_profiles sp ON ca.studentprofile_id = sp.id
WHERE sp.register_number = 'YOUR_REGISTER_NUMBER_HERE'
ORDER BY c.created_at DESC;

-- 7. Quick fix: Publish all approved contests
-- UNCOMMENT TO RUN:
-- UPDATE contests 
-- SET status = 'published' 
-- WHERE status = 'approved';

-- 8. Check if any contests exist at all
SELECT 
    (SELECT COUNT(*) FROM contests) as total_contests,
    (SELECT COUNT(*) FROM contests WHERE status = 'published') as published_contests,
    (SELECT COUNT(*) FROM contests WHERE status = 'approved') as approved_contests,
    (SELECT COUNT(*) FROM contests WHERE status = 'pending_approval') as pending_contests,
    (SELECT COUNT(*) FROM contests WHERE status = 'draft') as draft_contests;
