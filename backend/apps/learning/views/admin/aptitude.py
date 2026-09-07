"""Views extracted from the original monolithic apps/learning/views.py
(module: admin/aptitude). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class AdminAptitudeTopicListCreateView(APIView):
    """System Admin: create a new aptitude topic node — a top-level
    category (parent_id omitted/null) or a main topic under a category
    (parent_id = that category's id). Capped at two levels: every admin
    workflow files questions on the main topic, so a third level would
    just be a dead end nothing writes to (see migration 0068)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"error": "title is required"}, status=400)

        parent_id = request.data.get("parent_id")
        parent = None
        if parent_id:
            parent = AptitudeTopic.objects.filter(id=parent_id).first()
            if not parent:
                return Response({"error": "Parent topic not found"}, status=404)
            if parent.parent_id is not None:
                return Response(
                    {"error": "Topics are capped at two levels (Category > Main Topic) — "
                              "pick a top-level category as the parent, not another main topic."},
                    status=400,
                )

        if AptitudeTopic.objects.filter(parent=parent, title__iexact=title).exists():
            return Response({"error": f'"{title}" already exists at this level.'}, status=400)

        topic = AptitudeTopic.objects.create(title=title, parent=parent)
        return Response({"id": topic.id, "title": topic.title, "parent_id": topic.parent_id}, status=201)

