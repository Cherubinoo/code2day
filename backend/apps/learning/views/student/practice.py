"""Views extracted from the original monolithic apps/learning/views.py
(module: student/practice). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class SqlFrogProgressView(StudentAuthMixin, APIView):
    """SQL Frog: the player's overall progress — XP/coins/rank, and every
    world's level list with locked/unlocked/completed state. Unlock is
    still a single global sequence across ALL_LEVELS (order 1..N spans
    every world), so finishing World N's last level unlocks World N+1's
    first exactly like finishing one level unlocks the next within a
    world — no special-casing at a world boundary."""

    def get(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        progress, _ = SqlFrogProgress.objects.get_or_create(student=profile)
        completed = set(progress.completed_level_ids)

        worlds_by_number = {}
        unlocked_so_far = True  # level 1 (globally) always unlocked
        for lvl in SQL_FROG_ALL_LEVELS:
            worlds_by_number.setdefault(lvl["world"], []).append({
                "id": lvl["id"], "order": lvl["order"], "title": lvl["title"],
                "skill_unlocked": lvl["skill_unlocked"],
                "completed": lvl["id"] in completed,
                "unlocked": unlocked_so_far,
            })
            unlocked_so_far = lvl["id"] in completed

        worlds = [
            {"world": w, "name": SQL_FROG_WORLD_NAMES.get(w, f"World {w}"), "levels": levels}
            for w, levels in worlds_by_number.items()
        ]

        return Response({
            "xp": progress.xp, "coins": progress.coins, "rank": _sql_frog_rank(progress.xp),
            "completed_level_ids": list(completed),
            "worlds": worlds,
            "future_worlds": FUTURE_WORLDS,
        })

class SqlFrogLevelDetailView(StudentAuthMixin, APIView):
    """One level's teaching content — story/concept/example/mission/schema.
    Never includes expected_result or the reference solution. `schemas` is
    always a list (one entry for a single-table World 1/2 level, two for
    every World 3+ level that needs both `frogs` and `ponds`) so the
    frontend never has to branch on how many tables a level's mission uses."""

    def get(self, request, level_id):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        level = SQL_FROG_ALL_LEVELS_BY_ID.get(level_id)
        if not level:
            return Response({"detail": "Level not found."}, status=404)

        progress, _ = SqlFrogProgress.objects.get_or_create(student=profile)
        completed = set(progress.completed_level_ids)
        idx = level["order"] - 1
        unlocked = idx == 0 or SQL_FROG_ALL_LEVELS[idx - 1]["id"] in completed
        if not unlocked:
            return Response({"detail": "This level isn't unlocked yet."}, status=403)

        if level["id"] in SQL_FROG_VILLAGE_LEVEL_IDS:
            schemas = _sql_frog_village_schema_view()
        else:
            schemas = [{
                "table": "frogs",
                "columns": ["id", "name", "color", "weight_kg", "score", "team"],
                "sample_rows": [[1, "Kermit", "green", 8.5, 92, "Leap"], [2, "Pepe", "green", 6.0, 75, "Splash"]],
            }]

        return Response({
            "id": level["id"], "order": level["order"], "world": level["world"], "title": level["title"],
            "story": level["story"], "concept_title": level["concept_title"],
            "concept_explanation": level["concept_explanation"], "example": level["example"],
            "mission": level["mission"], "completed": level["id"] in completed,
            "xp_reward": level["xp_reward"], "coin_reward": level["coin_reward"],
            "skill_unlocked": level["skill_unlocked"],
            "schemas": schemas,
        })

