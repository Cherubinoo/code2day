"""Views extracted from the original monolithic apps/learning/views.py
(module: staff/labs). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class StaffLabAssignmentView(APIView):
    """Staff: list lab assignments assigned to this staff member."""

    def get(self, request):
        staff = _staff_from_request(request)
        if not staff:
            return Response({"error": "Staff access required"}, status=403)

        assignments = LabAssignment.objects.filter(
            assigned_staff=staff, is_active=True
        ).select_related("lab_topic", "created_by").order_by("-created_at")

        return Response([_serialize_assignment(a) for a in assignments])

class StaffLabSubmissionsView(APIView):
    """Staff: class-wise submission status for a specific lab assignment."""

    def get(self, request, assignment_id):
        staff = _staff_from_request(request)
        if not staff:
            return Response({"error": "Staff access required"}, status=403)

        try:
            assignment = LabAssignment.objects.select_related("lab_topic", "department").get(
                id=assignment_id, assigned_staff=staff
            )
        except LabAssignment.DoesNotExist:
            return Response({"error": "Assignment not found or not assigned to you"}, status=404)

        problems = list(assignment.lab_topic.problems.filter(is_active=True).order_by("order"))

        # Students in this assignment's batch/section
        stu_qs = StudentProfile.objects.filter(department=assignment.department)
        if assignment.batch:
            stu_qs = stu_qs.filter(batch=assignment.batch)
        if assignment.section:
            stu_qs = stu_qs.filter(section__iexact=assignment.section)

        students = stu_qs.select_related("account").order_by("name")

        # All submissions for this assignment
        subs = {
            (s.student_id, s.problem_id): s
            for s in LabAssignmentSubmission.objects.filter(assignment=assignment)
        }

        rows = []
        for stu in students:
            solved = []
            for prob in problems:
                sub = subs.get((stu.id, prob.id))
                solved.append({
                    "slug":       prob.slug,
                    "title":      prob.title,
                    "passed":     sub.all_passed if sub else False,
                    "language":   sub.language if sub else None,
                    "submitted_at": sub.submitted_at.isoformat() if sub else None,
                })
            total   = len(problems)
            done    = sum(1 for s in solved if s["passed"])
            rows.append({
                "student_name":     stu.name,
                "register_number":  stu.register_number,
                "email":            stu.account.email if stu.account else "",
                "section":          stu.section,
                "problems":         solved,
                "completed":        done,
                "total":            total,
                "all_complete":     done == total,
            })

        return Response({
            "assignment": _serialize_assignment(assignment),
            "problems":   [{"slug": p.slug, "title": p.title} for p in problems],
            "students":   rows,
        })

class StaffLabListView(APIView):
    """"My Practicals": labs THIS staff member is actually working on — not
    every lab they merely set up for someone else. An HOD/Academic
    Coordinator creates every lab in the department from Lab Center
    (created_by=them) but hands most of them off to a `staff_in_charge`;
    those belong on that staff member's own list, not the creator's, or an
    HOD would see the whole department's labs here instead of just theirs.
    `created_by` only counts when nobody else has been staffed onto it yet
    (a plain staff member's own self-authored lab, staff_in_charge unset)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = _staff_from_request(request)
        labs = Lab.objects.filter(
            Q(staff_in_charge=staff) | Q(created_by=staff, staff_in_charge__isnull=True)
        ).distinct().select_related("created_by").prefetch_related("exercises")
        return Response([_serialize_lab_v2(lab) for lab in labs])

    def post(self, request):
        staff = _staff_from_request(request)
        data = request.data
        start = _parse_dt(data.get("start_date"))
        end = _parse_dt(data.get("end_date"))
        if not start or not end:
            return Response({"error": "Valid start_date and end_date are required"}, status=400)

        allowed_languages = data.get("allowed_languages", list(LAB_LANGUAGE_CHOICES))
        lab_type = data.get("lab_type", "practical")
        approval_status = "pending_approval" if (lab_type == "university" and not getattr(staff, "is_hod", False)) else "approved"
        linked_lab = None
        linked_lab_id = data.get("linked_lab_id")
        if linked_lab_id:
            try:
                linked_lab = Lab.objects.get(id=linked_lab_id, department=staff.department)
            except Lab.DoesNotExist:
                pass

        is_univ = (lab_type == "university")
        try:
            pass_threshold_percent = max(1, min(100, int(data.get("pass_threshold_percent", 70))))
        except (TypeError, ValueError):
            pass_threshold_percent = 70
        lab = Lab.objects.create(
            name=data["name"],
            department=staff.department,
            batch=data.get("batch", ""),
            section=data.get("section", ""),
            start_date=start,
            end_date=end,
            staff_in_charge=staff,
            created_by=staff,
            lab_type=lab_type,
            approval_status=approval_status,
            is_published=False if lab_type == "university" else True,
            enable_tab_switch_check=bool(data.get("enable_tab_switch_check", False)) if is_univ else False,
            max_tab_switches=int(data.get("max_tab_switches", 3)) if is_univ else 3,
            enable_fullscreen_lock=bool(data.get("enable_fullscreen_lock", False)) if is_univ else False,
            enable_copy_paste_lock=bool(data.get("enable_copy_paste_lock", False)) if is_univ else False,
            pass_threshold_percent=pass_threshold_percent,
            allowed_languages=allowed_languages,
            linked_lab=linked_lab,
        )
        lab.refresh_from_db()
        return Response(_serialize_lab_v2(lab), status=201)

class StaffLabExercisesView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_lab(self, lab_id, staff):
        try:
            return Lab.objects.get(id=lab_id, staff_in_charge=staff)
        except Lab.DoesNotExist:
            return None

    def get(self, request, lab_id):
        staff = _staff_from_request(request)
        lab = self._get_lab(lab_id, staff)
        if not lab:
            return Response({"error": "Not found"}, status=404)
        exercises = lab.exercises.select_related("added_by").annotate(
            submission_count=Count("submissions", distinct=True),
            test_case_count=Count("test_cases", distinct=True),
        )
        return Response({
            "lab": _serialize_lab_v2(lab),
            "exercises": [_serialize_exercise(e) for e in exercises],
        })

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        lab = self._get_lab(lab_id, staff)
        if not lab:
            return Response({"error": "Not found"}, status=404)
        data = request.data
        exercise = LabExercise.objects.create(
            lab=lab,
            title=data["title"],
            description=data.get("description", ""),
            order=data.get("order", lab.exercises.count()),
            added_by=staff,
            difficulty=data.get("difficulty", "Medium"),
        )
        # Test cases (and the explanation) are always a separate, explicit
        # step via the Generate buttons — never triggered automatically on
        # create, same as the Problem bank.
        return Response(_serialize_exercise(exercise), status=201)

class StaffLabExercisesBulkView(APIView):
    """Bulk-create exercises for a Lab from a staff-uploaded CSV template."""
    permission_classes = [IsAuthenticated]

    def _get_lab(self, lab_id, staff):
        try:
            return Lab.objects.get(id=lab_id, staff_in_charge=staff)
        except Lab.DoesNotExist:
            return None

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        lab = self._get_lab(lab_id, staff)
        if not lab:
            return Response({"error": "Not found"}, status=404)

        rows = request.data.get("exercises") or []
        tc_rows = request.data.get("test_cases") or []
        if not isinstance(rows, list) or not isinstance(tc_rows, list):
            return Response({"error": "exercises and test_cases must be lists"}, status=400)
        if not rows and not tc_rows:
            return Response({"error": "No exercises or test cases provided"}, status=400)
        if len(rows) > 500:
            return Response({"error": "Cannot import more than 500 exercises at once"}, status=400)
        if len(tc_rows) > 2000:
            return Response({"error": "Cannot import more than 2000 test cases at once"}, status=400)

        errors = []
        to_create = []
        next_order = lab.exercises.count()
        for idx, row in enumerate(rows):
            title = (row.get("title") or "").strip()
            if not title:
                errors.append({"row": idx + 1, "error": "Title is required"})
                continue
            to_create.append(LabExercise(
                lab=lab,
                title=title[:200],
                description=row.get("description") or "",
                order=row.get("order") if isinstance(row.get("order"), int) else next_order,
                added_by=staff,
            ))
            next_order += 1

        if rows and not to_create:
            return Response({"error": "No valid exercises to import", "errors": errors}, status=400)

        with transaction.atomic():
            created = LabExercise.objects.bulk_create(to_create) if to_create else []

        # Match test-case rows to exercises by title — against both the exercises
        # just created above and any pre-existing exercises in this lab, so staff
        # can also import test cases for questions that were added earlier.
        tc_errors = []
        tc_created_count = 0
        if tc_rows:
            title_map = {}
            for ex in lab.exercises.all():
                title_map.setdefault(ex.title.strip().lower(), ex)

            tc_to_create = []
            next_order_by_exercise = {}
            for idx, row in enumerate(tc_rows):
                title = (row.get("title") or "").strip()
                if not title:
                    tc_errors.append({"row": idx + 1, "error": "Exercise title is required"})
                    continue
                ex = title_map.get(title.lower())
                if not ex:
                    tc_errors.append({"row": idx + 1, "error": f'No exercise titled "{title}" found in this lab'})
                    continue
                expected_output = row.get("expected_output")
                if expected_output is None or not str(expected_output).strip():
                    tc_errors.append({"row": idx + 1, "error": "Expected output is required"})
                    continue
                order = next_order_by_exercise.get(ex.id, 0)
                tc_to_create.append(LabExerciseTestCase(
                    exercise=ex,
                    stdin=row.get("stdin") or "",
                    expected_output=expected_output,
                    is_sample=bool(row.get("is_sample")),
                    order=order,
                ))
                next_order_by_exercise[ex.id] = order + 1

            if tc_to_create:
                with transaction.atomic():
                    LabExerciseTestCase.objects.bulk_create(tc_to_create)
                tc_created_count = len(tc_to_create)

        # No auto-generation here — test cases and explanations for any
        # exercise the CSV didn't supply test cases for are always a
        # separate, explicit step via the per-exercise Generate buttons.
        return Response({
            "created": [_serialize_exercise(e) for e in created],
            "created_count": len(created),
            "skipped_count": len(errors),
            "errors": errors,
            "test_cases_created_count": tc_created_count,
            "test_cases_skipped_count": len(tc_errors),
            "test_case_errors": tc_errors,
        }, status=201)

class StaffLabStudentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lab_id):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, staff_in_charge=staff)
        except Lab.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        exercises = list(lab.exercises.order_by("order", "created_at"))
        student_qs = StudentProfile.objects.filter(
            department=lab.department, batch=lab.batch
        )
        if lab.section:
            student_qs = student_qs.filter(section=lab.section)
        students = list(student_qs.order_by("register_number", "name"))

        subs = LabExerciseSubmission.objects.filter(exercise__lab=lab).select_related("student", "exercise")
        sub_map = {(s.student_id, s.exercise_id): s for s in subs}

        session_qs = LabStudentSession.objects.filter(lab=lab).prefetch_related("allocated_exercises")
        session_map = {s.student_id: s for s in session_qs}

        student_rows = []
        all_sub_batches = set()

        for student in students:
            session = session_map.get(student.id)
            if not session:
                is_locked = (lab.lab_type == "university")
                lock_reason = "Lab session is locked by staff. Awaiting staff unlock for your batch." if is_locked else ""
                session = LabStudentSession.objects.create(
                    lab=lab, student=student, is_locked=is_locked, lock_reason=lock_reason, sub_batch="Batch 1"
                )
                session_map[student.id] = session

            sub_b = session.sub_batch or "Batch 1"
            all_sub_batches.add(sub_b)

            ex_status = []
            for ex in exercises:
                sub = sub_map.get((student.id, ex.id))
                ex_status.append({
                    "exercise_id": ex.id,
                    "completed": sub is not None,
                    "submitted_at": sub.submitted_at.isoformat() if sub else None,
                    "language": sub.language if sub else None,
                })
            done = sum(1 for s in ex_status if s["completed"])

            allocated_list = [
                {
                    "id": ax.id,
                    "title": ax.title,
                    "difficulty": ax.difficulty,
                    "order": ax.order,
                }
                for ax in session.allocated_exercises.all()
            ]

            student_rows.append({
                "student_id": student.id,
                "student_name": student.name,
                "register_number": student.register_number or "",
                "section": student.section or "",
                "sub_batch": sub_b,
                "is_locked": session.is_locked,
                "lock_reason": session.lock_reason or "",
                "tab_switch_count": session.tab_switch_count,
                "exercises": ex_status,
                "allocated_exercises": allocated_list,
                "completed": done,
                "total": len(exercises),
            })

        def _sort_key(batch_name):
            match = re.search(r'\d+', str(batch_name))
            return int(match.group()) if match else 999

        sorted_batches = sorted(list(all_sub_batches), key=_sort_key) if all_sub_batches else ["Batch 1"]

        return Response({
            "lab": _serialize_lab_v2(lab),
            "exercises": [{"id": e.id, "title": e.title} for e in exercises],
            "students": student_rows,
            "available_sub_batches": sorted_batches,
        })

