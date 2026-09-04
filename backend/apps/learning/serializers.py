from rest_framework import serializers

from .models import Contest, Department, DiscussionMessage, Problem, ProblemSolution, StudentProfile, StaffProfile, Submission, TestCase
from .services.execution_adapter import clean_expected_output
from .services import param_types


DEFAULT_PRACTICE_LANGUAGES = [
    "C",
    "C++",
    "Java",
    "JavaScript",
    "Python",
]


class StaffProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = ("id", "name", "faculty_id", "role", "department", "email", "mobile_number")


class StudentProfileSerializer(serializers.ModelSerializer):
    password_is_set = serializers.BooleanField(read_only=True)
    mentor_id = serializers.IntegerField(source='mentor.id', read_only=True, allow_null=True)
    mentor_name = serializers.CharField(source='mentor.name', read_only=True, allow_null=True)
    mentor_faculty_id = serializers.CharField(source='mentor.faculty_id', read_only=True, allow_null=True)

    class Meta:
        model = StudentProfile
        fields = (
            "id",
            "name",
            "title",
            "register_number",
            "personal_email",
            "mobile_number",
            "gender",
            "date_of_birth",
            "father_name",
            "mother_name",
            "role",
            "batch",
            "section",
            "department",
            "current_streak",
            "login_days",
            "campus_rank",
            "tracked_companies",
            "password_is_set",
            "mentor_id",
            "mentor_name",
            "mentor_faculty_id",
            "allow_copy_paste",
        )


class ProblemSerializer(serializers.ModelSerializer):
    progress_state = serializers.SerializerMethodField()
    available_languages = serializers.SerializerMethodField()
    solved_languages = serializers.SerializerMethodField()
    current_language = serializers.SerializerMethodField()

    class Meta:
        model = Problem
        fields = (
            "id",
            "title",
            "slug",
            "description",
            "difficulty",
            "tags",
            "is_daily",
            "progress_state",
            "available_languages",
            "solved_languages",
            "current_language",
            "companies",
        )

    def _progress_entry(self, obj):
        progress_map = self.context.get("progress_map", {})
        return progress_map.get(obj.id)

    def get_progress_state(self, obj):
        entry = self._progress_entry(obj)
        return entry["state"] if entry else "not_completed"

    def get_available_languages(self, obj):
        if "SQL" in (obj.tags or []):
            return ["SQL"]
        return DEFAULT_PRACTICE_LANGUAGES

    def get_solved_languages(self, obj):
        entry = self._progress_entry(obj)
        return entry["solved_languages"] if entry else []

    def get_current_language(self, obj):
        entry = self._progress_entry(obj)
        return entry["current_language"] if entry else None


class ProblemDetailSerializer(ProblemSerializer):
    examples = serializers.SerializerMethodField()
    last_solutions = serializers.SerializerMethodField()
    starter_code = serializers.SerializerMethodField()

    class Meta(ProblemSerializer.Meta):
        fields = ProblemSerializer.Meta.fields + (
            "examples",
            "explanation",
            "editorial",
            "hints",
            "last_solutions",
            "starter_code",
        )

    def get_examples(self, obj):
        cleaned_examples = []
        for example in obj.examples or []:
            cleaned_examples.append(
                {
                    **example,
                    "output": clean_expected_output(example.get("output", "")),
                }
            )
        return cleaned_examples

    def get_last_solutions(self, obj):
        """{language: {source_code, status, all_tests_passed, submitted_at}}
        for the requesting student's most recent submission per language on
        this problem, so the editor can restore exactly what they last had."""
        return self.context.get("last_solutions", {})

    def get_starter_code(self, obj):
        """{language: code} for problems with a param_schema — a correctly
        typed, empty stub for the declared function/class signature, so
        students fill in a signature the backend can actually execute
        instead of guessing one from the description. None per language
        (or the whole dict empty) when there's no schema; the frontend
        falls back to its existing generic per-language template."""
        if not obj.param_schema:
            return {}
        result = {}
        for language in DEFAULT_PRACTICE_LANGUAGES:
            code = param_types.generate_starter_code(obj, language)
            if code:
                result[language] = code
        return result


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ("id", "student", "problem", "language", "status", "submitted_at")


class TestCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestCase
        fields = ("id", "stdin", "expected_output", "is_sample", "order")


class ProblemSolutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProblemSolution
        fields = (
            "id", "problem", "student", "language", "language_id",
            "source_code", "status", "passed_cases", "total_cases",
            "execution_time", "memory", "submitted_at",
        )


class FirstLoginSerializer(serializers.Serializer):
    register_number = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, min_length=8)


class StudentLoginSerializer(serializers.Serializer):
    register_number = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True)


class ProblemProgressUpdateSerializer(serializers.Serializer):
    problem_slug = serializers.CharField(max_length=160)
    language = serializers.CharField(max_length=40, required=False, allow_blank=True)
    progress_state = serializers.ChoiceField(choices=("open", "completed"))


class CodeRunSerializer(serializers.Serializer):
    source_code = serializers.CharField(max_length=20000)
    language_id = serializers.IntegerField(min_value=1)
    stdin = serializers.CharField(required=False, allow_blank=True, max_length=10000)
    language = serializers.CharField(required=False, allow_blank=True, max_length=40)
    problem_slug = serializers.CharField(required=False, allow_blank=True, max_length=160)
    is_submit = serializers.BooleanField(required=False, default=False)

    def validate_source_code(self, value):
        if not value.strip():
            raise serializers.ValidationError("source_code cannot be empty.")
        return value


class StudentLookupListSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentProfile
        fields = ("name", "register_number", "personal_email", "password_is_set")


class DiscussionMessageSerializer(serializers.ModelSerializer):
    problem_slug = serializers.CharField(source="problem.slug", read_only=True, default=None)
    sender_name = serializers.SerializerMethodField()
    sender_reg = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()
    is_self = serializers.SerializerMethodField()

    poll_results = serializers.SerializerMethodField()
    user_vote = serializers.SerializerMethodField()

    class Meta:
        model = DiscussionMessage
        fields = (
            "id", "sender_name", "sender_reg", "recipient_name",
            "thread_type", "batch_name", "section", "body", "is_read",
            "problem_slug", "created_at", "is_self",
            "is_poll", "poll_options", "poll_results", "user_vote"
        )

    def get_sender_name(self, obj) -> str:
        if obj.sender:
            if hasattr(obj.sender, "student_profile"):
                return obj.sender.student_profile.name
            if hasattr(obj.sender, "staff_profile"):
                return obj.sender.staff_profile.name
            return obj.sender.username
        return obj.student.name if obj.student else "Unknown"

    def get_sender_reg(self, obj) -> str:
        if obj.sender:
            if hasattr(obj.sender, "student_profile"):
                return obj.sender.student_profile.register_number
            if hasattr(obj.sender, "staff_profile"):
                return obj.sender.staff_profile.faculty_id
        if obj.student:
            return obj.student.register_number
        return ""

    def get_recipient_name(self, obj) -> str:
        if obj.recipient:
            if hasattr(obj.recipient, "student_profile"):
                return obj.recipient.student_profile.name
            if hasattr(obj.recipient, "staff_profile"):
                return obj.recipient.staff_profile.name
            return obj.recipient.username
        return ""

    def get_is_self(self, obj) -> bool:
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            # Robust comparison using IDs
            sender_id = obj.sender.id if obj.sender else None
            return sender_id == request.user.id
        return False

    def get_poll_results(self, obj):
        if not obj.is_poll:
            return None
        results = [0] * len(obj.poll_options)
        for vote_idx in obj.poll_votes.values():
            if 0 <= vote_idx < len(results):
                results[vote_idx] += 1
        return results

    def get_user_vote(self, obj):
        request = self.context.get("request")
        if not obj.is_poll or not request or not request.user.is_authenticated:
            return None
        return obj.poll_votes.get(str(request.user.id))


class DiscussionMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000)
    thread_type = serializers.ChoiceField(choices=DiscussionMessage.THREAD_TYPES, default="general")
    recipient_reg = serializers.CharField(required=False, allow_blank=True)
    batch_name = serializers.CharField(required=False, allow_blank=True)
    problem_slug = serializers.CharField(required=False, allow_blank=True)
    section = serializers.CharField(required=False, allow_blank=True, max_length=5)
    mentor_id = serializers.IntegerField(required=False, allow_null=True)
    is_poll = serializers.BooleanField(default=False)
    poll_options = serializers.ListField(child=serializers.CharField(), required=False, default=list)

    def validate_body(self, value):
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError("Message is too short.")
        return cleaned


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "name", "code", "institution")


class ContestSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    problem_count = serializers.SerializerMethodField()
    approved_by_name = serializers.CharField(source="approved_by.name", read_only=True, allow_null=True)
    
    class Meta:
        model = Contest
        fields = (
            "id", "title", "description", "created_by", "created_by_name",
            "department", "department_name", "start_time", "end_time",
            "access_start_time", "access_end_time", "session_duration_minutes",
            "duration_minutes", "problems", "problem_count", "status", "contest_type",
            "assigned_batches", "assigned_sections", "total_participants", "total_submissions",
            "enable_tab_switch_check", "max_tab_switches", "enable_fullscreen_lock", "enable_copy_paste_lock",
            "approved_by", "approved_by_name", "approved_at", "rejection_reason",
            "submitted_for_approval_at", "created_at", "updated_at"
        )
        read_only_fields = (
            "created_by", "total_participants", "total_submissions", 
            "approved_by", "approved_at", "submitted_for_approval_at",
            "created_at", "updated_at"
        )
    
    def get_problem_count(self, obj):
        return obj.problems.count()


class ContestCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True)
    start_time = serializers.DateTimeField(required=False, allow_null=True)
    end_time = serializers.DateTimeField(required=False, allow_null=True)
    duration_minutes = serializers.IntegerField(default=60)
    problem_slugs = serializers.ListField(child=serializers.CharField(), required=False)
    assigned_batches = serializers.ListField(child=serializers.CharField(), required=False)
    assigned_student_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    status = serializers.ChoiceField(
        choices=["draft", "pending_approval"],
        default="draft"
    )
    submit_for_approval = serializers.BooleanField(default=False)


class BatchAnalyticsSerializer(serializers.Serializer):
    batch = serializers.CharField()
    student_count = serializers.IntegerField()
    total_solved = serializers.IntegerField()
    avg_solved = serializers.FloatField()
    top_performers = serializers.ListField()
    students = serializers.ListField()


class StudentAnalyticsSerializer(serializers.Serializer):
    register_number = serializers.CharField()
    name = serializers.CharField()
    batch = serializers.CharField()
    solved_count = serializers.IntegerField()
    current_streak = serializers.IntegerField()
    last_active = serializers.DateField(allow_null=True)
    difficulty_breakdown = serializers.DictField()
    recent_activity = serializers.ListField()
    time_spent_total = serializers.IntegerField()
