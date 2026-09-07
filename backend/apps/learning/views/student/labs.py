"""Views extracted from the original monolithic apps/learning/views.py
(module: student/labs). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class LabTopicListView(APIView):
    """GET /api/lab/topics/ — list all active topics with problem counts."""
    permission_classes = [AllowAny]

    def get(self, request):
        topics = LabTopic.objects.filter(is_active=True).prefetch_related("problems")
        data = []
        for t in topics:
            active = t.problems.filter(is_active=True)
            counts = {"Easy": 0, "Medium": 0, "Hard": 0}
            for p in active:
                counts[p.difficulty] = counts.get(p.difficulty, 0) + 1
            data.append({
                "id":          t.id,
                "name":        t.name,
                "slug":        t.slug,
                "description": t.description,
                "icon":        t.icon,
                "order":       t.order,
                "total":       active.count(),
                "easy":        counts["Easy"],
                "medium":      counts["Medium"],
                "hard":        counts["Hard"],
            })
        return Response(data)

class LabProblemListView(APIView):
    """GET /api/lab/topics/<slug>/problems/ — problems in a topic."""
    permission_classes = [AllowAny]

    def get(self, request, topic_slug):
        try:
            topic = LabTopic.objects.get(slug=topic_slug, is_active=True)
        except LabTopic.DoesNotExist:
            return Response({"error": "Topic not found"}, status=status.HTTP_404_NOT_FOUND)

        problems = LabProblem.objects.filter(topic=topic, is_active=True)

        # Attach solved status if authenticated
        student = None
        if hasattr(request.user, "student_profile"):
            try:
                student = request.user.student_profile
            except Exception:
                pass

        solved_slugs = set()
        if student:
            solved_slugs = set(
                LabSubmission.objects.filter(
                    student=student, problem__topic=topic, all_passed=True
                ).values_list("problem__slug", flat=True)
            )

        data = []
        for p in problems:
            data.append({
                "slug":        p.slug,
                "title":       p.title,
                "difficulty":  p.difficulty,
                "tags":        p.tags,
                "order":       p.order,
                "solved":      p.slug in solved_slugs,
            })
        return Response({"topic": {"name": topic.name, "slug": topic.slug, "icon": topic.icon}, "problems": data})

class LabProblemDetailView(APIView):
    """GET /api/lab/problems/<slug>/ — full problem with sample test cases."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        try:
            problem = LabProblem.objects.select_related("topic").prefetch_related("test_cases").get(
                slug=slug, is_active=True
            )
        except LabProblem.DoesNotExist:
            return Response({"error": "Problem not found"}, status=status.HTTP_404_NOT_FOUND)

        sample_cases = [
            {"stdin": tc.stdin, "expected_output": tc.expected_output, "order": tc.order}
            for tc in problem.test_cases.filter(is_sample=True)
        ]

        return Response({
            "slug":           problem.slug,
            "title":          problem.title,
            "description":    problem.description,
            "difficulty":     problem.difficulty,
            "tags":           problem.tags,
            "examples":       problem.examples,
            "hints":          problem.hints,
            "editorial":      problem.editorial,
            "execution_type": problem.execution_type,
            "function_name":  problem.function_name,
            "sample_cases":   sample_cases,
            "topic": {
                "name": problem.topic.name,
                "slug": problem.topic.slug,
            },
        })