class SqlFrogRunView(StudentAuthMixin, APIView):
    """Executes the player's query for one level via the existing Judge0
    pipeline and grades it. Awards XP/coins only the first time a level is
    completed — replaying an already-completed level for practice doesn't
    double-award."""

    def post(self, request, level_id):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        level = SQL_FROG_ALL_LEVELS_BY_ID.get(level_id)
        if not level:
            return Response({"detail": "Level not found."}, status=404)

        query = (request.data.get("query") or "").strip()
        if not query:
            return Response({"error": "Write a query first."}, status=400)

        progress, _ = SqlFrogProgress.objects.get_or_create(student=profile)
        completed = set(progress.completed_level_ids)
        idx = level["order"] - 1
        unlocked = idx == 0 or SQL_FROG_ALL_LEVELS[idx - 1]["id"] in completed
        if not unlocked:
            return Response({"detail": "This level isn't unlocked yet."}, status=403)

        success, error_category, message, rows = _sql_frog_grade(query, level)

        already_completed = level["id"] in completed
        xp_awarded = coins_awarded = 0
        if success and not already_completed:
            xp_awarded, coins_awarded = level["xp_reward"], level["coin_reward"]
            progress.xp += xp_awarded
            progress.coins += coins_awarded
            progress.completed_level_ids = list(completed | {level["id"]})
            progress.save(update_fields=["xp", "coins", "completed_level_ids", "updated_at"])

        return Response({
            "success": success,
            "error_category": error_category,
            "message": message,
            "rows": rows,
            "xp_awarded": xp_awarded,
            "coins_awarded": coins_awarded,
            "already_completed": already_completed,
            "skill_unlocked": level["skill_unlocked"] if success else None,
            "total_xp": progress.xp, "total_coins": progress.coins, "rank": _sql_frog_rank(progress.xp),
        })

class SqlFrogHintView(StudentAuthMixin, APIView):
    """Returns one of a level's 3 hints — progressively more specific, per
    the game's 3-level hint system. Tracked for stats only; never reduces
    XP/coin rewards (hints should teach, not punish)."""

    def post(self, request, level_id):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        level = SQL_FROG_ALL_LEVELS_BY_ID.get(level_id)
        if not level:
            return Response({"detail": "Level not found."}, status=404)

        try:
            hint_level = int(request.data.get("hint_level"))
        except (TypeError, ValueError):
            return Response({"error": "hint_level must be 1, 2, or 3."}, status=400)
        if hint_level not in (1, 2, 3):
            return Response({"error": "hint_level must be 1, 2, or 3."}, status=400)

        progress, _ = SqlFrogProgress.objects.get_or_create(student=profile)
        hints_used = dict(progress.hints_used)
        hints_used[level["id"]] = max(hints_used.get(level["id"], 0), hint_level)
        progress.hints_used = hints_used
        progress.save(update_fields=["hints_used", "updated_at"])

        return Response({"hint_level": hint_level, "hint": level["hints"][hint_level - 1]})

class InterviewTrackView(UnifiedAuthMixin, APIView):
    """Resolves the caller's Interview Practice track from their department
    (Department.interview_track, defaulted by branch — see
    default_interview_track) and returns its full Topic > Folder >
    Question content. Answers are never withheld here — Interview
    Practice is self-study, not a scored quiz, so the frontend controls
    when to reveal an answer, not the backend. Falls back to an empty
    topic list (not an error) when no InterviewTrack row exists yet for
    this department's key — content just hasn't been added for it."""

    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        department = getattr(profile, 'department', None)
        if not department:
            return Response({"detail": "No department assigned."}, status=404)

        track_key = department.interview_track or department.default_interview_track()
        track = InterviewTrack.objects.filter(key=track_key).prefetch_related(
            'topics__questions',
            'topics__folders__questions',
            'topics__folders__media_items',
            'topics__folders__subfolders__questions',
            'topics__folders__subfolders__media_items',
        ).first()

        if track:
            label = track.name
            topics = _serialize_interview_track(track)["topics"]
        else:
            label = INTERVIEW_TRACK_LABELS.get(track_key, track_key.replace('_', ' ').title())
            topics = []

        return Response({
            "department": department.name,
            "track_key": track_key,
            "track_label": label,
            "topics": topics,
        })

