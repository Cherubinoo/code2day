from rest_framework import serializers

from .models import Contest, Department, DiscussionMessage, Problem, ProblemSolution, StudentProfile, Submission, TestCase
from .services.execution_adapter import clean_expected_output


DEFAULT_PRACTICE_LANGUAGES = [
    "C",
    "C++",
    "Java",
    "JavaScript",
    "Python",
]


class StudentProfileSerializer(serializers.ModelSerializer):
    password_is_set = serializers.BooleanField(read_only=True)

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
            "department",
            "current_streak",
            "login_days",
            "campus_rank",
            "password_is_set",
        )


class ProblemSerializer(serializers.ModelSerializer):
    progress_state = serializers.SerializerMethodField()
    available_languages = serializers.SerializerMethodField()

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
        )

    def get_progress_state(self, obj):
        progress_map = self.context.get("progress_map", {})
        return progress_map.get(obj.id, "not_completed")

    def get_available_languages(self, obj):
        if "SQL" in (obj.tags or []):
            return ["SQL"]
        return DEFAULT_PRACTICE_LANGUAGES


class ProblemDetailSerializer(ProblemSerializer):
    examples = serializers.SerializerMethodField()

    class Meta(ProblemSerializer.Meta):
        fields = ProblemSerializer.Meta.fields + (
            "examples",
            "hints",
            "editorial",
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
    author = serializers.SerializerMethodField()

    class Meta:
        model = DiscussionMessage
        fields = ("id", "author", "body", "problem_slug", "created_at")

    def get_author(self, obj) -> str:
        """
        Returns the student's full name plus the last digit of their register
        number as a light privacy veil.

        Examples:
            "Arun Kumar …0"
            "Meera …7"
            "Student …"    ← fallback when both fields are blank
        """
        name = (obj.student.name or "").strip()
        reg = (obj.student.register_number or "").strip()

        last_digit = reg[-1] if reg else ""
        suffix = f" …{last_digit}" if last_digit else ""

        return f"{name}{suffix}" if name else f"Student{suffix}"


class DiscussionMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=1200)
    problem_slug = serializers.CharField(max_length=160, required=False, allow_blank=True)

    def validate_body(self, value):
        cleaned = value.strip()
        if len(cleaned) < 4:
            raise serializers.ValidationError("Enter a clearer doubt or error message.")
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
            "duration_minutes", "problems", "problem_count", "status",
            "assigned_batches", "total_participants", "total_submissions",
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