class StaffLabExerciseStudentReportView(APIView):
    """Staff: generate (or download cached) a specific student's lab record PDF."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id, exercise_id, register_number):
        staff = _staff_from_request(request)
        if not staff:
            return Response({"error": "Staff access required"}, status=403)
        try:
            lab = Lab.objects.get(id=lab_id)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)
        try:
            exercise = lab.exercises.get(id=exercise_id)
        except LabExercise.DoesNotExist:
            return Response({"error": "Exercise not found"}, status=404)

        student_qs = StudentProfile.objects.filter(
            register_number=register_number, department=lab.department, batch=lab.batch,
        )
        if lab.section:
            student_qs = student_qs.filter(section=lab.section)
        student = student_qs.first()
        if not student:
            student = StudentProfile.objects.filter(register_number=register_number).first()
        if not student:
            return Response({"error": "Student not found"}, status=404)

        submission = LabExerciseSubmission.objects.filter(exercise=exercise, student=student).first()
        if not submission or not (submission.code or "").strip():
            return Response({"error": "This student hasn't submitted this exercise yet."}, status=400)

        report = getattr(submission, "report", None)
        force_regen = request.query_params.get("force", "").lower() in ("true", "1")
        if report and report.pdf_file and _is_valid_algorithm(report.algorithm) and not force_regen:
            try:
                report.pdf_file.open("rb")
                report.pdf_file.seek(0)
                pdf_bytes = report.pdf_file.read()
                report.pdf_file.close()
                if pdf_bytes and len(pdf_bytes) >= 1000:
                    response = HttpResponse(pdf_bytes, content_type="application/pdf")
                    response["Content-Length"] = str(len(pdf_bytes))
                    response["Content-Disposition"] = f'attachment; filename="lab_record_{exercise.id}_{student.register_number}.pdf"'
                    return response
            except Exception:
                pass

        try:
            report, pdf_bytes = _generate_lab_exercise_report(exercise, submission)
        except Exception as exc:
            logger.exception(
                "Staff lab report generation failed for exercise %s / student %s: %s", exercise.id, register_number, exc,
            )
            return Response({"error": f"Failed to generate report PDF: {exc}"}, status=500)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Length"] = str(len(pdf_bytes))
        response["Content-Disposition"] = f'attachment; filename="lab_record_{exercise.id}_{student.register_number}.pdf"'
        return response

class StaffLabPublishView(APIView):
    """Staff: Publish / Activate an approved University Lab for students."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, staff_in_charge=staff)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        if lab.approval_status != "approved":
            return Response({"error": "Cannot publish a lab that has not been approved by the HOD."}, status=400)

        lab.is_published = True
        lab.is_active = True
        lab.save(update_fields=["is_published", "is_active"])
        return Response({"detail": "Lab published to students successfully!", "lab": _serialize_lab_v2(lab)})