class CompetitiveSubtopicQuestionsView(APIView):
    """Student: practice questions for one subtopic — correct_option and
    explanation are withheld until answered via the submit endpoint.
    Optional ?folder_id= scopes to one of the subtopic's folders instead
    of its top-level (unfoldered) question set."""
    permission_classes = [IsAuthenticated]

    def get(self, request, subtopic_id):
        subtopic = get_object_or_404(SyllabusSubtopic, id=subtopic_id)
        folder_id = request.query_params.get('folder_id')
        if folder_id:
            folder = get_object_or_404(SyllabusFolder, id=folder_id, subtopic=subtopic)
            questions = folder.questions.all()
        else:
            questions = subtopic.questions.filter(folder__isnull=True)
        return Response([_serialize_competitive_question(q, include_answer=False) for q in questions])

class CompetitiveQuestionSubmitView(APIView):
    """Student: submit an answer to one Competitive Practice question,
    get instant right/wrong feedback plus the explanation."""
    permission_classes = [IsAuthenticated]

    def post(self, request, question_id):
        question = get_object_or_404(CompetitiveQuestion, id=question_id)
        selected = (request.data.get('selected_option') or '').strip().upper()
        if selected not in ('A', 'B', 'C', 'D'):
            return Response({"error": "selected_option must be one of A, B, C, D."}, status=400)

        return Response({
            "is_correct": selected == question.correct_option,
            "correct_option": question.correct_option,
            "explanation": question.explanation,
        })

class CompetitiveExaminationListView(APIView):
    """Student: active Examinations available under Competitive Practice."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        exams = Examination.objects.filter(is_active=True).annotate(
            section_count=Count('sections', distinct=True),
            topic_count=Count('sections__topics', distinct=True),
        )
        return Response([
            {
                "id": e.id, "name": e.name, "description": e.description,
                "section_count": e.section_count, "topic_count": e.topic_count,
            }
            for e in exams
        ])

class CompetitiveExaminationSyllabusView(APIView):
    """Student: browse one examination's Section > Topic > Subtopic syllabus."""
    permission_classes = [IsAuthenticated]

    def get(self, request, exam_id):
        exam = get_object_or_404(Examination, id=exam_id, is_active=True)
        return Response({
            "examination": {"id": exam.id, "name": exam.name, "description": exam.description},
            "sections": _serialize_examination_syllabus(exam),
        })

class AptitudeTopicListView(UnifiedAuthMixin, APIView):
    """List all available aptitude topics and their questions count + student progress"""
    def get(self, request):
        profile, _, _ = self.get_authenticated_profile(request)
        is_student = hasattr(profile, 'register_number')
        
        # Optimization: Get solved question counts per topic for this student
        solved_counts = {}
        if is_student:
            from django.db.models import Count
            solved_qs = SolvedAptitude.objects.filter(student=profile).values('question__topic_id').annotate(count=Count('id'))
            solved_counts = {item['question__topic_id']: item['count'] for item in solved_qs}

        # Fetch top-level topics (Categories). Two levels only — Category >
        # Main Topic — since every admin workflow (bulk upload, add/edit
        # question, topic manager) files questions on the Main Topic node;
        # a third level was a dead end nothing ever wrote to.
        categories = AptitudeTopic.objects.filter(parent=None).prefetch_related('subtopics')

        category_list = []
        for cat in categories:
            subcategory_list = []
            cat_total_questions = 0
            cat_solved_questions = 0

            for subcat in cat.subtopics.all():
                q_count = subcat.questions.count()
                s_count = solved_counts.get(subcat.id, 0)

                cat_total_questions += q_count
                cat_solved_questions += s_count

                subcategory_list.append({
                    "id": subcat.id,
                    "title": subcat.title,
                    "question_count": q_count,
                    "solved_count": s_count
                })

            category_list.append({
                "id": cat.id,
                "title": cat.title,
                "subcategories": subcategory_list,
                "question_count": cat_total_questions,
                "solved_count": cat_solved_questions
            })

        return Response({"categories": category_list})

