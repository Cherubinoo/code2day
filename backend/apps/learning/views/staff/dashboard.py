"""Views extracted from the original monolithic apps/learning/views.py
(module: staff/dashboard). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class StaffInstitutionDetailView(APIView):
    """Get institution details for staff members."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        # Check if user is staff (has staff_profile) or admin
        is_staff = hasattr(request.user, 'staff_profile')
        is_admin = request.user.is_superuser

        if not is_staff and not is_admin:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        # If staff, verify they belong to this institution
        if is_staff and request.user.staff_profile.institution != institution:
            return Response({"detail": "You do not have access to this institution."}, status=status.HTTP_403_FORBIDDEN)

        # Get the user's staff profile if available
        user_profile = request.user.staff_profile if is_staff else None
        user_role = user_profile.role if user_profile else None
        user_department = user_profile.department if user_profile else None

        # For HOD / Academic Coordinator, filter students by department
        if user_profile and user_profile.role in ("hod", "academics") and user_profile.department:
            students_qs = StudentProfile.objects.filter(
                institution=institution,
                department=user_profile.department
            ).select_related('account', 'department')
        else:
            students_qs = StudentProfile.objects.filter(
                institution=institution
            ).select_related('account', 'department')

        # Build student list with metrics
        student_list = []
        for student in students_qs:
            student_list.append({
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "section": student.section,
                "department": student.department.code if student.department else "N/A",
                "department_name": student.department.name if student.department else "N/A",
                "solved_count": student.solved_problems.count(),
                "current_streak": student.current_streak,
                "last_active": student.account.last_login if student.account else None,
                "is_active": student.account.is_active if student.account else True,
                "allow_copy_paste": student.allow_copy_paste,
            })

        # Get staff (filter by department for HOD/Academics, all for admin/staff)
        if user_role in ("hod", "academics") and user_department:
            staff = StaffProfile.objects.filter(institution=institution, department=user_department)
        else:
            staff = StaffProfile.objects.filter(institution=institution)
        staff_list = []
        for s in staff:
            staff_list.append({
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.role,
                "role_display": s.get_role_display(),
                "password_is_set": s.password_is_set,
                "is_active": s.is_active,
            })

        # Get stats
        active_sessions = ProblemSession.objects.filter(
            is_active=True,
            student__institution=institution
        ).count()

        # Get problem stats for this institution
        solved_count = SolvedProblem.objects.filter(student__institution=institution).count()
        total_students = len(student_list)
        success_rate = round((solved_count / total_students) * 100) if total_students > 0 else 0

        response_data = {
            "institution": {
                "id": institution.institution_id,
                "name": institution.name,
                "short_code": institution.short_code,
                "address": institution.address,
                "is_active": institution.is_active,
            },
            "students": student_list,
            "staff": staff_list,
            "stats": {
                "total_students": total_students,
                "total_staff": len(staff_list),
                "active_sessions": active_sessions,
                "total_solved": solved_count,
                "success_rate": success_rate,
            },
        }
        
        # Add department info for HOD / Academic Coordinator users
        if user_role in ("hod", "academics") and user_department:
            response_data["department"] = {
                "id": user_department.id,
                "code": user_department.code,
                "name": user_department.name,
            }
        
        return Response(response_data)