class StaffLabSelectExercisesView(APIView):
    """Staff: Select exercises from the linked practice lab and copy them into a university lab."""
    permission_classes = [IsAuthenticated]

    def get(self, request, lab_id):
        """Return exercises from the linked practice lab that staff can pick from."""
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, staff_in_charge=staff, lab_type="university")
        except Lab.DoesNotExist:
            return Response({"error": "University lab not found"}, status=404)

        if not lab.linked_lab_id:
            return Response({"error": "No linked practice lab"}, status=400)

        linked_exercises = LabExercise.objects.filter(lab_id=lab.linked_lab_id).order_by("order", "created_at")
        already_selected = set(lab.exercises.values_list("title", flat=True))

        return Response({
            "linked_lab_name": lab.linked_lab.name if lab.linked_lab else "",
            "exercises": [
                {
                    "id": ex.id,
                    "title": ex.title,
                    "description": ex.description,
                    "difficulty": ex.difficulty,
                    "order": ex.order,
                    "test_case_count": ex.test_cases.count(),
                    "already_selected": ex.title in already_selected,
                }
                for ex in linked_exercises
            ],
        })

    def post(self, request, lab_id):
        """Copy selected exercises (and their test cases) from the linked lab into this university lab."""
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, staff_in_charge=staff, lab_type="university")
        except Lab.DoesNotExist:
            return Response({"error": "University lab not found"}, status=404)

        if not lab.linked_lab_id:
            return Response({"error": "No linked practice lab"}, status=400)

        exercise_ids = request.data.get("exercise_ids", [])
        if not isinstance(exercise_ids, list) or not exercise_ids:
            return Response({"error": "exercise_ids must be a non-empty list"}, status=400)

        source_exercises = LabExercise.objects.filter(
            id__in=exercise_ids, lab_id=lab.linked_lab_id
        ).prefetch_related("test_cases")

        if not source_exercises.exists():
            return Response({"error": "No valid exercises found in the linked lab"}, status=400)

        created = []
        next_order = lab.exercises.count()
        with transaction.atomic():
            for src_ex in source_exercises:
                new_ex = LabExercise.objects.create(
                    lab=lab,
                    title=src_ex.title,
                    description=src_ex.description,
                    explanation=src_ex.explanation,
                    order=next_order,
                    difficulty=src_ex.difficulty,
                    added_by=staff,
                )
                next_order += 1

                # Copy test cases
                for tc in src_ex.test_cases.all():
                    LabExerciseTestCase.objects.create(
                        exercise=new_ex,
                        stdin=tc.stdin,
                        expected_output=tc.expected_output,
                        is_sample=tc.is_sample,
                        order=tc.order,
                    )
                created.append(_serialize_exercise(new_ex))

        return Response({"created": created, "count": len(created)}, status=201)