class AptitudeQuestionListView(UnifiedAuthMixin, APIView):
    """List aptitude questions for selection in contest creator"""
    def get(self, request):
        topic_id = request.query_params.get('topic_id')
        difficulty = request.query_params.get('difficulty')
        solved_status = request.query_params.get('status') # 'solved', 'unsolved', 'all'
        search = request.query_params.get('q')
        limit = request.query_params.get('limit', 1000) # Increased default limit
        
        profile, _, _ = self.get_authenticated_profile(request)
        is_student = hasattr(profile, 'register_number')
        
        topic_ids = request.query_params.getlist('topic_id')
        if not topic_ids and topic_id:
            topic_ids = topic_id.split(',')

        # Explicit stable order — an unordered queryset's row order isn't
        # guaranteed across requests, which combined with the frontend
        # restoring only a numeric position (not question identity) after a
        # refresh could show a different question at the same index.
        qs = AptitudeQuestion.objects.all().select_related('topic').order_by('id')
        
        if topic_ids:
            # Enhanced filtering: Include subtopics recursively if a parent topic is selected
            all_topic_ids = set()
            invalid_ids = []
            for tid in topic_ids:
                try:
                    all_topic_ids.add(int(tid))
                    # Topics are two levels deep now (Category > Main Topic) —
                    # if tid is a category, pull in its main topics too, so
                    # selecting a whole category still grabs everything filed
                    # under it.
                    subtopic_ids = AptitudeTopic.objects.filter(parent_id=tid).values_list('id', flat=True)
                    all_topic_ids.update(subtopic_ids)
                except ValueError:
                    invalid_ids.append(tid)
                    continue

            # A malformed/empty topic_id used to silently fall through to
            # `topic_id__in=set()` — a valid-looking empty result that was
            # indistinguishable from "this topic genuinely has no questions."
            # Fail loudly instead so the client can tell the two apart.
            if not all_topic_ids:
                return Response(
                    {"error": f"No valid topic_id provided — got {invalid_ids!r}."},
                    status=400,
                )
            qs = qs.filter(topic_id__in=all_topic_ids)

        if difficulty and difficulty != 'all' and difficulty != 'All':
            qs = qs.filter(difficulty__iexact=difficulty)
        if search:
            qs = qs.filter(question_text__icontains=search)
            
        solved_ids = []
        if is_student:
            solved_ids = list(SolvedAptitude.objects.filter(student=profile).values_list('question_id', flat=True))
            if solved_status == 'solved':
                qs = qs.filter(id__in=solved_ids)
            elif solved_status == 'unsolved':
                qs = qs.exclude(id__in=solved_ids)
            
        data = []
        # Limit the queryset to avoid memory issues, but use a larger default
        try:
            limit = int(limit)
        except ValueError:
            limit = 1000
            
        for q in qs[:limit]:
            data.append({
                "id": q.id,
                "topic": q.topic.title,
                "topic_id": q.topic.id,
                "question_type": q.question_type,
                "question_text": q.question_text,
                "question_image": q.question_image,
                "difficulty": q.difficulty,
                "option_a": q.option_a,
                "option_a_image": q.option_a_image,
                "option_b": q.option_b,
                "option_b_image": q.option_b_image,
                "option_c": q.option_c,
                "option_c_image": q.option_c_image,
                "option_d": q.option_d,
                "option_d_image": q.option_d_image,
                # Only staff/HOD building a contest get to see the answer — never
                # send this to a student, who fetches this same endpoint to take
                # the quiz itself, or it would leak the answer via the network tab.
                **({} if is_student else {"correct_option": q.correct_option}),
                "is_solved": q.id in solved_ids
            })
            
        return Response(data)