class StaffPerformanceView(APIView):
    """Get individual staff performance metrics for HOD."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        # Check if user is HOD or staff
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        user_profile = request.user.staff_profile
        user_role = user_profile.role
        user_department = user_profile.department
        # Institution-wide roles are never department-scoped, even if their
        # own StaffProfile record happens to carry a department FK.
        if user_role in ("admin", "director", "tpu", "principal", "ja"):
            user_department = None

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        # Verify staff belongs to this institution
        if user_profile.institution != institution:
            return Response({"detail": "You do not have access to this institution."}, status=status.HTTP_403_FORBIDDEN)

        # Filter by department for HOD / Academics, all for staff/admin
        if user_role in ("hod", "academics") and user_department:
            staff_qs = StaffProfile.objects.filter(institution=institution, department=user_department)
        else:
            staff_qs = StaffProfile.objects.filter(institution=institution)

        staff_performance = []
        for staff in staff_qs:
            # Calculate days active (since account creation)
            days_active = 1
            if staff.account and staff.account.date_joined:
                days_active = (timezone.now() - staff.account.date_joined).days

            # Get number of students in this staff's department (managed by staff)
            assigned_students = StudentProfile.objects.filter(
                institution=institution,
                department=staff.department
            ).count() if staff.department else 0

            # Student progress (problems solved by students in department)
            student_progress = 0
            if staff.department:
                student_progress = SolvedProblem.objects.filter(
                    student__department=staff.department,
                    student__institution=institution
                ).count()

            # Contests created by this staff with top performers
            staff_contests = []
            contests_qs = staff.contests.filter(
                institution=institution
            ).order_by('-created_at')[:5]  # Last 5 contests

            for contest in contests_qs:
                contest_summary = _contest_live_summary(contest)

                staff_contests.append({
                    "id": contest.id,
                    "title": contest.title,
                    "status": contest.status,
                    "created_at": contest.created_at,
                    "total_participants": contest_summary["total_participants"],
                    "total_submissions": contest_summary["total_submissions"],
                    "top_performers": contest_summary["top_performers"],
                })

            contests_created = staff.contests.filter(institution=institution).count()

            staff_performance.append({
                "faculty_id": staff.faculty_id,
                "name": staff.name or staff.faculty_id,
                "role": staff.role,
                "days_active": days_active,
                "assigned_students": assigned_students,
                "student_progress": student_progress,
                "contests_created": contests_created,
                "contests": staff_contests,
            })

        return Response({
            "staff_performance": staff_performance,
            "department": {
                "id": user_department.id,
                "code": user_department.code,
                "name": user_department.name,
            } if user_department else None,
        })

class StaffDetailView(APIView):
    """Get detailed analytics for a specific staff member."""
    permission_classes = [IsAuthenticated]

    def get(self, request, faculty_id):
        # Check if user is HOD or staff
        is_staff = hasattr(request.user, 'staff_profile')
        is_admin = request.user.is_superuser
        
        if not is_staff and not is_admin:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        user_profile = request.user.staff_profile if is_staff else None
        user_role = user_profile.role if user_profile else None
        user_department = user_profile.department if user_profile else None

        # Get the target staff member
        target_staff = StaffProfile.objects.filter(faculty_id=faculty_id).select_related('department', 'institution').first()
        if not target_staff:
            target_staff = StaffProfile.objects.filter(account__username=faculty_id).select_related('department', 'institution').first()
        if not target_staff and user_profile:
            target_staff = user_profile
        if not target_staff and is_admin:
            target_staff = StaffProfile.objects.select_related('department', 'institution').first()
        if not target_staff:
            return Response({"detail": "Staff not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions: HOD can only view staff in their department, staff can view anyone in their institution
        if is_staff:
            if user_role in ("hod", "academics") and target_staff.department != user_department:
                return Response({"detail": "You can only view staff in your department."}, status=status.HTTP_403_FORBIDDEN)
            if target_staff.institution != user_profile.institution:
                return Response({"detail": "You do not have access to this staff member."}, status=status.HTTP_403_FORBIDDEN)

        # Get staff activity (days since joining)
        days_active = 0
        if target_staff.account and target_staff.account.date_joined:
            days_active = (timezone.now() - target_staff.account.date_joined).days + 1
        else:
            days_active = (timezone.now() - target_staff.created_at).days + 1 if hasattr(target_staff, 'created_at') else 1

        # Get students in this staff's department or entire institution if no department (Director/TPU)
        if target_staff.department:
            department_students = StudentProfile.objects.filter(
                institution=target_staff.institution,
                department=target_staff.department
            )
        else:
            department_students = StudentProfile.objects.filter(
                institution=target_staff.institution
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

        # Get contests created by this staff with top performers
        recent_contests = []
        staff_contests_qs = target_staff.contests.filter(
            institution=target_staff.institution
        ).order_by('-created_at')[:10]

        for contest in staff_contests_qs:
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

        # Batch-wise grouping with top performers per batch
        batch_wise_data = []
        # Get distinct batches
        batch_filter = Q(institution=target_staff.institution, batch__isnull=False)
        if target_staff.department:
            batch_filter &= Q(department=target_staff.department)
        
        batches = StudentProfile.objects.filter(batch_filter).exclude(batch='').values_list('batch', flat=True).distinct()

        for batch in batches:
            # Get all students for this batch with annotations
            batch_student_filter = Q(institution=target_staff.institution, batch=batch)
            if target_staff.department:
                batch_student_filter &= Q(department=target_staff.department)
                
            all_batch_students = StudentProfile.objects.filter(batch_student_filter).annotate(
                solved_count=Count('solved_problems', distinct=True)
            ).order_by('-solved_count')

            batch_count = all_batch_students.count()

            # Get top performers for this batch (first 5)
            batch_top_performers = []
            for student in all_batch_students[:5]:
                batch_top_performers.append({
                    "register_number": student.register_number,
                    "name": student.name,
                    "section": student.section,
                    "solved_count": student.solved_count,
                    "current_streak": student.current_streak,
                })

            # Get all students for the batch (for expanded view)
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
            Q(student__department=target_staff.department) if target_staff.department
            else Q(student__institution=target_staff.institution),
            start_date=parse_date_param(request.query_params.get('start_date')),
            end_date=parse_date_param(request.query_params.get('end_date')),
        )

        # Recent Activity (Last 10 solved problems)
        recent_activity = []
        recent_filter = Q()
        if target_staff.department:
            recent_filter = Q(student__department=target_staff.department)
        else:
            recent_filter = Q(student__institution=target_staff.institution)
            
        recent_solved = SolvedProblem.objects.filter(recent_filter).select_related('student', 'problem').order_by('-solved_at')[:10]
        
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
            total_solved_filter = Q()
            if target_staff.department:
                total_solved_filter = Q(student__department=target_staff.department)
            else:
                total_solved_filter = Q(student__institution=target_staff.institution)
                
            total_solved_count = SolvedProblem.objects.filter(total_solved_filter).count()
            avg_solved = round(total_solved_count / total_students, 1)

        return Response({
            "staff": {
                "faculty_id": target_staff.faculty_id,
                "name": target_staff.name or target_staff.faculty_id,
                "role": target_staff.role,
                "department": {
                    "id": target_staff.department.id,
                    "code": target_staff.department.code,
                    "name": target_staff.department.name,
                } if target_staff.department else None,
                "institution": {
                    "id": target_staff.institution.institution_id,
                    "name": target_staff.institution.name,
                } if target_staff.institution else None,
                "days_active": days_active,
                "assigned_students": StudentProfile.objects.filter(mentor=target_staff).count(),
            },
            "analytics": {
                "total_solved": SolvedProblem.objects.filter(
                    student__department=target_staff.department
                ).count() if target_staff.department else 0,
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

class StaffContactUpdateView(APIView):
    """Staff: set their own email/mobile_number — backs the one-time
    "please add your contact info" prompt shown right after login when
    either is missing. Not gated to "only if currently empty" — a staff
    member should always be able to keep their own contact info current,
    the "only once" behavior comes from the frontend simply not prompting
    again once both fields are filled."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        profile = request.user.staff_profile
        email = (request.data.get('email') or '').strip()
        mobile_number = (request.data.get('mobile_number') or '').strip()
        if not email and not mobile_number:
            return Response({"error": "Provide an email and/or mobile number."}, status=400)

        update_fields = []
        if email:
            profile.email = email
            update_fields.append('email')
        if mobile_number:
            profile.mobile_number = mobile_number
            update_fields.append('mobile_number')
        profile.save(update_fields=update_fields)

        return Response({"message": "Contact info saved", "email": profile.email, "mobile_number": profile.mobile_number})