class StaffLabAssignBatchesView(APIView):
    """Staff: Divide/assign students into sub-batches (Batch 1 to Batch N) for a Lab."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, staff_in_charge=staff)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        num_batches = request.data.get("num_batches")
        student_batches = request.data.get("student_batches")  # e.g. { "10": "Batch 1", "12": "Batch 2" }
        student_ids = request.data.get("student_ids")          # list of student IDs
        sub_batch = request.data.get("sub_batch")              # target sub_batch name

        student_qs = StudentProfile.objects.filter(department=lab.department, batch=lab.batch)
        if lab.section:
            student_qs = student_qs.filter(section=lab.section)
        students = list(student_qs.order_by("register_number", "name"))

        if student_ids and isinstance(student_ids, list) and sub_batch:
            b_name = str(sub_batch).strip() or "Batch 1"
            count = 0
            with transaction.atomic():
                for s_id in student_ids:
                    try:
                        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student_id=int(s_id))
                        session.sub_batch = b_name
                        session.save(update_fields=["sub_batch"])
                        count += 1
                    except Exception:
                        pass
            return Response({"detail": f"Assigned {count} student(s) to '{b_name}'."})

        if num_batches is not None:
            try:
                N = int(num_batches)
                if N < 1 or N > 20:
                    return Response({"error": "Number of batches must be between 1 and 20"}, status=400)
            except ValueError:
                return Response({"error": "Invalid num_batches"}, status=400)

            total = len(students)
            if total == 0:
                return Response({"error": "No students in this lab section to divide"}, status=400)

            with transaction.atomic():
                for idx, student in enumerate(students):
                    batch_num = (idx * N) // total + 1
                    batch_name = f"Batch {batch_num}"
                    session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
                    session.sub_batch = batch_name
                    session.save(update_fields=["sub_batch"])

            return Response({"detail": f"Successfully split {total} students into {N} batch(es)."})

        elif student_batches and isinstance(student_batches, dict):
            count = 0
            with transaction.atomic():
                for student_id_str, b_name in student_batches.items():
                    try:
                        s_id = int(student_id_str)
                        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student_id=s_id)
                        session.sub_batch = str(b_name).strip() or "Batch 1"
                        session.save(update_fields=["sub_batch"])
                        count += 1
                    except Exception:
                        pass
            return Response({"detail": f"Updated batch assignment for {count} student(s)."})

        else:
            return Response({"error": "Provide num_batches or student_batches dictionary"}, status=400)

class StaffLabBatchLockToggleView(APIView):
    """Staff: Unlock or Lock a specific sub-batch (or all students/selected students) for a Lab."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, staff_in_charge=staff)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        sub_batch = request.data.get("sub_batch")  # e.g. "Batch 1" or "all"
        student_ids = request.data.get("student_ids")  # optional list of student_ids
        is_locked = bool(request.data.get("is_locked", False))  # False = unlock, True = lock
        lock_reason = request.data.get("lock_reason", "Locked by staff" if is_locked else "")

        # Pre-create sessions for all eligible students if missing
        student_qs = StudentProfile.objects.filter(department=lab.department, batch=lab.batch)
        if lab.section:
            student_qs = student_qs.filter(section=lab.section)
        students = list(student_qs)
        for s in students:
            sess, _created = LabStudentSession.objects.get_or_create(lab=lab, student=s)
            if _created and lab.lab_type == "university":
                sess.is_locked = True
                sess.lock_reason = "Lab session is locked by staff. Awaiting staff unlock for your batch."
                sess.save(update_fields=["is_locked", "lock_reason"])

        sessions = LabStudentSession.objects.filter(lab=lab)
        if student_ids and isinstance(student_ids, list):
            sessions = sessions.filter(student_id__in=student_ids)
        elif sub_batch and sub_batch != "all":
            sessions = sessions.filter(sub_batch=sub_batch)

        updated_count = 0
        with transaction.atomic():
            for sess in sessions:
                sess.is_locked = is_locked
                sess.lock_reason = lock_reason if is_locked else ""
                sess.locked_at = timezone.now() if is_locked else None
                if not is_locked:
                    sess.tab_switch_count = 0  # reset violations on unlock
                sess.save(update_fields=["is_locked", "lock_reason", "locked_at", "tab_switch_count"])
                updated_count += 1

        status_str = "locked" if is_locked else "unlocked"
        target_str = f"Batch '{sub_batch}'" if sub_batch and sub_batch != "all" else f"{updated_count} student(s)"
        return Response({"detail": f"Successfully {status_str} {target_str} ({updated_count} students affected)."})