class AptitudeQuestionSubmitView(APIView):
    """Verify an aptitude question answer and record progress"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        question_id = request.data.get('question_id')
        selected_option = request.data.get('selected_option')
        
        if not question_id or not selected_option:
            return Response({"error": "question_id and selected_option are required"}, status=400)
            
        question = get_object_or_404(AptitudeQuestion, id=question_id)
        is_correct = question.correct_option.upper() == selected_option.upper()

        if hasattr(request.user, 'student_profile'):
            AptitudeAttempt.objects.create(
                student=request.user.student_profile,
                question=question,
                selected_option=selected_option.upper()[:1],
                is_correct=is_correct,
            )

        if is_correct:
            if hasattr(request.user, 'student_profile'):
                profile = request.user.student_profile
                SolvedAptitude.objects.get_or_create(
                    student=profile,
                    question=question
                )

                # Check for aptitude achievements
                total_aptitude_solved = SolvedAptitude.objects.filter(student=profile).count()
                unearned = Achievement.objects.filter(category='aptitude').exclude(userachievement__user=request.user)
                for ach in unearned:
                    should_award = False
                    if ach.criteria_type == 'aptitude_solve_count' and total_aptitude_solved >= ach.criteria_value:
                        should_award = True
                    elif ach.criteria_type == 'quant_solve_count':
                        # Check if category is quantitative
                        # Using topic__parent__parent because QUANTITATIVE is at the root (Level 1)
                        is_quant = False
                        t = question.topic
                        while t:
                            if 'QUANTITATIVE' in t.title.upper():
                                is_quant = True
                                break
                            t = t.parent
                        
                        if is_quant:
                            quant_solved = SolvedAptitude.objects.filter(
                                student=profile, 
                                question__topic__id__in=AptitudeTopic.objects.filter(title__icontains='QUANTITATIVE').values_list('id', flat=True)
                            ).count()
                            if quant_solved >= ach.criteria_value:
                                should_award = True
                    
                    if should_award:
                        UserAchievement.objects.get_or_create(user=request.user, achievement=ach)
        
        return Response({
            "is_correct": is_correct,
            "correct_option": question.correct_option,
            "explanation": question.explanation
        })

class ReadingPassageListView(UnifiedAuthMixin, APIView):
    """List Reading Comprehension passages with question/solved counts —
    the Reading Comprehension section of the student Aptitude page."""
    def get(self, request):
        profile, _, _ = self.get_authenticated_profile(request)
        is_student = hasattr(profile, 'register_number')

        solved_counts = {}
        if is_student:
            solved_qs = (
                SolvedAptitude.objects.filter(student=profile, question__passage__isnull=False)
                .values('question__passage_id').annotate(count=Count('id'))
            )
            solved_counts = {item['question__passage_id']: item['count'] for item in solved_qs}

        passages = ReadingPassage.objects.annotate(question_count=Count("questions")).order_by("-id")
        data = [{
            "id": p.id,
            "title": p.title,
            "difficulty": p.difficulty,
            "question_count": p.question_count,
            "solved_count": solved_counts.get(p.id, 0),
        } for p in passages]
        return Response({"passages": data})

class ReadingPassageDetailView(UnifiedAuthMixin, APIView):
    """Get one Reading Comprehension passage's text and its questions —
    never includes correct_option for a student, mirroring
    AptitudeQuestionListView's answer-leak protection."""
    def get(self, request, passage_id):
        profile, _, _ = self.get_authenticated_profile(request)
        is_student = hasattr(profile, 'register_number')

        passage = ReadingPassage.objects.filter(id=passage_id).first()
        if not passage:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        solved_ids = []
        if is_student:
            solved_ids = list(
                SolvedAptitude.objects.filter(student=profile, question__passage=passage)
                .values_list('question_id', flat=True)
            )

        questions = []
        for q in passage.questions.all().order_by("id"):
            questions.append({
                "id": q.id,
                "question_text": q.question_text,
                "question_image": q.question_image,
                "option_a": q.option_a, "option_a_image": q.option_a_image,
                "option_b": q.option_b, "option_b_image": q.option_b_image,
                "option_c": q.option_c, "option_c_image": q.option_c_image,
                "option_d": q.option_d, "option_d_image": q.option_d_image,
                "difficulty": q.difficulty,
                **({} if is_student else {"correct_option": q.correct_option}),
                "is_solved": q.id in solved_ids,
            })

        return Response({
            "id": passage.id,
            "title": passage.title,
            "passage_text": passage.passage_text,
            "difficulty": passage.difficulty,
            "questions": questions,
        })