class AdminAptitudeTopicDetailView(APIView):
    """System Admin: rename an aptitude topic node (category, main topic,
    or level-3 topic)."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, topic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        topic = AptitudeTopic.objects.filter(id=topic_id).first()
        if not topic:
            return Response({"error": "Not found"}, status=404)

        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"error": "title is required"}, status=400)

        if AptitudeTopic.objects.filter(parent=topic.parent, title__iexact=title).exclude(id=topic.id).exists():
            return Response({"error": f'"{title}" already exists at this level.'}, status=400)

        topic.title = title
        topic.save()
        return Response({"id": topic.id, "title": topic.title, "parent_id": topic.parent_id})

    def delete(self, request, topic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        topic = AptitudeTopic.objects.filter(id=topic_id).first()
        if not topic:
            return Response({"error": "Not found"}, status=404)

        # Cascades to subtopics and their questions (AptitudeTopic.parent
        # and AptitudeQuestion.topic are both on_delete=CASCADE) — the
        # frontend confirm dialog is expected to warn about this before
        # calling delete.
        topic.delete()
        return Response(status=204)

class AdminAptitudeBankView(APIView):
    """System Admin: list every aptitude question (with topic + correct
    option, for admin review) and create a new one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        qs = AptitudeQuestion.objects.select_related("topic", "passage").order_by("-id")

        topic_id = request.query_params.get("topic_id")
        passage_id = request.query_params.get("passage_id")
        if passage_id:
            qs = qs.filter(passage_id=passage_id)
        elif topic_id:
            # topic_id is normally a Main Topic id here, which has no
            # children of its own — but if it's ever a Category id, include
            # its Main Topics too so selecting the whole category still
            # shows everything filed under it.
            subtopic_ids = AptitudeTopic.objects.filter(parent_id=topic_id).values_list("id", flat=True)
            qs = qs.filter(topic_id__in={int(topic_id), *subtopic_ids})
        difficulty = request.query_params.get("difficulty")
        if difficulty and difficulty != "all":
            qs = qs.filter(difficulty__iexact=difficulty)
        search = request.query_params.get("q")
        if search:
            qs = qs.filter(question_text__icontains=search)

        data = [{
            "id": q.id,
            "topic_id": q.topic_id,
            "topic": q.topic.title if q.topic else "",
            "passage_id": q.passage_id,
            "passage": q.passage.title if q.passage else "",
            "question_type": q.question_type,
            "question_text": q.question_text,
            "question_image": q.question_image,
            "option_a": q.option_a,
            "option_a_image": q.option_a_image,
            "option_b": q.option_b,
            "option_b_image": q.option_b_image,
            "option_c": q.option_c,
            "option_c_image": q.option_c_image,
            "option_d": q.option_d,
            "option_d_image": q.option_d_image,
            "correct_option": q.correct_option,
            "explanation": q.explanation or "",
            "difficulty": q.difficulty,
        } for q in qs[:2000]]

        return Response({"questions": data, "total": len(data)})

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        topic_id = request.data.get("topic_id")
        passage_id = request.data.get("passage_id")
        question_text = (request.data.get("question_text") or "").strip()
        question_image = (request.data.get("question_image") or "").strip()
        option_a = (request.data.get("option_a") or "").strip()
        option_a_image = (request.data.get("option_a_image") or "").strip()
        option_b = (request.data.get("option_b") or "").strip()
        option_b_image = (request.data.get("option_b_image") or "").strip()
        option_c = (request.data.get("option_c") or "").strip()
        option_c_image = (request.data.get("option_c_image") or "").strip()
        option_d = (request.data.get("option_d") or "").strip()
        option_d_image = (request.data.get("option_d_image") or "").strip()
        raw_answer = request.data.get("correct_option") or ""
        difficulty = request.data.get("difficulty") or "Easy"
        explanation = request.data.get("explanation") or ""

        topic = None
        passage = None
        if passage_id:
            passage = ReadingPassage.objects.filter(id=passage_id).first()
            if not passage:
                return Response({"error": "Passage not found"}, status=404)
        elif topic_id:
            topic = AptitudeTopic.objects.filter(id=topic_id).first()
            if not topic:
                return Response({"error": "Topic not found"}, status=404)
        else:
            return Response({"error": "topic_id or passage_id is required"}, status=400)

        if not question_text:
            return Response({"error": "question_text is required"}, status=400)
        if not all([option_a, option_b, option_c, option_d]):
            return Response({"error": "All four options (A-D) are required"}, status=400)
        if difficulty not in ("Easy", "Medium", "Hard"):
            return Response({"error": "difficulty must be Easy, Medium, or Hard"}, status=400)

        correct_option = _resolve_aptitude_correct_option(raw_answer, option_a, option_b, option_c, option_d)
        if correct_option is None:
            return Response({
                "error": f"Could not verify a correct answer from {raw_answer!r} against the four "
                         f"options — must be A-D or match one option's text exactly.",
            }, status=400)

        q = AptitudeQuestion.objects.create(
            topic=topic, passage=passage,
            question_type="RC" if passage else "MCQ",
            question_text=question_text, question_image=question_image,
            option_a=option_a, option_a_image=option_a_image,
            option_b=option_b, option_b_image=option_b_image,
            option_c=option_c, option_c_image=option_c_image,
            option_d=option_d, option_d_image=option_d_image,
            correct_option=correct_option, difficulty=difficulty, explanation=explanation,
        )
        return Response({
            "id": q.id,
            "topic_id": q.topic_id, "topic": topic.title if topic else "",
            "passage_id": q.passage_id, "passage": passage.title if passage else "",
            "question_type": q.question_type,
            "question_text": q.question_text, "question_image": q.question_image,
            "option_a": q.option_a, "option_a_image": q.option_a_image,
            "option_b": q.option_b, "option_b_image": q.option_b_image,
            "option_c": q.option_c, "option_c_image": q.option_c_image,
            "option_d": q.option_d, "option_d_image": q.option_d_image,
            "correct_option": q.correct_option, "explanation": q.explanation, "difficulty": q.difficulty,
        }, status=201)