class StaffLabUnlockStudentView(APIView):
    """Staff: Unlock a locked student session in a Lab."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id, register_number):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, department=staff.department)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        student = StudentProfile.objects.filter(register_number=register_number, department=lab.department).first()
        if not student:
            return Response({"error": "Student not found"}, status=404)

        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        session.is_locked = False
        session.tab_switch_count = 0
        session.lock_reason = ""
        session.locked_at = None
        session.save()

        return Response({"detail": f"Student {student.name} ({register_number}) unlocked successfully!"})

class StaffLabFullReportView(APIView):
    """Staff: Bulk full report download is disabled. Only individual question downloads are enabled."""
    permission_classes = [IsAuthenticated]

    def get(self, request, lab_id):
        return Response({"error": "Bulk lab report download has been disabled. Please download individual question reports."}, status=400)

class StaffLabAllocateQuestionsView(APIView):
    """Staff: Trigger or re-run random difficulty-based question allocation for all students in a Lab."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        if not lab.is_published:
            lab.is_published = True
            lab.save(update_fields=["is_published"])

        from ...services.lab_allocation import allocate_lab_questions_for_students
        stats = allocate_lab_questions_for_students(lab)
        return Response({
            "detail": f"Question allocation completed for {stats.get('allocated_count', 0)} student(s).",
            "stats": stats,
        })