class QuestionUsageMarksView(APIView):
    """Staff/HOD: which Aptitude questions and Problems has *this* staff
    member already marked "used" for a given batch — a personal tracker
    (not shared with colleagues) to help avoid repeating questions when
    building a new contest for a batch they've already run one for."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        batch = (request.query_params.get('batch') or '').strip()
        if not batch:
            return Response({"error": "batch is required."}, status=400)

        marks = QuestionUsageMark.objects.filter(staff=request.user.staff_profile, batch=batch)
        return Response({
            "aptitude_question_ids": list(marks.exclude(aptitude_question=None).values_list('aptitude_question_id', flat=True)),
            "problem_slugs": list(
                Problem.objects.filter(id__in=marks.exclude(problem=None).values_list('problem_id', flat=True)).values_list('slug', flat=True)
            ),
        })

class QuestionUsageMarkToggleView(APIView):
    """Staff/HOD: toggle "used for this batch" on one Aptitude question or
    Problem. Pass exactly one of aptitude_question_id / problem_slug."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        profile = request.user.staff_profile

        batch = (request.data.get('batch') or '').strip()
        if not batch:
            return Response({"error": "batch is required."}, status=400)

        aptitude_question_id = request.data.get('aptitude_question_id')
        problem_slug = (request.data.get('problem_slug') or '').strip()

        if bool(aptitude_question_id) == bool(problem_slug):
            return Response({"error": "Provide exactly one of aptitude_question_id or problem_slug."}, status=400)

        lookup = {"staff": profile, "batch": batch}
        if aptitude_question_id:
            question = AptitudeQuestion.objects.filter(id=aptitude_question_id).first()
            if not question:
                return Response({"error": "Aptitude question not found."}, status=404)
            lookup["aptitude_question"] = question
        else:
            problem = Problem.objects.filter(slug=problem_slug).first()
            if not problem:
                return Response({"error": "Problem not found."}, status=404)
            lookup["problem"] = problem

        existing = QuestionUsageMark.objects.filter(**lookup).first()
        if existing:
            existing.delete()
            return Response({"marked": False})
        QuestionUsageMark.objects.create(**lookup)
        return Response({"marked": True})