class LabSubmitView(APIView):
    """POST /api/lab/problems/<slug>/submit/ — run all test cases and record result."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        from ...services.judge0 import Judge0Error
        from ...services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID

        try:
            problem = LabProblem.objects.prefetch_related("test_cases").get(slug=slug, is_active=True)
        except LabProblem.DoesNotExist:
            return Response({"error": "Problem not found"}, status=status.HTTP_404_NOT_FOUND)

        source_code = request.data.get("source_code", "").strip()
        language_id = request.data.get("language_id")
        language    = request.data.get("language", "")

        if not source_code:
            return Response({"error": "Source code is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not language_id:
            return Response({"error": "language_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            language_id = int(language_id)
        except (TypeError, ValueError):
            return Response({"error": "Invalid language_id"}, status=status.HTTP_400_BAD_REQUEST)

        language_name = LANGUAGE_NAME_BY_ID.get(language_id)
        if not language_name:
            return Response({"error": f"Unsupported language_id: {language_id}"}, status=status.HTTP_400_BAD_REQUEST)

        is_valid, validation_error = validate_submission(language or "", source_code, "")
        if not is_valid:
            return Response({"error": f"Code validation failed: {validation_error}"}, status=status.HTTP_400_BAD_REQUEST)

        # Get student
        try:
            student = request.user.student_profile
        except Exception:
            return Response({"error": "Student profile not found"}, status=status.HTTP_403_FORBIDDEN)

        test_cases = list(problem.test_cases.all())
        if not test_cases:
            return Response({"error": "No test cases configured for this problem"}, status=status.HTTP_400_BAD_REQUEST)

        results = []
        passed  = 0
        service = Judge0Service()

        for tc in test_cases:
            try:
                payload = prepare_execution_payload(
                    problem=problem,
                    source_code=source_code,
                    language=language,
                    stdin=tc.stdin,
                )
                exec_result = service.execute_single(
                    source_code=payload["source_code"],
                    language_name=language_name,
                    stdin=payload.get("stdin", tc.stdin),
                )
                actual   = (exec_result.get("stdout") or "").strip()
                expected = tc.expected_output.strip()
                ok = actual == expected
                if ok:
                    passed += 1
                results.append({
                    "stdin":           tc.stdin,
                    "expected_output": expected,
                    "actual_output":   actual,
                    "passed":          ok,
                    "stderr":          exec_result.get("stderr", ""),
                    "status":          exec_result.get("status", ""),
                    "is_sample":       tc.is_sample,
                })
            except Judge0Error as exc:
                results.append({
                    "stdin":           tc.stdin,
                    "expected_output": tc.expected_output.strip(),
                    "actual_output":   "",
                    "passed":          False,
                    "stderr":          str(exc),
                    "status":          "Error",
                    "is_sample":       tc.is_sample,
                })

        all_passed = passed == len(test_cases)
        sub_status = "Accepted" if all_passed else "Wrong Answer"

        LabSubmission.objects.create(
            student=student,
            problem=problem,
            language=language,
            language_id=language_id,
            source_code=source_code,
            status=sub_status,
            passed_cases=passed,
            total_cases=len(test_cases),
            all_passed=all_passed,
        )

        return Response({
            "status":       sub_status,
            "passed":       passed,
            "total":        len(test_cases),
            "all_passed":   all_passed,
            "results":      results,
        })

class StudentLabAssignmentsView(APIView):
    """Student: list practical lab assignments for their batch/year/section."""

    def get(self, request):
        student = _student_from_request(request)
        if not student:
            return Response({"error": "Student access required"}, status=403)

        qs = LabAssignment.objects.filter(
            department=student.department, is_active=True
        ).select_related("lab_topic", "assigned_staff")

        if student.batch:
            qs = qs.filter(Q(batch="") | Q(batch=student.batch))
        if student.section:
            qs = qs.filter(Q(section="") | Q(section__iexact=student.section))

        return Response([_serialize_assignment(a, student) for a in qs.order_by("deadline")])

class LabAssignmentSubmitView(APIView):
    """Student: submit solution for a problem inside a LabAssignment."""

    def post(self, request, assignment_id, slug):
        student = _student_from_request(request)
        if not student:
            return Response({"error": "Student access required"}, status=403)

        try:
            assignment = LabAssignment.objects.get(id=assignment_id, is_active=True)
        except LabAssignment.DoesNotExist:
            return Response({"error": "Assignment not found"}, status=404)

        if assignment.is_expired:
            return Response({"error": "This lab assignment has expired"}, status=400)

        try:
            problem = LabProblem.objects.prefetch_related("test_cases").get(
                slug=slug, topic=assignment.lab_topic, is_active=True
            )
        except LabProblem.DoesNotExist:
            return Response({"error": "Problem not found in this assignment"}, status=404)

        source_code = request.data.get("source_code", "").strip()
        language_id = request.data.get("language_id")
        language    = request.data.get("language", "")

        if not source_code or not language_id:
            return Response({"error": "source_code and language_id are required"}, status=400)

        try:
            language_id = int(language_id)
        except (TypeError, ValueError):
            return Response({"error": "Invalid language_id"}, status=400)

        from ...services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID

        language_name = LANGUAGE_NAME_BY_ID.get(language_id)
        if not language_name:
            return Response({"error": f"Unsupported language_id: {language_id}"}, status=400)

        is_valid, validation_error = validate_submission(language or "", source_code, "")
        if not is_valid:
            return Response({"error": f"Code validation failed: {validation_error}"}, status=400)

        test_cases = list(problem.test_cases.all())
        if not test_cases:
            return Response({"error": "No test cases configured"}, status=400)

        results   = []
        passed    = 0
        final_out = ""

        # LabProblem (unlike LabExercise) is function/class-signature based,
        # so each test case still needs its own prepare_execution_payload()
        # driver-injection pass before batching — the actual Judge0 calls
        # are then one batch_execute() (create + poll) instead of N
        # sequential wait=true requests.
        submissions = []
        for tc in test_cases:
            payload = prepare_execution_payload(
                source_code=source_code,
                language_id=language_id,
                stdin=tc.stdin,
                problem_slug=problem.slug,
                execution_type=problem.execution_type,
                function_name=problem.function_name,
            )
            submissions.append({
                "source_code": payload["source_code"], "language_name": language_name,
                "stdin": payload.get("stdin", tc.stdin),
            })

        try:
            run_results = Judge0Service().batch_execute(submissions)
        except Judge0TimeoutError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Judge0ServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        for tc, exec_result in zip(test_cases, run_results):
            actual   = (exec_result.get("stdout") or "").strip()
            expected = tc.expected_output.strip()
            ok = actual == expected
            if ok:
                passed += 1
            if tc.is_sample:
                final_out = actual
            results.append({
                "stdin":           tc.stdin,
                "expected_output": expected,
                "actual_output":   actual,
                "passed":          ok,
                "stderr":          exec_result.get("stderr", ""),
                "status":          exec_result.get("status", ""),
                "is_sample":       tc.is_sample,
            })

        all_passed  = passed == len(test_cases)
        sub_status  = "Accepted" if all_passed else "Wrong Answer"
        full_output = "\n".join(r["actual_output"] for r in results if r["actual_output"])

        LabAssignmentSubmission.objects.update_or_create(
            assignment=assignment,
            student=student,
            problem=problem,
            defaults={
                "language":    language,
                "language_id": language_id,
                "source_code": source_code,
                "output":      full_output or final_out,
                "status":      sub_status,
                "passed_cases": passed,
                "total_cases":  len(test_cases),
                "all_passed":   all_passed,
            },
        )

        return Response({
            "status":     sub_status,
            "passed":     passed,
            "total":      len(test_cases),
            "all_passed": all_passed,
            "results":    results,
            "output":     full_output or final_out,
        })

class StudentLabListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        student = _student_from_request(request)
        labs = Lab.objects.filter(
            department=student.department, batch=student.batch, is_active=True, is_published=True
        )
        if student.section:
            labs = labs.filter(Q(section="") | Q(section=student.section))
        labs = labs.select_related("staff_in_charge").prefetch_related("exercises")
        return Response([_serialize_lab_v2(lab, student=student) for lab in labs])

class StudentLabExercisesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lab_id):
        student = _student_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, department=student.department, batch=student.batch, is_active=True, is_published=True)
        except Lab.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if lab.is_expired:
            return Response({
                "lab": _serialize_lab_v2(lab, student=student),
                "is_expired": True,
                "error": "This lab has expired and can no longer be accessed.",
                "exercises": [],
            })

        session, created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        if created and lab.lab_type == "university":
            session.is_locked = True
            session.lock_reason = "Lab session is locked by staff. Awaiting staff unlock for your batch."
            session.save(update_fields=["is_locked", "lock_reason"])

        if session.is_locked:
            return Response({
                "lab": _serialize_lab_v2(lab, student=student),
                "is_locked": True,
                "lock_reason": session.lock_reason or "Lab session is locked by staff. Awaiting staff unlock for your batch.",
                "exercises": [],
            })

        # Randomized per-student question allocation (1-2 exercises out of the full
        # pool) is a University Practical Lab exam feature only — regular practical
        # / company labs must always show every exercise staff added.
        if lab.lab_type == "university":
            if not session.allocated_exercises.exists():
                from ...services.lab_allocation import allocate_lab_questions_for_students
                allocate_lab_questions_for_students(lab)
                session.refresh_from_db()

            exercises = session.allocated_exercises.all() if session.allocated_exercises.exists() else lab.exercises.all()
        else:
            exercises = lab.exercises.all()

        sub_map = {
            s.exercise_id: s
            for s in LabExerciseSubmission.objects.filter(exercise__in=exercises, student=student)
        }
        ex_data = []
        for ex in exercises:
            sub = sub_map.get(ex.id)
            ex_data.append({
                "id": ex.id,
                "title": ex.title,
                "description": ex.description,
                "explanation": ex.explanation,
                "difficulty": ex.difficulty,
                "order": ex.order,
                "submitted": sub is not None,
                "submitted_at": sub.submitted_at.isoformat() if sub else None,
                "code": sub.code if sub else "",
                "language": sub.language if sub else "",
            })
        return Response({"lab": _serialize_lab_v2(lab, student=student), "exercises": ex_data})

class StudentLabFullReportView(APIView):
    """Student: Bulk full report download is disabled. Only individual question downloads are enabled."""
    permission_classes = [IsAuthenticated]

    def get(self, request, lab_id):
        return Response({"error": "Bulk lab report download has been disabled. Please download individual question reports."}, status=400)

class StudentLabViolationView(APIView):
    """Student: Record security violation (tab switch or fullscreen exit) for a Lab."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id):
        student = _student_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, department=student.department, batch=student.batch)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        action = request.data.get("action", "tab_switch")
        reason = request.data.get("reason", "Tab switch detected")

        if action == "fullscreen_exit" and lab.enable_fullscreen_lock:
            session.is_locked = True
            session.lock_reason = "Fullscreen exit detected during University Lab session"
            session.locked_at = timezone.now()
        else:
            session.tab_switch_count += 1
            if lab.enable_tab_switch_check and session.tab_switch_count >= lab.max_tab_switches:
                session.is_locked = True
                session.lock_reason = f"Exceeded tab switch limit ({session.tab_switch_count}/{lab.max_tab_switches})"
                session.locked_at = timezone.now()

        session.save()
        return Response({
            "is_locked": session.is_locked,
            "tab_switch_count": session.tab_switch_count,
            "lock_reason": session.lock_reason,
            "max_tab_switches": lab.max_tab_switches,
        })

