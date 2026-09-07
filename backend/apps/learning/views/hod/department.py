"""Views extracted from the original monolithic apps/learning/views.py
(module: hod/department). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class DepartmentDetailView(APIView):
    """Get detailed analytics for a specific department."""
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id):
        is_staff = hasattr(request.user, 'staff_profile')
        is_admin = request.user.is_superuser
        
        if not is_staff and not is_admin:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        user_profile = request.user.staff_profile if is_staff else None
        user_role = user_profile.role if user_profile else None
        inst = user_profile.institution if user_profile else None

        # Get the target department
        dept = get_object_or_404(Department, id=dept_id)
        
        # Check permissions: Institutional roles can view any department in their institution
        if is_staff:
            if user_role in ("hod", "academics") and dept != user_profile.department:
                return Response({"detail": "You can only view your own department."}, status=status.HTTP_403_FORBIDDEN)
            if dept.institution != inst:
                return Response({"detail": "You do not have access to this department."}, status=status.HTTP_403_FORBIDDEN)

        # Get students in this department
        department_students = StudentProfile.objects.filter(
            institution=dept.institution,
            department=dept
        )

        # Get top performers in department
        top_students = []
        for student in department_students.annotate(
            solved_count=Count('solved_problems', distinct=True)
        ).order_by('-solved_count')[:10]:
            top_students.append({
                "id": student.register_number,
                "name": student.name,
                "solved_count": student.solved_count,
                "current_streak": student.current_streak,
            })

        # Get contests in department
        recent_contests = []
        dept_contests_qs = Contest.objects.filter(
            institution=dept.institution,
            department=dept
        ).order_by('-created_at')[:10]

        for contest in dept_contests_qs:
            contest_summary = _contest_live_summary(contest)

            recent_contests.append({
                "id": contest.id,
                "title": contest.title,
                "status": contest.status,
                "created_at": contest.created_at,
                "total_participants": contest_summary["total_participants"],
                "total_submissions": contest_summary["total_submissions"],
                "top_performers": contest_summary["top_performers"],
            })

        # Batch-wise grouping
        batch_wise_data = []
        batches = department_students.filter(batch__isnull=False).exclude(batch='').values_list('batch', flat=True).distinct()

        for batch in batches:
            all_batch_students = department_students.filter(batch=batch).annotate(
                solved_count=Count('solved_problems', distinct=True)
            ).order_by('-solved_count')

            batch_count = all_batch_students.count()

            batch_top_performers = []
            for student in all_batch_students[:5]:
                batch_top_performers.append({
                    "register_number": student.register_number,
                    "name": student.name,
                    "section": student.section,
                    "solved_count": student.solved_count,
                    "current_streak": student.current_streak,
                })

            all_students = []
            for student in all_batch_students:
                all_students.append({
                    "register_number": student.register_number,
                    "name": student.name,
                    "section": student.section,
                    "solved_count": student.solved_count,
                    "current_streak": student.current_streak,
                    "last_active": student.last_login_on.isoformat() if student.last_login_on else None,
                    "is_active": student.account.is_active if student.account else True,
                    "allow_copy_paste": student.allow_copy_paste,
                })

            batch_sections = sorted(set(s for s in all_batch_students.values_list('section', flat=True) if s))

            batch_wise_data.append({
                "batch": batch,
                "student_count": batch_count,
                "sections": batch_sections,
                "top_performers": batch_top_performers,
                "students": all_students,
            })

        # Weekly progress (accepts ?start_date=&end_date=, defaults to last 7 days)
        weekly_progress = build_solved_activity_series(
            Q(student__department=dept),
            start_date=parse_date_param(request.query_params.get('start_date')),
            end_date=parse_date_param(request.query_params.get('end_date')),
        )

        # Recent Activity
        recent_activity = []
        recent_solved = SolvedProblem.objects.filter(
            student__department=dept
        ).select_related('student', 'problem').order_by('-solved_at')[:10]
        
        for solved in recent_solved:
            recent_activity.append({
                "student_name": solved.student.name,
                "student_id": solved.student.register_number,
                "problem_title": solved.problem.title,
                "solved_at": solved.solved_at.isoformat(),
            })

        # Engagement Summary
        today = timezone.now().date()
        active_today = department_students.filter(last_login_on=today).count()
        total_students = department_students.count()
        avg_solved = 0
        if total_students > 0:
            total_solved_count = SolvedProblem.objects.filter(student__department=dept).count()
            avg_solved = round(total_solved_count / total_students, 1)

        return Response({
            "department": {
                "id": dept.id,
                "name": dept.name,
                "code": dept.code,
                "assigned_students": total_students,
            },
            "analytics": {
                "total_solved": SolvedProblem.objects.filter(student__department=dept).count(),
                "weekly_progress": weekly_progress,
                "top_performers": top_students,
                "contests": recent_contests,
                "batch_wise": batch_wise_data,
                "recent_activity": recent_activity,
                "engagement_summary": {
                    "active_today": active_today,
                    "avg_solved": avg_solved,
                    "participation_rate": round((active_today / total_students * 100), 1) if total_students > 0 else 0
                }
            },
        })

class DepartmentStudentsFilterView(APIView):
    """Get students in department with filtering options"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = request.user.staff_profile

        # Base query - students in staff's department
        students = StudentProfile.objects.filter(
            institution=profile.institution,
            department=profile.department
        ).select_related('department')

        # Apply filters
        batch = request.query_params.get('batch')
        section = request.query_params.get('section')
        search = request.query_params.get('search')

        if batch:
            students = students.filter(batch=batch)

        if section:
            students = students.filter(section=section)

        if search:
            students = students.filter(
                Q(name__icontains=search) | 
                Q(register_number__icontains=search)
            )

        # Annotate with solved count
        students = students.annotate(
            solved_count=Count('solved_problems', distinct=True)
        ).order_by('register_number')

        # Limit results
        limit = int(request.query_params.get('limit', 100))
        students = students[:limit]

        data = []
        for student in students:
            data.append({
                "id": student.id,
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "section": student.section,
                "solved_count": student.solved_count,
                "current_streak": student.current_streak,
            })

        return Response({
            "students": data,
            "total": len(data),
        })

class HODDeptInfoView(APIView):
    """HOD: return real batches and sections from department students."""

    def get(self, request):
        staff = _staff_from_request(request)
        if not staff or staff.role not in ("hod", "academics", "admin"):
            return Response({"error": "HOD access required"}, status=403)

        stu_qs = StudentProfile.objects.filter(department=staff.department)
        batches = sorted(set(
            v for v in stu_qs.values_list("batch", flat=True).distinct() if v
        ))
        sections = sorted(set(
            v for v in stu_qs.values_list("section", flat=True).distinct() if v
        ))
        # Build per-batch section map
        sections_by_batch = {}
        for batch in batches:
            secs = sorted(set(
                v for v in stu_qs.filter(batch=batch).values_list("section", flat=True).distinct() if v
            ))
            sections_by_batch[batch] = secs
        return Response({"batches": batches, "sections": sections, "sections_by_batch": sections_by_batch})

