from rest_framework import serializers

from .models import DiscussionMessage, Problem, ProblemSolution, StudentProfile, Submission, TestCase
from .services.execution_adapter import clean_expected_output


DEFAULT_PRACTICE_LANGUAGES = [
    # ── Most popular ─────────────────────────────────────────────────────
    "JavaScript",
    "Python",
    "Java",
    "C++",
    "C (GCC 9.2.0)",
    # ── JavaScript / TypeScript ──────────────────────────────────────────
    "JavaScript (Node.js 12.14.0)",
    "TypeScript (3.7.4)",
    # ── Python variants ──────────────────────────────────────────────────
    "Python (3.8.1)",
    "Python (2.7.17)",
    # ── C / C++ variants ─────────────────────────────────────────────────
    "C (GCC 8.3.0)",
    "C (GCC 7.4.0)",
    "C (Clang 7.0.1)",
    "C++ (GCC 8.3.0)",
    "C++ (GCC 7.4.0)",
    "C++ (Clang 7.0.1)",
    # ── Systems / compiled ───────────────────────────────────────────────
    "Rust",
    "Go",
    "Swift (5.2.3)",
    # ── JVM family ───────────────────────────────────────────────────────
    "C# (Mono 6.6.0.161)",
    "Kotlin (1.3.70)",
    "Scala (2.13.2)",
    "Clojure (1.10.1)",
    "Groovy (3.0.3)",
    # ── Scripting ────────────────────────────────────────────────────────
    "PHP (7.4.1)",
    "Ruby (2.7.0)",
    "Perl (5.28.1)",
    "Lua (5.3.5)",
    "Bash (5.0.0)",
    "R (4.0.0)",
    # ── Functional ───────────────────────────────────────────────────────
    "Haskell (GHC 8.8.1)",
    "Elixir (1.9.4)",
    "Erlang (OTP 22.2)",
    "F# (.NET Core SDK 3.1.202)",
    "OCaml (4.09.0)",
    # ── Other languages ──────────────────────────────────────────────────
    "Objective-C (Clang 7.0.1)",
    "D (DMD 2.089.1)",
    "Fortran (GFortran 9.2.0)",
    "Pascal (FPC 3.0.4)",
    "Prolog (GNU Prolog 1.4.5)",
    "Common Lisp (SBCL 2.0.0)",
    "Assembly (NASM 2.14.02)",
    "Basic (FBC 1.07.1)",
    "COBOL (GnuCOBOL 2.2)",
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
