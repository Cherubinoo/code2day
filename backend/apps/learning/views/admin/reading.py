"""Views extracted from the original monolithic apps/learning/views.py
(module: admin/reading). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class AdminReadingPassageListCreateView(APIView):
    """System Admin: list every Reading Comprehension passage (with its
    question count) and create a new one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        passages = ReadingPassage.objects.select_related("topic").annotate(question_count=Count("questions")).order_by("-id")
        topic_id = request.query_params.get("topic_id")
        if topic_id:
            passages = passages.filter(topic_id=topic_id)
        data = [{
            "id": p.id,
            "title": p.title,
            "passage_text": p.passage_text,
            "topic_id": p.topic_id,
            "topic": p.topic.title if p.topic else "",
            "difficulty": p.difficulty,
            "question_count": p.question_count,
        } for p in passages]
        return Response({"passages": data, "total": len(data)})

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        title = (request.data.get("title") or "").strip()
        passage_text = (request.data.get("passage_text") or "").strip()
        difficulty = request.data.get("difficulty") or "Medium"
        topic_id = request.data.get("topic_id")

        if not title:
            return Response({"error": "title is required"}, status=400)
        if not passage_text:
            return Response({"error": "passage_text is required"}, status=400)
        if difficulty not in ("Easy", "Medium", "Hard"):
            return Response({"error": "difficulty must be Easy, Medium, or Hard"}, status=400)

        topic = None
        if topic_id:
            topic = AptitudeTopic.objects.filter(id=topic_id).first()
            if not topic:
                return Response({"error": "Topic not found"}, status=404)

        passage = ReadingPassage.objects.create(title=title, passage_text=passage_text, difficulty=difficulty, topic=topic)
        return Response({
            "id": passage.id, "title": passage.title, "passage_text": passage.passage_text,
            "topic_id": passage.topic_id, "topic": topic.title if topic else "",
            "difficulty": passage.difficulty, "question_count": 0,
        }, status=201)

class AdminReadingPassageDetailView(APIView):
    """System Admin: edit or delete a single Reading Comprehension passage."""
    permission_classes = [IsAuthenticated]

    def put(self, request, passage_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        passage = ReadingPassage.objects.filter(id=passage_id).first()
        if not passage:
            return Response({"error": "Not found"}, status=404)

        title = request.data.get("title")
        if title is not None:
            title = title.strip()
            if not title:
                return Response({"error": "title cannot be empty"}, status=400)
            passage.title = title

        passage_text = request.data.get("passage_text")
        if passage_text is not None:
            passage_text = passage_text.strip()
            if not passage_text:
                return Response({"error": "passage_text cannot be empty"}, status=400)
            passage.passage_text = passage_text

        difficulty = request.data.get("difficulty")
        if difficulty is not None:
            if difficulty not in ("Easy", "Medium", "Hard"):
                return Response({"error": "difficulty must be Easy, Medium, or Hard"}, status=400)
            passage.difficulty = difficulty

        if "topic_id" in request.data:
            topic_id = request.data.get("topic_id")
            if topic_id:
                topic = AptitudeTopic.objects.filter(id=topic_id).first()
                if not topic:
                    return Response({"error": "Topic not found"}, status=404)
                passage.topic = topic
            else:
                passage.topic = None

        passage.save()
        return Response({
            "id": passage.id, "title": passage.title, "passage_text": passage.passage_text,
            "topic_id": passage.topic_id, "topic": passage.topic.title if passage.topic else "",
            "difficulty": passage.difficulty,
        })

    def delete(self, request, passage_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        passage = ReadingPassage.objects.filter(id=passage_id).first()
        if not passage:
            return Response({"error": "Not found"}, status=404)
        passage.delete()
        return Response(status=204)

class AdminReadingPassageQAImportView(APIView):
    """System Admin: upload the merged reading QA dataset Excel file
    (sheets "Reading Passages" + "Questions & Answers") straight from the
    dashboard and load it into Reading Comprehension passages/questions —
    the point-and-click equivalent of the import_reading_qa_dataset
    management command, for datasets small enough to upload through the
    browser without needing server access."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get("file")
        if not upload:
            return Response({"error": "No file uploaded."}, status=400)
        if not upload.name.lower().endswith((".xlsx", ".xls")):
            return Response({"error": "Only .xlsx or .xls files are supported."}, status=400)

        try:
            limit = int(request.data.get("limit") or 20)
        except (TypeError, ValueError):
            return Response({"error": "limit must be a number."}, status=400)
        if limit < 1 or limit > 500:
            return Response({"error": "limit must be between 1 and 500 (large batches risk the request timing out — import in smaller runs)."}, status=400)

        try:
            questions_per_passage = int(request.data.get("questions_per_passage") or 10)
        except (TypeError, ValueError):
            return Response({"error": "questions_per_passage must be a number."}, status=400)
        if questions_per_passage < 1 or questions_per_passage > 100:
            return Response({"error": "questions_per_passage must be between 1 and 100."}, status=400)

        difficulty = request.data.get("difficulty") or "Medium"
        if difficulty not in ("Easy", "Medium", "Hard"):
            return Response({"error": "difficulty must be Easy, Medium, or Hard"}, status=400)

        topic = None
        topic_id = request.data.get("topic_id")
        if topic_id:
            topic = AptitudeTopic.objects.filter(id=topic_id).first()
            if not topic:
                return Response({"error": "Topic not found"}, status=404)

        try:
            import openpyxl
            wb = openpyxl.load_workbook(upload, data_only=True)
        except Exception as exc:
            return Response({"error": f"Could not read workbook: {exc}"}, status=400)

        try:
            passages, questions_skipped = parse_workbook_to_passages(
                wb, limit=limit, questions_per_passage=questions_per_passage, difficulty=difficulty,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        with transaction.atomic():
            passages_created, questions_created = create_passages_in_db(passages, topic=topic)

        return Response({
            "passages_created": passages_created,
            "questions_created": questions_created,
            "questions_skipped": questions_skipped,
            "passages": [{"title": p["title"], "question_count": len(p["questions"])} for p in passages],
        }, status=201)