class StaffLockToggleView(APIView):
    """HOD can lock or unlock staff members from accessing the system."""
    permission_classes = [IsAuthenticated]

    def post(self, request, faculty_id):
        """Toggle staff lock status (lock/unlock)."""
        # Get HOD's profile
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        hod_profile = request.user.staff_profile
        logger.debug(
            "Lock toggle requested by %s (role=%s, dept=%s) for %s",
            hod_profile.faculty_id, hod_profile.role, hod_profile.department_id, faculty_id
        )

        if not getattr(hod_profile, 'is_hod', False) and hod_profile.role not in ('hod', 'academics', 'admin'):
            return Response(
                {"detail": f"Only HOD or Academic Coordinator can lock/unlock staff. Your role: {hod_profile.role}"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get target staff
        try:
            target_staff = StaffProfile.objects.get(faculty_id=faculty_id)
        except StaffProfile.DoesNotExist:
            return Response(
                {"detail": "Staff not found."},
                status=status.HTTP_404_NOT_FOUND
            )


        # HOD can only lock staff within their own department
        if target_staff.department_id != hod_profile.department_id:
            return Response(
                {"detail": "You can only lock/unlock staff in your own department."},
                status=status.HTTP_403_FORBIDDEN
            )

        # HOD cannot lock staff from a different institution
        if target_staff.institution_id != hod_profile.institution_id:
            return Response(
                {"detail": "You can only manage staff within your institution."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Cannot lock other HODs or admins
        if target_staff.role in ['hod', 'admin']:
            return Response(
                {"detail": "Cannot lock HOD or Admin accounts."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Toggle is_active status
        target_staff.is_active = not target_staff.is_active
        target_staff.save(update_fields=['is_active'])
        
        # If locking, also deactivate the associated user account
        if not target_staff.is_active and target_staff.account:
            target_staff.account.is_active = False
            target_staff.account.save(update_fields=['is_active'])
        elif target_staff.is_active and target_staff.account:
            # If unlocking, reactivate the account
            target_staff.account.is_active = True
            target_staff.account.save(update_fields=['is_active'])
        
        return Response({
            "detail": f"Staff {target_staff.name} has been {'unlocked' if target_staff.is_active else 'locked'}.",
            "faculty_id": target_staff.faculty_id,
            "is_active": target_staff.is_active,
        })

class StudentDetailView(APIView):
    """Get detailed student profile with solved problems breakdown by difficulty."""
    permission_classes = [IsAuthenticated]

    def get(self, request, register_number):
        """Get student details with difficulty-wise breakdown, achievements and contest data."""
        # Check if user is staff (HOD or staff)
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        # Get student
        try:
            student = StudentProfile.objects.select_related(
                'department', 'institution', 'account'
            ).get(register_number=register_number)
        except StudentProfile.DoesNotExist:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Staff can only view students in their institution
        if student.institution != staff_profile.institution:
            return Response(
                {"detail": "You do not have access to this student."},
                status=status.HTTP_403_FORBIDDEN
            )

        # HOD/staff can view students in their department only
        if student.department != staff_profile.department:
            return Response(
                {"detail": "You can only view students in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        # ── Solved problems with difficulty breakdown ─────────────────────────
        solved_problems = SolvedProblem.objects.filter(
            student=student
        ).select_related('problem')

        difficulty_counts = {'Easy': 0, 'Medium': 0, 'Hard': 0}
        difficulty_problems = {'Easy': [], 'Medium': [], 'Hard': []}

        for solved in solved_problems:
            difficulty = solved.problem.difficulty or 'Medium'
            if difficulty in difficulty_counts:
                difficulty_counts[difficulty] += 1
                difficulty_problems[difficulty].append({
                    'id': solved.problem.id,
                    'title': solved.problem.title,
                    'slug': solved.problem.slug,
                    'solved_at': solved.solved_at.isoformat() if solved.solved_at else None,
                })

        total_solved = solved_problems.count()

        # ── Contests the student participated in ──────────────────────────────
        contest_submissions = ContestSubmission.objects.filter(
            student=student
        ).select_related('contest').order_by('-submitted_at')

        # Group by contest to find: participated, won (rank 1)
        contest_map = {}
        for sub in contest_submissions:
            cid = sub.contest_id
            if cid not in contest_map:
                contest_map[cid] = {
                    'id': cid,
                    'title': sub.contest.title if sub.contest else '',
                    'status': sub.contest.status if sub.contest else '',
                    'solved': 0,
                    'score': 0,
                }
            if sub.status == 'Accepted':
                contest_map[cid]['solved'] += 1
                contest_map[cid]['score'] = max(contest_map[cid]['score'], sub.score or 0)

        participated_contests = list(contest_map.values())

        # Find contests where this student was top scorer (rank 1)
        contests_won = []
        for cid, cdata in contest_map.items():
            # Check if this student has highest solved + score in the contest
            top = ContestSubmission.objects.filter(
                contest_id=cid, status='Accepted'
            ).values('student').annotate(
                solved=Count('id'), total_score=Sum('score')
            ).order_by('-solved', '-total_score').first()

            if top and top['student'] == student.id:
                contests_won.append({
                    'id': cid,
                    'title': cdata['title'],
                    'solved': cdata['solved'],
                    'score': cdata['score'],
                })

        # ── Aptitude Insights ──────────────────────────────────────────────────
        aptitude_solved = SolvedAptitude.objects.filter(student=student).count()
        total_aptitude = AptitudeQuestion.objects.count()
        
        # ── Company Insights ──────────────────────────────────────────────────
        company_counts = {}
        for solved in solved_problems:
            companies_str = solved.problem.companies or ""
            if companies_str:
                # Assuming comma-separated or space-separated list of companies
                clist = [c.strip() for c in companies_str.replace(',', ' ').split() if c.strip()]
                for comp in clist:
                    company_counts[comp] = company_counts.get(comp, 0) + 1
        
        sorted_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        company_insights = [{'name': name, 'count': count} for name, count in sorted_companies]

        # ── Project/Skill Insights ─────────────────────────────────────────────
        skill_counts = {}
        project_tags = {'project', 'real-world', 'application', 'system', 'database', 'web', 'api', 'full-stack'}
        for solved in solved_problems:
            tags = solved.problem.tags or []
            for tag in tags:
                tag_lower = tag.lower()
                skill_counts[tag_lower] = skill_counts.get(tag_lower, 0) + 1
        
        # Filter for "project-like" skills
        project_insights = []
        for skill, count in sorted(skill_counts.items(), key=lambda x: x[1], reverse=True):
            if skill in project_tags or any(pt in skill for pt in project_tags):
                project_insights.append({'skill': skill, 'count': count})
        
        project_insights = project_insights[:8]

        # ── Recent submissions ────────────────────────────────────────────────
        recent_submissions_qs = ContestSubmission.objects.filter(
            student=student
        ).select_related('contest', 'problem').order_by('-submitted_at')[:10]

        submissions_data = []
        for sub in recent_submissions_qs:
            submissions_data.append({
                'contest': sub.contest.title if sub.contest else None,
                'problem': sub.problem.title if sub.problem else None,
                'status': sub.status,
                'score': sub.score,
                'submitted_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
            })

        # ── Achievements (computed milestones) ────────────────────────────────
        achievements = []

        solve_milestones = [
            (1, '🎯', 'First Blood', 'Solved your first problem'),
            (5, '🔥', 'Getting Warm', 'Solved 5 problems'),
            (10, '⚡', 'Double Digits', 'Solved 10 problems'),
            (25, '🏅', 'Quarter Century', 'Solved 25 problems'),
            (50, '🥈', 'Halfway Hero', 'Solved 50 problems'),
            (100, '🏆', 'Century Club', 'Solved 100 problems'),
        ]
        for threshold, icon, title, desc in solve_milestones:
            achievements.append({
                'icon': icon, 'title': title, 'description': desc,
                'earned': total_solved >= threshold,
                'type': 'solve',
            })

        streak = student.current_streak or 0
        streak_milestones = [
            (3, '🌱', '3-Day Streak', '3 days in a row'),
            (7, '🔥', 'Week Warrior', '7-day streak'),
            (14, '💎', 'Fortnight Fire', '14-day streak'),
            (30, '👑', 'Month Master', '30-day streak'),
        ]
        for threshold, icon, title, desc in streak_milestones:
            achievements.append({
                'icon': icon, 'title': title, 'description': desc,
                'earned': streak >= threshold,
                'type': 'streak',
            })

        if participated_contests:
            achievements.append({
                'icon': '🎪', 'title': 'Contest Debut',
                'description': 'Participated in a contest', 'earned': True, 'type': 'contest',
            })
        if contests_won:
            achievements.append({
                'icon': '🥇', 'title': 'Contest Champion',
                'description': f'Won {len(contests_won)} contest(s)', 'earned': True, 'type': 'contest',
            })

        # Hard solver achievement
        if difficulty_counts['Hard'] >= 1:
            achievements.append({
                'icon': '🗡️', 'title': 'Hard Hitter',
                'description': f'Solved {difficulty_counts["Hard"]} hard problem(s)',
                'earned': True, 'type': 'difficulty',
            })

        performance_charts = _build_student_performance_charts(student, solved_problems, [])

        return Response({
            'student': {
                'register_number': student.register_number,
                'name': student.name,
                'batch': student.batch,
                'department': student.department.code if student.department else None,
                'department_name': student.department.name if student.department else None,
                'current_streak': student.current_streak,
                'login_days': getattr(student, 'login_days', 0),
                'last_active': student.last_login_on.isoformat() if student.last_login_on else None,
                'is_active': student.account.is_active if student.account else True,
            },
            'analytics': {
                'total_solved': total_solved,
                'difficulty_breakdown': difficulty_counts,
                'problems_by_difficulty': difficulty_problems,
                'recent_submissions': submissions_data,
                'contests_participated': len(participated_contests),
                'contests_won': contests_won,
                'participated_contests': participated_contests,
                'aptitude': {
                    'solved': aptitude_solved,
                    'total': total_aptitude,
                    'percentage': round((aptitude_solved / total_aptitude * 100), 1) if total_aptitude > 0 else 0
                },
                'company_insights': company_insights,
                'project_insights': project_insights,
                **performance_charts,
            },
            'achievements': achievements,
        })

class StudentBlockToggleView(APIView):
    """HOD/Staff can block or unblock students in their department."""
    permission_classes = [IsAuthenticated]

    def post(self, request, register_number):
        """Toggle student account active status (block/unblock)."""
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        # Get target student
        student = StudentProfile.objects.filter(
            register_number=register_number
        ).select_related('account', 'department', 'institution').first()
        if not student:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Can only manage students in same institution
        if student.institution_id != staff_profile.institution_id:
            return Response(
                {"detail": "You can only manage students in your institution."},
                status=status.HTTP_403_FORBIDDEN
            )

        # HOD can only block students in their own department
        if student.department_id != staff_profile.department_id:
            return Response(
                {"detail": "You can only block students in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not student.account:
            return Response(
                {"detail": "Student has no associated account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Toggle is_active on the auth user account
        student.account.is_active = not student.account.is_active
        student.account.save(update_fields=['is_active'])
        is_active = student.account.is_active

        logger.info(
            "Student %s %s by staff %s",
            student.register_number,
            'unblocked' if is_active else 'blocked',
            staff_profile.faculty_id,
        )

        return Response({
            "detail": f"Student {student.name} has been {'unblocked' if is_active else 'blocked'}.",
            "register_number": student.register_number,
            "is_active": is_active,
        })

class StudentCopyPasteToggleView(APIView):
    """HOD/Staff/JA can enable or disable copy-paste for a specific student."""
    permission_classes = [IsAuthenticated]

    def post(self, request, register_number):
        """Toggle student allow_copy_paste permission."""
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        student = StudentProfile.objects.filter(
            register_number=register_number
        ).first()
        if not student:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        if student.institution_id != staff_profile.institution_id:
            return Response(
                {"detail": "You do not have access to this student."},
                status=status.HTTP_403_FORBIDDEN
            )

        if staff_profile.role not in ['hod', 'admin', 'ja', 'tpu', 'director', 'principal'] and student.department_id != staff_profile.department_id:
            return Response(
                {"detail": "You can only manage students in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        if 'allow_copy_paste' in request.data:
            student.allow_copy_paste = bool(request.data['allow_copy_paste'])
        else:
            student.allow_copy_paste = not student.allow_copy_paste

        student.save(update_fields=['allow_copy_paste'])

        logger.info(
            "Student %s copy-paste set to %s by staff %s",
            student.register_number,
            student.allow_copy_paste,
            staff_profile.faculty_id,
        )

        return Response({
            "detail": f"Copy-paste {'enabled' if student.allow_copy_paste else 'disabled'} for {student.name}.",
            "register_number": student.register_number,
            "allow_copy_paste": student.allow_copy_paste,
        })

class StudentIndividualAnalyticsView(APIView):
    """Get detailed analytics for an individual student."""
    permission_classes = [IsAuthenticated]

    def get(self, request, register_number):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        student = StudentProfile.objects.filter(
            register_number=register_number
        ).select_related('department', 'institution').first()

        if not student:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check access
        if student.institution != staff_profile.institution:
            return Response(
                {"detail": "You can only view students in your institution."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get solved problems breakdown by difficulty
        solved_problems = SolvedProblem.objects.filter(
            student=student
        ).select_related('problem')

        difficulty_breakdown = {"Easy": 0, "Medium": 0, "Hard": 0}
        for sp in solved_problems:
            difficulty_breakdown[sp.problem.difficulty] = difficulty_breakdown.get(sp.problem.difficulty, 0) + 1

        # Get recent activity (last 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_activity = []

        recent_solutions = ProblemSolution.objects.filter(
            student=student,
            submitted_at__gte=thirty_days_ago
        ).select_related('problem').order_by('-submitted_at')[:20]

        for solution in recent_solutions:
            recent_activity.append({
                "date": solution.submitted_at.isoformat(),
                "problem": solution.problem.title,
                "problem_slug": solution.problem.slug,
                "difficulty": solution.problem.difficulty,
                "status": solution.status,
                "language": solution.language,
            })

        # Calculate total time spent
        total_time_spent = ProblemSession.objects.filter(
            student=student,
            is_active=False
        ).aggregate(total=Sum('time_spent_seconds'))['total'] or 0

        # Get contest participation
        contest_participations = ContestSubmission.objects.filter(
            student=student
        ).values('contest__title', 'contest__id').annotate(
            submissions=Count('id'),
            solved=Count('id', filter=Q(status='Accepted'))
        ).order_by('-contest__id')[:10]

        # ── Aptitude Insights ──────────────────────────────────────────────────
        aptitude_solved = SolvedAptitude.objects.filter(student=student).count()
        total_aptitude = AptitudeQuestion.objects.count()
        
        # ── Company & Project Insights ────────────────────────────────────────
        company_insights, project_insights = _compute_skill_insights(solved_problems)

        # ── Score History (from ContestParticipation) ─────────────────────────
        cp_qs = ContestParticipation.objects.filter(
            student=student, is_active=False
        ).select_related('contest').order_by('started_at')[:25]

        score_history = []
        for cp in cp_qs:
            contest = cp.contest
            if contest.contest_type == 'aptitude':
                total_q = contest.aptitude_questions.count()
                correct_q = AptitudeContestSubmission.objects.filter(
                    contest=contest, student=student, is_correct=True
                ).count()
                score_pct = round(correct_q / max(1, total_q) * 100, 1)
            else:
                total_p = contest.problems.count()
                score_pct = round(cp.problems_solved / max(1, total_p) * 100, 1)
            score_history.append({
                'label': contest.title[:18],
                'title': contest.title,
                'score_pct': score_pct,
                'date': cp.started_at.strftime('%Y-%m-%d'),
                'contest_type': contest.contest_type,
            })

        tests_completed = len(score_history)
        avg_score = round(sum(s['score_pct'] for s in score_history) / tests_completed, 2) if tests_completed else 0
        peak_score = max((s['score_pct'] for s in score_history), default=0)

        # ── Topic Accuracy (from AptitudeContestSubmission by topic) ──────────
        try:
            topic_acc_qs = AptitudeContestSubmission.objects.filter(
                student=student
            ).select_related('question__topic__parent').values(
                'question__topic__title', 'question__topic__parent__title'
            ).annotate(
                total=Count('id'),
                correct=Count('id', filter=Q(is_correct=True))
            ).order_by('-total')[:20]

            topic_accuracy = [
                {
                    'topic': t['question__topic__title'],
                    'category': t['question__topic__parent__title'] or t['question__topic__title'],
                    'accuracy': round(t['correct'] / t['total'] * 100, 1) if t['total'] else 0,
                    'total': t['total'],
                    'correct': t['correct'],
                }
                for t in topic_acc_qs
            ]
        except Exception:
            logger.exception("Failed to compute topic_accuracy for student %s (individual analytics)", register_number)
            topic_accuracy = []

        performance_charts = _build_student_performance_charts(student, solved_problems, topic_accuracy)

        try:
            return Response({
                "student": {
                    "register_number": student.register_number,
                    "name": student.name,
                    "batch": student.batch,
                    "department": student.department.name if student.department else None,
                    "current_streak": student.current_streak,
                "login_days": student.login_days,
                "campus_rank": f"#{calculate_campus_rank_helper(student)}",
            },
            "analytics": {
                "solved_count": solved_problems.count(),
                "difficulty_breakdown": difficulty_breakdown,
                "recent_activity": recent_activity,
                "time_spent_total": total_time_spent,
                "time_spent_hours": round(total_time_spent / 3600, 2),
                "contest_participations": list(contest_participations),
                "aptitude": {
                    "solved": aptitude_solved,
                    "total": total_aptitude,
                    "percentage": round((aptitude_solved / total_aptitude * 100), 1) if total_aptitude > 0 else 0
                },
                "company_insights": company_insights,
                "project_insights": project_insights,
                "score_history": score_history,
                "topic_accuracy": topic_accuracy,
                "tests_completed": tests_completed,
                "avg_score": avg_score,
                "peak_score": peak_score,
                **performance_charts,
            }
        })
        except Exception:
            logger.exception("Failed to build analytics response for student %s", register_number)
            return Response(
                {"detail": "Failed to load analytics. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

class StaffDeptListView(UnifiedAuthMixin, APIView):
    """Returns staff from the same department as the student for DM list."""
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
        if profile_type == "student":
            staff_qs = StaffProfile.objects.filter(department=profile.department)
        else:
            staff_qs = StaffProfile.objects.filter(institution=profile.institution)
        
        data = []
        for s in staff_qs:
            data.append({
                "faculty_id": s.faculty_id,
                "name": s.name,
                "email": s.email,
                "role": s.get_role_display(),
                "department": s.department.name if s.department else ""
            })
        return Response(data)

class StaffMentorDashboardView(APIView):
    """
    Staff: get their mentees list with stats.
    GET /api/staff/mentor/dashboard/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _staff_guard(request)
        if err:
            return err

        mentees = (
            StudentProfile.objects
            .filter(mentor=profile)
            .select_related('account', 'department')
            .order_by('batch', 'register_number')
        )

        mentees = mentees.annotate(solved_count=Count('solved_problems', distinct=True))

        mentee_data = []
        for s in mentees:
            mentee_data.append({
                "id": s.id,
                "register_number": s.register_number,
                "name": s.name,
                "batch": s.batch,
                "section": s.section,
                "department": s.department.name if s.department else "",
                "personal_email": s.personal_email,
                "mobile_number": s.mobile_number,
                "gender": s.gender,
                "current_streak": s.current_streak,
                "login_days": s.login_days,
                "last_active": s.last_login_on.isoformat() if s.last_login_on else None,
                "solved_count": s.solved_count,
                "is_active": s.account.is_active if s.account else True,
            })

        # Group by batch
        batch_groups = {}
        for m in mentee_data:
            b = m['batch'] or 'Unknown'
            if b not in batch_groups:
                batch_groups[b] = []
            batch_groups[b].append(m)

        return Response({
            "mentor": {
                "id": profile.id,
                "faculty_id": profile.faculty_id,
                "name": profile.name,
                "role": profile.role,
                "department": profile.department.name if profile.department else "",
            },
            "total_mentees": len(mentee_data),
            "mentees": mentee_data,
            "batch_groups": [
                {"batch": b, "students": students}
                for b, students in sorted(batch_groups.items(), reverse=True)
            ],
        })

class StaffClassAdvisorDashboardView(APIView):
    """
    Staff: get all data for batches where they are the class advisor.
    GET /api/staff/advisor/dashboard/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _staff_guard(request)
        if err:
            return err

        # Find all batches where this staff is the advisor
        advisor_assignments = BatchAdvisor.objects.filter(advisor=profile).select_related('department')

        if not advisor_assignments.exists():
            return Response({
                "advisor": {
                    "id": profile.id,
                    "name": profile.name,
                    "faculty_id": profile.faculty_id,
                },
                "is_class_advisor": False,
                "batches": [],
            })

        batches_data = []
        for assignment in advisor_assignments:
            qs = StudentProfile.objects.filter(
                department=assignment.department,
                batch=assignment.batch,
            )
            if assignment.section:
                qs = qs.filter(section=assignment.section)
            students = qs.select_related('account', 'mentor').order_by('register_number')

            student_list = []
            for s in students:
                from ...models import SolvedProblem
                solved_count = SolvedProblem.objects.filter(student=s).count()
                student_list.append({
                    "id": s.id,
                    "register_number": s.register_number,
                    "name": s.name,
                    "batch": s.batch,
                    "section": s.section,
                    "personal_email": s.personal_email,
                    "mobile_number": s.mobile_number,
                    "gender": s.gender,
                    "current_streak": s.current_streak,
                    "login_days": s.login_days,
                    "last_active": s.last_login_on.isoformat() if s.last_login_on else None,
                    "solved_count": solved_count,
                    "is_active": s.account.is_active if s.account else True,
                    "mentor": {
                        "id": s.mentor.id,
                        "name": s.mentor.name,
                        "faculty_id": s.mentor.faculty_id,
                    } if s.mentor else None,
                })

            # Batch-level stats
            total = len(student_list)
            active = sum(1 for s in student_list if s['is_active'])
            avg_solved = (sum(s['solved_count'] for s in student_list) / total) if total else 0
            avg_streak = (sum(s['current_streak'] for s in student_list) / total) if total else 0

            batches_data.append({
                "batch": assignment.batch,
                "section": assignment.section,
                "department": assignment.department.name,
                "department_code": assignment.department.code,
                "total_students": total,
                "active_students": active,
                "avg_solved": round(avg_solved, 1),
                "avg_streak": round(avg_streak, 1),
                "students": student_list,
            })

        return Response({
            "advisor": {
                "id": profile.id,
                "name": profile.name,
                "faculty_id": profile.faculty_id,
                "role": profile.role,
            },
            "is_class_advisor": True,
            "batches": batches_data,
        })

class StaffExerciseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_ex(self, lab_id, exercise_id, staff):
        try:
            return LabExercise.objects.get(
                id=exercise_id, lab_id=lab_id, lab__staff_in_charge=staff
            )
        except LabExercise.DoesNotExist:
            return None

    def put(self, request, lab_id, exercise_id):
        staff = _staff_from_request(request)
        ex = self._get_ex(lab_id, exercise_id, staff)
        if not ex:
            return Response({"error": "Not found"}, status=404)
        for field in ("title", "description", "order", "difficulty"):
            if field in request.data:
                setattr(ex, field, request.data[field])
        ex.save()
        return Response(_serialize_exercise(ex))

    def delete(self, request, lab_id, exercise_id):
        staff = _staff_from_request(request)
        ex = self._get_ex(lab_id, exercise_id, staff)
        if not ex:
            return Response({"error": "Not found"}, status=404)
        ex.delete()
        return Response(status=204)

class StaffExerciseTestCasesView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_ex(self, lab_id, exercise_id, staff):
        try:
            return LabExercise.objects.get(
                id=exercise_id, lab_id=lab_id, lab__staff_in_charge=staff
            )
        except LabExercise.DoesNotExist:
            return None

    def get(self, request, lab_id, exercise_id):
        staff = _staff_from_request(request)
        ex = self._get_ex(lab_id, exercise_id, staff)
        if not ex:
            return Response({"error": "Not found"}, status=404)
        cases = ex.test_cases.all().order_by("order", "id")
        return Response({"test_cases": [_serialize_test_case(tc) for tc in cases]})

    def post(self, request, lab_id, exercise_id):
        staff = _staff_from_request(request)
        ex = self._get_ex(lab_id, exercise_id, staff)
        if not ex:
            return Response({"error": "Not found"}, status=404)

        expected_output = str(request.data.get("expected_output", "")).strip()
        if not expected_output:
            return Response({"error": "Expected output is required"}, status=400)

        order = request.data.get("order")
        if order is None:
            order = ex.test_cases.count()
        else:
            order = _nonnegative_int(order, ex.test_cases.count())
        tc = LabExerciseTestCase.objects.create(
            exercise=ex,
            stdin=str(request.data.get("stdin", "")).strip(),
            expected_output=expected_output,
            is_sample=bool(request.data.get("is_sample")),
            order=order,
        )
        return Response(_serialize_test_case(tc), status=201)

class StaffExerciseTestCaseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_tc(self, lab_id, exercise_id, test_case_id, staff):
        try:
            return LabExerciseTestCase.objects.get(
                id=test_case_id,
                exercise_id=exercise_id,
                exercise__lab_id=lab_id,
                exercise__lab__staff_in_charge=staff,
            )
        except LabExerciseTestCase.DoesNotExist:
            return None

    def put(self, request, lab_id, exercise_id, test_case_id):
        staff = _staff_from_request(request)
        tc = self._get_tc(lab_id, exercise_id, test_case_id, staff)
        if not tc:
            return Response({"error": "Not found"}, status=404)

        if "stdin" in request.data:
            tc.stdin = str(request.data.get("stdin", "")).strip()
        if "expected_output" in request.data:
            expected_output = str(request.data.get("expected_output", "")).strip()
            if not expected_output:
                return Response({"error": "Expected output is required"}, status=400)
            tc.expected_output = expected_output
        if "is_sample" in request.data:
            tc.is_sample = bool(request.data.get("is_sample"))
        if "order" in request.data:
            tc.order = _nonnegative_int(request.data.get("order"), tc.order)

        tc.save(update_fields=["stdin", "expected_output", "is_sample", "order"])
        return Response(_serialize_test_case(tc))

    def delete(self, request, lab_id, exercise_id, test_case_id):
        staff = _staff_from_request(request)
        tc = self._get_tc(lab_id, exercise_id, test_case_id, staff)
        if not tc:
            return Response({"error": "Not found"}, status=404)
        tc.delete()
        return Response(status=204)

class StaffExerciseGenerateTestCasesView(APIView):
    """Manual 'Generate' trigger — staff clicks this when adding/editing an
    exercise to (re)generate its test cases via the LLM fallback chain."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id, exercise_id):
        staff = _staff_from_request(request)
        try:
            ex = LabExercise.objects.get(id=exercise_id, lab_id=lab_id, lab__staff_in_charge=staff)
        except LabExercise.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        from ...services.testcase_generator import TestCaseGenError

        try:
            count = _auto_generate_lab_test_cases(ex, raise_on_error=True, replace_existing=True)
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        return Response({
            "generated_count": count,
            "test_cases": [_serialize_test_case(tc) for tc in ex.test_cases.all().order_by("order")],
            "description": ex.description,
        })

class StaffExerciseGenerateExplanationView(APIView):
    """Manual 'Generate' trigger for a lab exercise's brief explanation —
    a separate endpoint from test-case generation so the staff panel can
    fire both concurrently instead of waiting on one before the other."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id, exercise_id):
        staff = _staff_from_request(request)
        try:
            ex = LabExercise.objects.get(id=exercise_id, lab_id=lab_id, lab__staff_in_charge=staff)
        except LabExercise.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        from ...services.testcase_generator import generate_explanation, TestCaseGenError
        try:
            parsed = _parse_lab_description(ex.description)
            clean_description = _compile_lab_description({**parsed, "examples": []})
            explanation = generate_explanation(title=ex.title, description=clean_description)
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        ex.explanation = explanation
        ex.save(update_fields=["explanation"])
        return Response({"explanation": ex.explanation})

