"""Views extracted from the original monolithic apps/learning/views.py
(module: admin/examinations). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class AdminExaminationListCreateView(APIView):
    """System Admin: list/create Examinations — the top-level content bank
    for the student-facing Competitive Practice module (GRE, GATE, CAT...).
    Global, like the Problem/Aptitude banks — not institution-scoped."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        exams = Examination.objects.annotate(
            section_count=Count('sections', distinct=True),
            topic_count=Count('sections__topics', distinct=True),
            subtopic_count=Count('sections__topics__subtopics', distinct=True),
        )
        return Response([
            {
                "id": e.id, "name": e.name, "description": e.description, "is_active": e.is_active,
                "section_count": e.section_count, "topic_count": e.topic_count, "subtopic_count": e.subtopic_count,
            }
            for e in exams
        ])

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data.get('name') or '').strip()
        description = (request.data.get('description') or '').strip()
        if not name:
            return Response({"error": "name is required."}, status=400)
        if Examination.objects.filter(name__iexact=name).exists():
            return Response({"error": "An examination with this name already exists."}, status=400)
        exam = Examination.objects.create(name=name, description=description)
        return Response({
            "id": exam.id, "name": exam.name, "description": exam.description, "is_active": exam.is_active,
            "section_count": 0, "topic_count": 0, "subtopic_count": 0,
        }, status=201)

class AdminExaminationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, exam_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        exam = get_object_or_404(Examination, id=exam_id)
        exam.delete()
        return Response({"message": "Examination deleted"})

    def patch(self, request, exam_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        exam = get_object_or_404(Examination, id=exam_id)
        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({"error": "name cannot be empty."}, status=400)
            if Examination.objects.exclude(id=exam.id).filter(name__iexact=name).exists():
                return Response({"error": "An examination with this name already exists."}, status=400)
            exam.name = name
        if 'is_active' in request.data:
            exam.is_active = bool(request.data.get('is_active'))
        if 'description' in request.data:
            exam.description = (request.data.get('description') or '').strip()
        exam.save()
        return Response({"message": "Updated", "name": exam.name, "is_active": exam.is_active, "description": exam.description})

class AdminExaminationSyllabusView(APIView):
    """Admin view of one examination's full syllabus tree."""
    permission_classes = [IsAuthenticated]

    def get(self, request, exam_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        exam = get_object_or_404(Examination, id=exam_id)
        return Response({
            "examination": {"id": exam.id, "name": exam.name, "description": exam.description},
            "sections": _serialize_examination_syllabus(exam),
        })

class AdminExaminationSyllabusUploadView(APIView):
    """System Admin: bulk-populate an Examination's Section > Topic >
    Subtopic tree from an uploaded .xlsx/.xls/.csv file. Expects Section,
    Topic, Subtopic columns (an Exam column is accepted but ignored — the
    target examination is the one in the URL, not whatever the sheet
    says, since the same sheet format could otherwise be uploaded to the
    wrong exam). Upserts by title within each parent so re-uploading an
    updated sheet is safe and doesn't create duplicates."""
    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        exam = get_object_or_404(Examination, id=exam_id)

        upload = request.FILES.get("file")
        if not upload:
            return Response({"error": "No file uploaded."}, status=400)

        filename = upload.name.lower()
        try:
            if filename.endswith((".xlsx", ".xls")):
                rows = self._read_excel(upload)
            elif filename.endswith(".csv"):
                rows = self._read_csv(upload)
            else:
                return Response({"error": "Only .xlsx, .xls, or .csv files are supported."}, status=400)
        except Exception as e:
            return Response({"error": f"Could not read file: {e}"}, status=400)

        if not rows:
            return Response({"error": "File is empty."}, status=400)

        header = [str(h or '').strip().lower() for h in rows[0]]
        col_idx = {h: i for i, h in enumerate(header) if h}

        def col(row, name):
            idx = col_idx.get(name)
            if idx is None or idx >= len(row) or row[idx] is None:
                return ""
            val = str(row[idx]).strip()
            return "" if val.lower() == "nan" else val

        missing = [n for n in ("section", "topic", "subtopic") if n not in col_idx]
        if missing:
            return Response({"error": f"Missing required column(s): {', '.join(missing)}."}, status=400)

        section_cache, topic_cache = {}, {}
        section_seq, topic_seq = 0, {}
        created_sections = created_topics = created_subtopics = 0
        skipped = 0

        for row in rows[1:]:
            if not row or all(not str(c or '').strip() for c in row):
                continue
            section_title = col(row, "section")
            topic_title = col(row, "topic")
            subtopic_title = col(row, "subtopic")
            if not section_title or not topic_title or not subtopic_title:
                skipped += 1
                continue

            if section_title not in section_cache:
                section, created = SyllabusSection.objects.get_or_create(
                    examination=exam, title=section_title, defaults={"order": section_seq},
                )
                section_cache[section_title] = section
                section_seq += 1
                topic_seq[section_title] = 0
                if created:
                    created_sections += 1
            section = section_cache[section_title]

            topic_key = (section_title, topic_title)
            if topic_key not in topic_cache:
                topic, created = SyllabusTopic.objects.get_or_create(
                    section=section, title=topic_title, defaults={"order": topic_seq[section_title]},
                )
                topic_cache[topic_key] = topic
                topic_seq[section_title] += 1
                if created:
                    created_topics += 1
            topic = topic_cache[topic_key]

            _, created = SyllabusSubtopic.objects.get_or_create(
                topic=topic, title=subtopic_title,
                defaults={"order": topic.subtopics.count()},
            )
            if created:
                created_subtopics += 1

        return Response({
            "message": "Syllabus imported",
            "created_sections": created_sections,
            "created_topics": created_topics,
            "created_subtopics": created_subtopics,
            "skipped_rows": skipped,
        }, status=201)

    def _read_excel(self, upload):
        import openpyxl
        wb = openpyxl.load_workbook(upload, data_only=True)
        ws = wb.active
        return [[cell.value for cell in row] for row in ws.iter_rows()]

    def _read_csv(self, upload):
        import csv
        import io
        text = upload.read().decode("utf-8-sig")
        return list(csv.reader(io.StringIO(text)))

class AdminSyllabusTopicResourcesView(APIView):
    """System Admin: replace the resource list attached to one syllabus
    topic. Each resource is either an external link (rendered as a
    YouTube embed automatically if the URL is one — the frontend's call,
    this just stores it) or a pointer at existing platform content: an
    Aptitude topic or a coding Problem, so a Competitive Practice topic
    can point straight at question banks that already exist instead of
    duplicating content."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, topic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        topic = get_object_or_404(SyllabusTopic, id=topic_id)

        raw_items = request.data.get('resource_links')
        if not isinstance(raw_items, list):
            return Response({"error": "resource_links must be a list."}, status=400)

        cleaned = _clean_resource_items(raw_items)
        topic.resource_links = cleaned
        topic.save(update_fields=['resource_links'])
        return Response({"message": "Resources updated", "resource_links": _resolve_resource_display(cleaned)})

class AdminSyllabusSubtopicView(APIView):
    """System Admin: update one subtopic's description and/or resources.
    Subtopics get their own individual resources here — the same three
    kinds a Topic can carry (external link, Aptitude topic, or Problem)
    — rather than only being covered by whatever's attached at the
    parent Topic level."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)

        update_fields = []
        if 'description' in request.data:
            subtopic.description = (request.data.get('description') or '').strip()
            update_fields.append('description')

        if 'resource_links' in request.data:
            raw_items = request.data.get('resource_links')
            if not isinstance(raw_items, list):
                return Response({"error": "resource_links must be a list."}, status=400)
            subtopic.resource_links = _clean_resource_items(raw_items)
            update_fields.append('resource_links')

        if update_fields:
            subtopic.save(update_fields=update_fields)

        return Response({
            "message": "Subtopic updated",
            "description": subtopic.description,
            "resource_links": _resolve_resource_display(subtopic.resource_links),
        })

    def delete(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        subtopic.delete()
        return Response({"message": "Subtopic deleted"})

class AdminSyllabusSectionListCreateView(APIView):
    """System Admin: manually add a Section to an Examination's syllabus
    tree, without going through the Excel upload — so an exam can be built
    by hand (and folders/media added under it) before any spreadsheet
    exists, not only as a bulk import."""
    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        exam = get_object_or_404(Examination, id=exam_id)
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        if SyllabusSection.objects.filter(examination=exam, title__iexact=title).exists():
            return Response({"error": "A section with this title already exists."}, status=400)
        order = exam.sections.count()
        section = SyllabusSection.objects.create(examination=exam, title=title, order=order)
        return Response({"id": section.id, "title": section.title, "topics": []}, status=201)

class AdminSyllabusSectionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, section_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        section = get_object_or_404(SyllabusSection, id=section_id)
        section.delete()
        return Response({"message": "Section deleted"})

class AdminSyllabusTopicListCreateView(APIView):
    """System Admin: manually add a Topic under one Section."""
    permission_classes = [IsAuthenticated]

    def post(self, request, section_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        section = get_object_or_404(SyllabusSection, id=section_id)
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        if SyllabusTopic.objects.filter(section=section, title__iexact=title).exists():
            return Response({"error": "A topic with this title already exists in this section."}, status=400)
        order = section.topics.count()
        topic = SyllabusTopic.objects.create(section=section, title=title, order=order)
        return Response({"id": topic.id, "title": topic.title, "resource_links": [], "subtopics": []}, status=201)

class AdminSyllabusTopicDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, topic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        topic = get_object_or_404(SyllabusTopic, id=topic_id)
        topic.delete()
        return Response({"message": "Topic deleted"})

class AdminSyllabusSubtopicListCreateView(APIView):
    """System Admin: manually add a Subtopic under one Topic — the level
    folders/media/questions actually attach to, so this is the endpoint
    that unblocks "add folders and media" for an exam with no uploaded
    spreadsheet at all."""
    permission_classes = [IsAuthenticated]

    def post(self, request, topic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        topic = get_object_or_404(SyllabusTopic, id=topic_id)
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        if SyllabusSubtopic.objects.filter(topic=topic, title__iexact=title).exists():
            return Response({"error": "A subtopic with this title already exists in this topic."}, status=400)
        order = topic.subtopics.count()
        subtopic = SyllabusSubtopic.objects.create(topic=topic, title=title, order=order)
        return Response({
            "id": subtopic.id, "title": subtopic.title, "description": "",
            "resource_links": [], "question_count": 0, "folders": [],
        }, status=201)

class AdminSubtopicQuestionListCreateView(APIView):
    """System Admin: list/create MCQ questions authored directly for one
    Competitive Practice subtopic — separate from resource_links' pointers
    at existing Aptitude/Problem content. Optional ?folder_id= scopes both
    GET and POST to one of the subtopic's folders instead of its
    top-level (unfoldered) question list."""
    permission_classes = [IsAuthenticated]

    def _resolve_folder(self, subtopic, folder_id):
        """Returns (folder_or_None, error_response_or_None)."""
        if not folder_id:
            return None, None
        folder = SyllabusFolder.objects.filter(id=folder_id, subtopic=subtopic).first()
        if not folder:
            return None, Response({"error": "Folder not found in this subtopic."}, status=404)
        return folder, None

    def get(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        folder, error = self._resolve_folder(subtopic, request.query_params.get('folder_id'))
        if error:
            return error
        questions = folder.questions.all() if folder else subtopic.questions.filter(folder__isnull=True)
        return Response([_serialize_competitive_question(q) for q in questions])

    def post(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        folder, error = self._resolve_folder(subtopic, request.data.get('folder_id'))
        if error:
            return error

        question_text = (request.data.get('question_text') or '').strip()
        option_a = (request.data.get('option_a') or '').strip()
        option_b = (request.data.get('option_b') or '').strip()
        option_c = (request.data.get('option_c') or '').strip()
        option_d = (request.data.get('option_d') or '').strip()
        correct_option = (request.data.get('correct_option') or '').strip().upper()

        if not all([question_text, option_a, option_b, option_c, option_d]):
            return Response({"error": "question_text and all four options are required."}, status=400)
        if correct_option not in ('A', 'B', 'C', 'D'):
            return Response({"error": "correct_option must be one of A, B, C, D."}, status=400)

        sibling_count = folder.questions.count() if folder else subtopic.questions.filter(folder__isnull=True).count()
        q = CompetitiveQuestion.objects.create(
            subtopic=subtopic,
            folder=folder,
            question_text=question_text,
            question_image=(request.data.get('question_image') or '').strip(),
            video_url=(request.data.get('video_url') or '').strip(),
            option_a=option_a, option_b=option_b, option_c=option_c, option_d=option_d,
            correct_option=correct_option,
            explanation=(request.data.get('explanation') or '').strip(),
            order=sibling_count,
        )
        return Response(_serialize_competitive_question(q), status=201)

class AdminSubtopicQuestionDetailView(APIView):
    """System Admin: edit or remove one Competitive Practice question."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, subtopic_id, question_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        q = get_object_or_404(CompetitiveQuestion, id=question_id, subtopic_id=subtopic_id)

        for field in ('question_text', 'question_image', 'video_url', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'):
            if field in request.data:
                setattr(q, field, (request.data.get(field) or '').strip())
        if 'correct_option' in request.data:
            correct_option = (request.data.get('correct_option') or '').strip().upper()
            if correct_option not in ('A', 'B', 'C', 'D'):
                return Response({"error": "correct_option must be one of A, B, C, D."}, status=400)
            q.correct_option = correct_option
        q.save()
        return Response(_serialize_competitive_question(q))

    def delete(self, request, subtopic_id, question_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        q = get_object_or_404(CompetitiveQuestion, id=question_id, subtopic_id=subtopic_id)
        q.delete()
        return Response({"message": "Question deleted"})

class AdminSubtopicQuestionBulkUploadView(APIView):
    """System Admin: bulk-add MCQ questions straight into one Competitive
    Practice subtopic (or one of its Folders, via optional ?folder_id=)
    from an uploaded .xlsx/.xls/.csv — same idea as
    AdminInterviewTopicQuestionBulkUploadView. Header matching is
    case-insensitive and treats spaces/underscores the same, so both
    friendly headers (Question, Option A-D, Correct Answer, Explanation,
    Question Image, Video URL) and the model's own field names
    (question_text, option_a-d, correct_option, ...) work. correct_option
    accepts a bare letter, a prefixed form like "Option A", or the option's
    own text — see _resolve_aptitude_correct_option (shared with Aptitude
    Bank's bulk upload, generic despite the name)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        folder = None
        folder_id = request.query_params.get('folder_id')
        if folder_id:
            folder = SyllabusFolder.objects.filter(id=folder_id, subtopic=subtopic).first()
            if not folder:
                return Response({"error": "Folder not found in this subtopic."}, status=404)

        upload = request.FILES.get("file")
        if not upload:
            return Response({"error": "No file uploaded."}, status=400)

        filename = upload.name.lower()
        try:
            if filename.endswith((".xlsx", ".xls")):
                rows = self._read_excel(upload)
            elif filename.endswith(".csv"):
                rows = self._read_csv(upload)
            else:
                return Response({"error": "Only .xlsx, .xls, or .csv files are supported."}, status=400)
        except Exception as e:
            return Response({"error": f"Could not read file: {e}"}, status=400)

        if not rows:
            return Response({"error": "File is empty."}, status=400)

        header = rows[0]
        col_idx = {c: i for i, c in enumerate(header) if c}

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
                         f"Expected: Question, Option A-D, Correct Answer (Explanation, Question Image, Video URL are optional).",
            }, status=400)

        created = []
        skipped = 0
        next_order = folder.questions.count() if folder else subtopic.questions.filter(folder__isnull=True).count()

        for row in rows[1:]:
            if not any(row):
                continue

            question_text = col(row, "question_text", "question")
            option_a = col(row, "option_a")
            option_b = col(row, "option_b")
            option_c = col(row, "option_c")
            option_d = col(row, "option_d")
            raw_answer = col(row, "correct_option", "answer", "correct_answer")

            if not question_text or not all([option_a, option_b, option_c, option_d]):
                skipped += 1
                continue

            correct_option = _resolve_aptitude_correct_option(raw_answer, option_a, option_b, option_c, option_d)
            if correct_option is None:
                skipped += 1
                continue

            q = CompetitiveQuestion.objects.create(
                subtopic=subtopic, folder=folder,
                question_text=question_text,
                question_image=_resolve_drive_image(col(row, "question_image", "image")),
                video_url=col(row, "video_url", "video"),
                option_a=option_a, option_b=option_b, option_c=option_c, option_d=option_d,
                correct_option=correct_option,
                explanation=col(row, "explanation"),
                order=next_order,
            )
            next_order += 1
            created.append(q)

        return Response({
            "message": "Questions imported",
            "created_questions": len(created),
            "skipped_rows": skipped,
            "questions": [_serialize_competitive_question(q) for q in created],
        }, status=201)

    def _read_excel(self, upload):
        import openpyxl
        wb = openpyxl.load_workbook(upload, data_only=True)
        ws = wb.active
        rows = [[cell.value for cell in row] for row in ws.iter_rows()]
        if not rows:
            return []
        header = [str(h).strip().lower().replace(" ", "_") if h else "" for h in rows[0]]
        return [header] + rows[1:]

    def _read_csv(self, upload):
        import csv
        import io
        text = upload.read().decode("utf-8-sig")
        raw_rows = list(csv.reader(io.StringIO(text)))
        if not raw_rows:
            return []
        header = [h.strip().lower().replace(" ", "_") for h in raw_rows[0]]
        return [header] + raw_rows[1:]

class AdminSubtopicQuestionImportView(APIView):
    """System Admin: import (copy) existing AptitudeQuestion rows into a
    Competitive Practice subtopic's own question bank. A one-time copy,
    not a live link — editing the original Aptitude question afterward
    doesn't change the imported copy here."""
    permission_classes = [IsAuthenticated]

    def post(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)

        folder = None
        folder_id = request.data.get('folder_id')
        if folder_id:
            folder = SyllabusFolder.objects.filter(id=folder_id, subtopic=subtopic).first()
            if not folder:
                return Response({"error": "Folder not found in this subtopic."}, status=404)

        aptitude_question_ids = request.data.get('aptitude_question_ids')
        if not isinstance(aptitude_question_ids, list) or not aptitude_question_ids:
            return Response({"error": "aptitude_question_ids must be a non-empty list."}, status=400)

        source_questions = AptitudeQuestion.objects.filter(id__in=aptitude_question_ids)
        next_order = folder.questions.count() if folder else subtopic.questions.filter(folder__isnull=True).count()
        created = []
        for i, aq in enumerate(source_questions):
            q = CompetitiveQuestion.objects.create(
                subtopic=subtopic,
                folder=folder,
                question_text=aq.question_text,
                question_image=aq.question_image or "",
                option_a=aq.option_a, option_b=aq.option_b, option_c=aq.option_c, option_d=aq.option_d,
                correct_option=(aq.correct_option or 'A').upper(),
                explanation=aq.explanation or "",
                order=next_order + i,
            )
            created.append(q)

        return Response({
            "message": f"Imported {len(created)} question(s)",
            "questions": [_serialize_competitive_question(q) for q in created],
        }, status=201)

class AdminSyllabusFolderListCreateView(APIView):
    """System Admin: list/create named top-level sub-folders inside one
    Competitive Practice subtopic — each folder groups its own questions
    and media, e.g. a "Time and Work" subtopic split into "Basic"/
    "Advanced"/"Formula Sheet" folders instead of one flat question list.
    Folders can themselves be nested (see AdminSyllabusSubfolderListCreateView) —
    this endpoint only lists/creates at the subtopic's top level; each
    returned folder's own "subfolders" carries whatever is nested under it."""
    permission_classes = [IsAuthenticated]

    def get(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        folders = subtopic.folders.filter(parent__isnull=True).prefetch_related(
            'media_items', 'questions', 'subfolders__media_items', 'subfolders__questions',
        )
        return Response([_serialize_syllabus_folder(f) for f in folders])

    def post(self, request, subtopic_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        if subtopic.folders.filter(parent__isnull=True, title__iexact=title).exists():
            return Response({"error": "A folder with this name already exists in this subtopic."}, status=400)
        folder = SyllabusFolder.objects.create(
            subtopic=subtopic, title=title,
            description=(request.data.get('description') or '').strip(),
            order=subtopic.folders.filter(parent__isnull=True).count(),
        )
        return Response(_serialize_syllabus_folder(folder), status=201)

class AdminSyllabusSubfolderListCreateView(APIView):
    """System Admin: create a folder nested inside another folder (not
    directly under the subtopic) — same idea as AdminSyllabusFolderListCreateView
    one level down, so folders can nest to arbitrary depth."""
    permission_classes = [IsAuthenticated]

    def post(self, request, folder_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        parent = get_object_or_404(SyllabusFolder, id=folder_id)
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({"error": "title is required."}, status=400)
        if parent.subfolders.filter(title__iexact=title).exists():
            return Response({"error": "A folder with this name already exists here."}, status=400)
        folder = SyllabusFolder.objects.create(
            subtopic=parent.subtopic, parent=parent, title=title,
            description=(request.data.get('description') or '').strip(),
            order=parent.subfolders.count(),
        )
        return Response(_serialize_syllabus_folder(folder), status=201)

class AdminSyllabusFolderDetailView(APIView):
    """System Admin: rename/edit or delete one syllabus folder (at any
    nesting depth). Deleting a folder cascades to its questions, uploaded
    media, and any subfolders (CASCADE FKs) — it does not fall back to
    becoming "unfoldered" content."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, folder_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        folder = get_object_or_404(SyllabusFolder, id=folder_id)

        if 'title' in request.data:
            title = (request.data.get('title') or '').strip()
            if not title:
                return Response({"error": "title cannot be empty."}, status=400)
            siblings = SyllabusFolder.objects.filter(subtopic=folder.subtopic, parent=folder.parent)
            if siblings.exclude(id=folder.id).filter(title__iexact=title).exists():
                return Response({"error": "A folder with this name already exists here."}, status=400)
            folder.title = title
        if 'description' in request.data:
            folder.description = (request.data.get('description') or '').strip()
        if 'resource_links' in request.data:
            raw_items = request.data.get('resource_links')
            if not isinstance(raw_items, list):
                return Response({"error": "resource_links must be a list."}, status=400)
            folder.resource_links = _clean_resource_items(raw_items)
        folder.save()
        return Response(_serialize_syllabus_folder(folder))

    def delete(self, request, folder_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        folder = get_object_or_404(SyllabusFolder, id=folder_id)
        folder.delete()
        return Response({"message": "Folder deleted"})

class AdminSyllabusFolderMediaView(APIView):
    """System Admin: list/upload real media files (images, PDFs, videos)
    attached to one syllabus folder — distinct from resource_links'
    paste-a-URL pointers, this is actual file storage served back through
    syllabus_folder_media_proxy."""
    permission_classes = [IsAuthenticated]

    ALLOWED_CONTENT_TYPES = {
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/heic', 'image/heif',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/x-m4v',
        'application/pdf',
    }
    # Video files are legitimately much larger than an image or a scanned
    # PDF, so it gets its own, higher cap instead of one shared limit that
    # would either reject reasonable videos or let huge images through.
    MAX_UPLOAD_BYTES = 25 * 1024 * 1024        # 25MB — images, PDFs
    MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024  # 200MB — a several-minute explainer clip

    def get(self, request, folder_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        folder = get_object_or_404(SyllabusFolder, id=folder_id)
        return Response([_serialize_folder_media(m) for m in folder.media_items.all()])

    def post(self, request, folder_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        folder = get_object_or_404(SyllabusFolder, id=folder_id)

        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({"error": "No file provided."}, status=400)
        if uploaded.content_type not in self.ALLOWED_CONTENT_TYPES:
            return Response({"error": f"Unsupported file type: {uploaded.content_type}."}, status=400)
        is_video = uploaded.content_type.startswith('video/')
        limit = self.MAX_VIDEO_UPLOAD_BYTES if is_video else self.MAX_UPLOAD_BYTES
        if uploaded.size > limit:
            return Response({"error": f"File too large. Maximum size is {limit // (1024 * 1024)}MB."}, status=400)

        media = SyllabusFolderMedia.objects.create(
            folder=folder,
            file=uploaded,
            title=(request.data.get('title') or '').strip(),
            description=(request.data.get('description') or '').strip(),
            content_type=uploaded.content_type,
            order=folder.media_items.count(),
        )
        return Response(_serialize_folder_media(media), status=201)

class AdminSyllabusFolderMediaDetailView(APIView):
    """System Admin: rename or delete one uploaded media file. Delete also
    removes it from disk, not just the database row."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, media_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        media = get_object_or_404(SyllabusFolderMedia, id=media_id)
        update_fields = []
        if 'title' in request.data:
            title = (request.data.get('title') or '').strip()
            if not title:
                return Response({"error": "title cannot be empty."}, status=400)
            media.title = title
            update_fields.append('title')
        if 'description' in request.data:
            media.description = (request.data.get('description') or '').strip()
            update_fields.append('description')
        if update_fields:
            media.save(update_fields=update_fields)
        return Response(_serialize_folder_media(media))

    def delete(self, request, media_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        media = get_object_or_404(SyllabusFolderMedia, id=media_id)
        media.file.delete(save=False)
        media.delete()
        return Response({"message": "Media deleted"})

