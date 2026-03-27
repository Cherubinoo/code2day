from rest_framework import serializers

from .models import DiscussionMessage, Problem, StudentProfile, Submission


DEFAULT_PRACTICE_LANGUAGES = ["JavaScript", "Python", "Java", "C++"]


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


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ("id", "student", "problem", "language", "status", "submitted_at")


class FirstLoginSerializer(serializers.Serializer):
    register_number = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, min_length=6)


class StudentLoginSerializer(serializers.Serializer):
    register_number = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True)


class ProblemProgressUpdateSerializer(serializers.Serializer):
    problem_slug = serializers.CharField(max_length=160)
    language = serializers.CharField(max_length=40, required=False, allow_blank=True)
    progress_state = serializers.ChoiceField(choices=("open", "completed"))


class StudentLookupListSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentProfile
        fields = ("name", "register_number", "personal_email", "password_is_set")


class DiscussionMessageSerializer(serializers.ModelSerializer):
    problem_slug = serializers.CharField(source="problem.slug", read_only=True)
    author = serializers.SerializerMethodField()

    class Meta:
        model = DiscussionMessage
        fields = ("id", "author", "body", "problem_slug", "created_at")

    def get_author(self, obj):
        return "Anonymous"


class DiscussionMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=1200)
    problem_slug = serializers.CharField(max_length=160, required=False, allow_blank=True)

    def validate_body(self, value):
        cleaned = value.strip()
        if len(cleaned) < 4:
            raise serializers.ValidationError("Enter a clearer doubt or error message.")
        return cleaned