class AdminAptitudeQuestionDetailView(APIView):
    """System Admin: edit or delete a single aptitude question."""
    permission_classes = [IsAuthenticated]

    def put(self, request, question_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        q = AptitudeQuestion.objects.filter(id=question_id).first()
        if not q:
            return Response({"error": "Not found"}, status=404)

        topic_id = request.data.get("topic_id")
        if topic_id:
            topic = AptitudeTopic.objects.filter(id=topic_id).first()
            if not topic:
                return Response({"error": "Topic not found"}, status=404)
            q.topic = topic

        passage_id = request.data.get("passage_id")
        if passage_id:
            passage = ReadingPassage.objects.filter(id=passage_id).first()
            if not passage:
                return Response({"error": "Passage not found"}, status=404)
            q.passage = passage
            q.question_type = "RC"

        question_text = request.data.get("question_text")
        if question_text is not None:
            question_text = question_text.strip()
            if not question_text:
                return Response({"error": "question_text cannot be empty"}, status=400)
            q.question_text = question_text

        question_image = request.data.get("question_image")
        if question_image is not None:
            q.question_image = question_image.strip()

        for field in ("option_a", "option_b", "option_c", "option_d"):
            val = request.data.get(field)
            if val is not None:
                val = val.strip()
                if not val:
                    return Response({"error": f"{field} cannot be empty"}, status=400)
                setattr(q, field, val)

        for field in ("option_a_image", "option_b_image", "option_c_image", "option_d_image"):
            val = request.data.get(field)
            if val is not None:
                setattr(q, field, val.strip())

        raw_answer = request.data.get("correct_option")
        if raw_answer is not None:
            resolved = _resolve_aptitude_correct_option(raw_answer, q.option_a, q.option_b, q.option_c, q.option_d)
            if resolved is None:
                return Response({
                    "error": f"Could not verify a correct answer from {raw_answer!r} against the four "
                             f"options — must be A-D or match one option's text exactly.",
                }, status=400)
            q.correct_option = resolved

        difficulty = request.data.get("difficulty")
        if difficulty is not None:
            if difficulty not in ("Easy", "Medium", "Hard"):
                return Response({"error": "difficulty must be Easy, Medium, or Hard"}, status=400)
            q.difficulty = difficulty

        explanation = request.data.get("explanation")
        if explanation is not None:
            q.explanation = explanation

        q.save()
        return Response({
            "id": q.id, "topic_id": q.topic_id, "topic": q.topic.title if q.topic else "",
            "passage_id": q.passage_id, "passage": q.passage.title if q.passage else "",
            "question_type": q.question_type,
            "question_text": q.question_text, "question_image": q.question_image,
            "option_a": q.option_a, "option_a_image": q.option_a_image,
            "option_b": q.option_b, "option_b_image": q.option_b_image,
            "option_c": q.option_c, "option_c_image": q.option_c_image,
            "option_d": q.option_d, "option_d_image": q.option_d_image,
            "correct_option": q.correct_option, "explanation": q.explanation, "difficulty": q.difficulty,
        })

    def delete(self, request, question_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        q = AptitudeQuestion.objects.filter(id=question_id).first()
        if not q:
            return Response({"error": "Not found"}, status=404)
        q.delete()
        return Response(status=204)

class AdminAptitudeQuestionValidateView(APIView):
    """System Admin: AI-review one aptitude question — checks the marked
    correct answer is actually right and the question/options are
    well-formed, autocorrecting and saving the fix (just the answer key, or
    a full rewrite when the question itself is broken/ambiguous) rather
    than only flagging it for manual review."""
    permission_classes = [IsAuthenticated]

    def post(self, request, question_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        q = AptitudeQuestion.objects.select_related("topic").filter(id=question_id).first()
        if not q:
            return Response({"error": "Not found"}, status=404)

        from ...services.aptitude_validator import validate_aptitude_question
        from ...services.testcase_generator import TestCaseGenError

        try:
            result = validate_aptitude_question(
                question_text=q.question_text,
                option_a=q.option_a, option_b=q.option_b, option_c=q.option_c, option_d=q.option_d,
                correct_option=q.correct_option, difficulty=q.difficulty,
            )
        except TestCaseGenError as e:
            return Response({"error": f"AI validation failed: {e}"}, status=502)

        changed_fields = []
        if result["needs_rewrite"]:
            for field in ("question_text", "option_a", "option_b", "option_c", "option_d"):
                new_val = result[field]
                if new_val != getattr(q, field):
                    setattr(q, field, new_val)
                    changed_fields.append(field)

        if result["correct_option"] != q.correct_option:
            q.correct_option = result["correct_option"]
            changed_fields.append("correct_option")

        if changed_fields:
            q.save()

        return Response({
            "id": q.id, "topic_id": q.topic_id, "topic": q.topic.title if q.topic else "",
            "question_text": q.question_text,
            "option_a": q.option_a, "option_b": q.option_b, "option_c": q.option_c, "option_d": q.option_d,
            "correct_option": q.correct_option, "explanation": q.explanation, "difficulty": q.difficulty,
            "changed_fields": changed_fields,
            "reason": result["reason"],
        })

class AdminAptitudeExplanationAuditView(APIView):
    """System Admin: "hit and run" AI audit over every aptitude question's
    explanation — runs in a background thread (there can be 10,000+
    questions) and checkpoints progress in AptitudeExplanationAuditRun so
    GET can be polled for live status and the run survives navigating away
    or a server restart (Resume just continues from last_question_id).

    A deploy/crash kills the thread outright with no chance to update its
    own row — nothing else was watching for that, so status would be stuck
    on "running" forever with no way to recover short of a DB edit. Every
    checkpoint touches updated_at, so a "running" row that hasn't been
    touched in a while is almost certainly an orphan from a dead thread;
    treat it as stale and let Start/Stop/Reset recover from it instead of
    just refusing because status still says "running"."""
    permission_classes = [IsAuthenticated]
    STALE_SECONDS = 90

    def _is_stale(self, run):
        return run.status == 'running' and (timezone.now() - run.updated_at).total_seconds() > self.STALE_SECONDS

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        run, _ = AptitudeExplanationAuditRun.objects.get_or_create(id=1)
        from ...services.testcase_generator import _providers_in_rotation_order
        try:
            active_provider_count = len(_providers_in_rotation_order())
        except Exception:
            active_provider_count = 0
        return Response({
            "status": run.status,
            "total": AptitudeQuestion.objects.count(),
            "processed": run.processed_count,
            "corrected": run.corrected_count,
            "failed": run.failed_count,
            "last_question_id": run.last_question_id,
            "last_error": run.last_error,
            "started_at": run.started_at,
            "updated_at": run.updated_at,
            "stalled": self._is_stale(run),
            "worker_count": min(active_provider_count, MAX_EXPLANATION_AUDIT_WORKERS),
            "active_provider_count": active_provider_count,
        })

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        action = request.data.get('action')
        run, _ = AptitudeExplanationAuditRun.objects.get_or_create(id=1)
        stale = self._is_stale(run)

        if action == 'start':
            if run.status == 'running' and not stale:
                return Response({"error": "Already running."}, status=400)
            run.status = 'running'
            run.stop_requested = False
            run.last_error = ''
            if not run.started_at:
                run.started_at = timezone.now()
            run.save()
            threading.Thread(target=_run_explanation_audit, args=(run.id,), daemon=True).start()
            return Response({"status": "running"})

        elif action == 'stop':
            if run.status != 'running':
                return Response({"error": "Not running."}, status=400)
            if stale:
                # No live thread will ever see stop_requested — just mark it
                # stopped directly rather than waiting on a dead worker.
                run.status = 'stopped'
                run.stop_requested = False
                run.save(update_fields=['status', 'stop_requested', 'updated_at'])
                return Response({"status": "stopped"})
            run.stop_requested = True
            run.save(update_fields=['stop_requested'])
            return Response({"status": "stopping"})

        elif action == 'reset':
            if run.status == 'running' and not stale:
                return Response({"error": "Stop the run before resetting."}, status=400)
            run.status = 'idle'
            run.last_question_id = 0
            run.processed_count = 0
            run.corrected_count = 0
            run.failed_count = 0
            run.started_at = None
            run.last_error = ''
            run.save()
            return Response({"status": "idle"})

        return Response({"error": "Unknown action."}, status=400)

class AdminAptitudeBulkDeleteView(APIView):
    """System Admin: delete many aptitude questions at once."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        ids = request.data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return Response({"error": "ids (non-empty list) is required"}, status=400)

        qs = AptitudeQuestion.objects.filter(id__in=ids)
        deleted_count = qs.count()
        qs.delete()
        return Response({"deleted_count": deleted_count})

class AdminAptitudeBulkUploadView(APIView):
    """System Admin: bulk-add aptitude questions from an uploaded .xlsx/.csv
    file — every row is added under a single selected topic. Accepts the
    same column names used by the original load_aptitude.py Excel imports
    (Question / Option A-D / Answer / Level / Explanation) as well as the
    admin form's own field names (question_text / option_a-d /
    correct_option / difficulty / explanation). Also accepts the optional
    Question Type and Question/Option A-D Image columns from the
    Aptitude Bank Excel Template (image cells hold image URLs)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        topic_id = request.data.get("topic_id")
        if not topic_id:
            return Response({"error": "topic_id is required"}, status=400)
        topic = AptitudeTopic.objects.filter(id=topic_id).first()
        if not topic:
            return Response({"error": "Topic not found"}, status=404)

        upload = request.FILES.get("file")
        if not upload:
            return Response({"error": "No file uploaded."}, status=400)

        name = upload.name.lower()
        try:
            if name.endswith((".xlsx", ".xls")):
                rows = self._read_excel(upload)
            elif name.endswith(".csv"):
                rows = self._read_csv(upload)
            else:
                return Response({"error": "Only .xlsx, .xls, or .csv files are supported."}, status=400)
        except Exception as e:
            return Response({"error": f"Could not read file: {e}"}, status=400)

        if not rows:
            return Response({"error": "File is empty."}, status=400)

        header = rows[0]
        col_idx = {col: i for i, col in enumerate(header) if col}

        def col(row, *names):
            for n in names:
                idx = col_idx.get(n)
                if idx is not None and idx < len(row) and row[idx] is not None:
                    val = str(row[idx]).strip()
                    if val and val.lower() != "nan":
                        return val
            return ""

        required_any = [
            ("question_text", "question"),
            ("option_a",), ("option_b",), ("option_c",), ("option_d",),
            ("correct_option", "answer", "correct_answer"),
        ]
        missing = [names[0] for names in required_any if not any(n in col_idx for n in names)]
        if missing:
            return Response({
                "error": f"Missing required column(s): {', '.join(missing)}. "
                         f"Expected: question_text/Question, option_a-d/Option A-D, correct_option/Answer/Correct Answer "
                         f"(question_no/Question No, difficulty/Level and explanation are optional and ignored if absent).",
            }, status=400)

        created_count = 0
        skipped_count = 0
        errors = []

        for row_num, row in enumerate(rows[1:], start=2):
            if not any(row):
                continue
            question_text = col(row, "question_text", "question")
            question_type = col(row, "question_type") or "MCQ"
            question_image = _resolve_drive_image(col(row, "question_image", "question_image_id"))
            option_a = col(row, "option_a")
            option_a_image = _resolve_drive_image(col(row, "option_a_image", "option_a_image_id"))
            option_b = col(row, "option_b")
            option_b_image = _resolve_drive_image(col(row, "option_b_image", "option_b_image_id"))
            option_c = col(row, "option_c")
            option_c_image = _resolve_drive_image(col(row, "option_c_image", "option_c_image_id"))
            option_d = col(row, "option_d")
            option_d_image = _resolve_drive_image(col(row, "option_d_image", "option_d_image_id"))
            raw_answer = col(row, "correct_option", "answer", "correct_answer")
            raw_difficulty = col(row, "difficulty", "level", "difficulty_level", "diff", "complexity", "tier")

            # Robust difficulty parsing for Easy, Medium, Hard
            def _clean_difficulty(raw_val):
                if not raw_val:
                    return "Easy"
                val = str(raw_val).strip().strip('*_').strip().lower()
                if val in ("easy", "e", "1", "basic", "simple", "beginner"):
                    return "Easy"
                if val in ("medium", "med", "m", "2", "moderate", "intermediate", "normal", "average"):
                    return "Medium"
                if val in ("hard", "h", "3", "difficult", "advanced", "complex"):
                    return "Hard"
                if "hard" in val or "diff" in val or "adv" in val:
                    return "Hard"
                if "med" in val or "mod" in val or "inter" in val:
                    return "Medium"
                if "easy" in val or "bas" in val or "simp" in val:
                    return "Easy"
                return "Easy"

            difficulty = _clean_difficulty(raw_difficulty)
            explanation = col(row, "explanation")

            if not question_text or not all([
                option_a or option_a_image, option_b or option_b_image,
                option_c or option_c_image, option_d or option_d_image,
            ]):
                errors.append(f"Row {row_num}: missing question text or an option (text or image) — skipped.")
                continue

            correct_option = _resolve_aptitude_correct_option(raw_answer, option_a, option_b, option_c, option_d)
            if correct_option is None:
                errors.append(
                    f"Row {row_num}: could not verify a correct answer from {raw_answer!r} against the "
                    f"four options — must be A-D or match one option's text exactly — skipped."
                )
                continue

            # Dedup key includes question_image, not just (topic, question_text) —
            # image-based question sets (e.g. Figure Series) commonly reuse the
            # same generic instructional text across every row ("Select the
            # figure that will replace the question mark...") with the actual
            # content living entirely in the image, so text alone would collapse
            # dozens/hundreds of genuinely distinct questions into one row that
            # just gets overwritten repeatedly. Text-only rows (question_image
            # empty for all of them) still dedup by text alone as before.
            q, created = AptitudeQuestion.objects.get_or_create(
                topic=topic, question_text=question_text, question_image=question_image,
                defaults={
                    "question_type": question_type,
                    "option_a": option_a, "option_a_image": option_a_image,
                    "option_b": option_b, "option_b_image": option_b_image,
                    "option_c": option_c, "option_c_image": option_c_image,
                    "option_d": option_d, "option_d_image": option_d_image,
                    "correct_option": correct_option, "difficulty": difficulty, "explanation": explanation,
                },
            )
            if created:
                created_count += 1
            else:
                q.question_type = question_type
                q.option_a = option_a
                q.option_a_image = option_a_image
                q.option_b = option_b
                q.option_b_image = option_b_image
                q.option_c = option_c
                q.option_c_image = option_c_image
                q.option_d = option_d
                q.option_d_image = option_d_image
                q.correct_option = correct_option
                q.difficulty = difficulty
                if explanation:
                    q.explanation = explanation
                q.save(update_fields=[
                    'question_type',
                    'option_a', 'option_a_image', 'option_b', 'option_b_image',
                    'option_c', 'option_c_image', 'option_d', 'option_d_image',
                    'correct_option', 'difficulty', 'explanation',
                ])
                skipped_count += 1

        return Response({
            "created_count": created_count,
            "skipped_count": skipped_count,
            "error_count": len(errors),
            "errors": errors[:50],
        })

    def _read_excel(self, upload):
        import openpyxl
        wb = openpyxl.load_workbook(upload, data_only=True)
        ws = wb.active
        formatted_rows = []
        for row_idx, row in enumerate(ws.iter_rows()):
            is_header_row = row_idx == 0
            row_vals = []
            for cell in row:
                if cell.value is None:
                    row_vals.append("")
                    continue

                val_str = str(cell.value).strip()
                # Bold formatting is a content cue for data cells (rendered as
                # **markdown**), but header cells are commonly bold-styled
                # purely for visual emphasis — wrapping them the same way
                # corrupts every column-name match below, since "**question**"
                # doesn't match the "question" alias.
                if not is_header_row and hasattr(cell, 'font') and cell.font and getattr(cell.font, 'bold', False):
                    if val_str and not (val_str.startswith('**') or val_str.startswith('<b>') or val_str.startswith('<strong>')):
                        val_str = f"**{val_str}**"
                row_vals.append(val_str)
            formatted_rows.append(row_vals)

        if not formatted_rows:
            return []
        header = [str(h).strip().lower().replace(" ", "_") if h else "" for h in formatted_rows[0]]
        return [header] + formatted_rows[1:]

    def _read_csv(self, upload):
        import csv
        import io
        text = upload.read().decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        raw_rows = list(reader)
        if not raw_rows:
            return []
        header = [h.strip().lower().replace(" ", "_") for h in raw_rows[0]]
        return [header] + raw_rows[1:]