class StaffLabAllocationPDFView(APIView):
    """Staff: Generate and download PDF Question Allocation Sheet for a Lab."""
    permission_classes = [IsAuthenticated]

    def get(self, request, lab_id):
        staff = _staff_from_request(request)
        try:
            lab = Lab.objects.select_related("department", "staff_in_charge").get(id=lab_id)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        # Make sure questions are allocated first if not yet allocated
        sessions = list(
            LabStudentSession.objects.filter(lab=lab)
            .select_related("student")
            .prefetch_related("allocated_exercises")
            .order_by("student__register_number", "student__name")
        )

        has_allocations = any(s.allocated_exercises.exists() for s in sessions)
        if not has_allocations or not sessions:
            from ...services.lab_allocation import allocate_lab_questions_for_students
            allocate_lab_questions_for_students(lab)
            sessions = list(
                LabStudentSession.objects.filter(lab=lab)
                .select_related("student")
                .prefetch_related("allocated_exercises")
                .order_by("student__register_number", "student__name")
            )

        if not sessions:
            return Response({"error": "No students found enrolled in this lab section to generate allocation sheet."}, status=400)

        from ...services.lab_allocation_pdf import build_lab_allocation_pdf
        buffer = BytesIO()
        try:
            build_lab_allocation_pdf(buffer, lab=lab, sessions=sessions)
        except Exception as exc:
            logger.exception("Failed to render lab allocation PDF for lab %s", lab_id)
            return Response({"error": f"Failed to render allocation PDF: {exc}"}, status=500)

        buffer.seek(0)
        pdf_bytes = buffer.getvalue()

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Length"] = str(len(pdf_bytes))
        clean_lab_name = re.sub(r'[^\w\-]', '_', lab.name)
        response["Content-Disposition"] = f'attachment; filename="question_allocation_{clean_lab_name}.pdf"'
        return response

