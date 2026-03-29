from datetime import timedelta

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class StudentProfile(models.Model):
    account = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="student_profile",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    title = models.CharField(max_length=180)
    register_number = models.CharField(max_length=50, unique=True, null=True, blank=True)
    personal_email = models.EmailField(blank=True, default="")
    mobile_number = models.CharField(max_length=20, blank=True, default="")
    gender = models.CharField(max_length=20, blank=True, default="")
    date_of_birth = models.DateField(null=True, blank=True)
    father_name = models.CharField(max_length=255, blank=True, default="")
    mother_name = models.CharField(max_length=255, blank=True, default="")
    source_personal_details_id = models.PositiveIntegerField(null=True, blank=True, unique=True)
    import_source = models.CharField(max_length=120, blank=True, default="")
    current_streak = models.PositiveIntegerField(default=0)
    login_days = models.PositiveIntegerField(default=0)
    last_login_on = models.DateField(null=True, blank=True)
    campus_rank = models.CharField(max_length=60, blank=True, default="")

    def __str__(self):
        return self.register_number or self.name

    @property
    def password_is_set(self):
        return bool(self.account and self.account.has_usable_password())

    def record_login(self, login_day=None):
        login_day = login_day or timezone.localdate()

        if self.last_login_on == login_day:
            StudentActivity.objects.get_or_create(
                student=self,
                activity_date=login_day,
                activity_type="login",
            )
            return False

        if self.last_login_on == login_day - timedelta(days=1):
            self.current_streak += 1
        else:
            self.current_streak = 1

        self.login_days += 1
        self.last_login_on = login_day
        self.save(update_fields=["current_streak", "login_days", "last_login_on"])
        StudentActivity.objects.get_or_create(
            student=self,
            activity_date=login_day,
            activity_type="login",
        )
        return True


class Problem(models.Model):
    DIFFICULTY_CHOICES = (
        ("Easy", "Easy"),
        ("Medium", "Medium"),
        ("Hard", "Hard"),
    )

    title = models.CharField(max_length=160)
    slug = models.SlugField(unique=True)
    description = models.TextField()
    difficulty = models.CharField(max_length=10, choices=DIFFICULTY_CHOICES)
    tags = models.JSONField(default=list, blank=True)
    is_daily = models.BooleanField(default=False)
    # Dynamic content fields from LeetCode dataset
    examples = models.JSONField(default=list, blank=True)  # [{input, output, explanation}]
    hints = models.JSONField(default=list, blank=True)  # ["hint1", "hint2"]
    editorial = models.TextField(blank=True, default="")
    source_dataset_id = models.CharField(max_length=50, blank=True, default="")

    def __str__(self):
        return self.title


class Submission(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="submissions")
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE, related_name="submissions")
    language = models.CharField(max_length=40, default="javascript")
    status = models.CharField(max_length=20, default="Accepted")
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.name} - {self.problem.title}"


class ExecutionRecord(models.Model):
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="execution_records",
        null=True,
        blank=True,
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.SET_NULL,
        related_name="execution_records",
        null=True,
        blank=True,
    )
    language = models.CharField(max_length=40)
    language_id = models.PositiveIntegerField()
    source_code = models.TextField()
    stdin = models.TextField(blank=True, default="")
    stdout = models.TextField(blank=True, default="")
    stderr = models.TextField(blank=True, default="")
    compile_output = models.TextField(blank=True, default="")
    status_description = models.CharField(max_length=120, default="Unknown")
    execution_time = models.CharField(max_length=40, blank=True, default="")
    memory = models.CharField(max_length=40, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        owner = self.student.register_number if self.student else "anonymous"
        return f"{owner} - {self.language} - {self.status_description}"


class StudentActivity(models.Model):
    ACTIVITY_CHOICES = (
        ("login", "Login"),
        ("solve", "Solve"),
        ("practice", "Practice"),
    )

    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="activity_logs",
    )
    activity_date = models.DateField()
    activity_type = models.CharField(max_length=20, choices=ACTIVITY_CHOICES, default="practice")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("activity_date", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("student", "activity_date", "activity_type"),
                name="unique_student_daily_activity_type",
            )
        ]

    def __str__(self):
        return f"{self.student} - {self.activity_type} - {self.activity_date}"


class TestCase(models.Model):
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="test_cases",
    )
    stdin = models.TextField(blank=True, default="")
    expected_output = models.TextField()
    is_sample = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("order",)

    def __str__(self):
        return f"TestCase #{self.order} for {self.problem.slug}"


class ProblemSolution(models.Model):
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="solutions",
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="solutions",
    )
    language = models.CharField(max_length=40)
    language_id = models.PositiveIntegerField()
    source_code = models.TextField()
    status = models.CharField(max_length=40, default="Attempted")  # Accepted / Wrong Answer / etc.
    passed_cases = models.PositiveIntegerField(default=0)
    total_cases = models.PositiveIntegerField(default=0)
    execution_time = models.CharField(max_length=40, blank=True, default="")
    memory = models.CharField(max_length=40, blank=True, default="")
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-submitted_at",)

    def __str__(self):
        return f"{self.student} - {self.problem.slug} - {self.status}"


class DiscussionMessage(models.Model):
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="discussion_messages",
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.SET_NULL,
        related_name="discussion_messages",
        null=True,
        blank=True,
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        target = self.problem.slug if self.problem else "general"
        return f"{self.student} - {target}"


class StaffProfile(models.Model):
    """Staff/Faculty profile - minimal fields, password added later like students"""
    account = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        null=True,
        blank=True,
    )
    faculty_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=120)
    # Password will be set on first login (like students)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_profiles"

    def __str__(self):
        return f"{self.faculty_id} - {self.name}"

    @property
    def password_is_set(self):
        return bool(self.account and self.account.has_usable_password())
