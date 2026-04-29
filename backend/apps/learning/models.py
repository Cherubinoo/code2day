import re
from datetime import timedelta

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class Institution(models.Model):
    """Institution/College model for multi-tenant support"""
    institution_id = models.PositiveIntegerField(unique=True)
    name = models.CharField(max_length=255)
    short_code = models.CharField(max_length=20, blank=True, default="")
    address = models.TextField(blank=True, default="")
    contact_email = models.EmailField(blank=True, default="")
    contact_phone = models.CharField(max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Database Isolation
    database_name = models.CharField(max_length=255, blank=True, default="")

    # Maintenance Modes
    maintenance_staff = models.BooleanField(default=False)
    maintenance_students = models.BooleanField(default=False)
    maintenance_hod = models.BooleanField(default=False)
    maintenance_inst_admin = models.BooleanField(default=False)
    maintenance_ja = models.BooleanField(default=False)

    class Meta:
        db_table = "institutions"

    def __str__(self):
        return f"{self.institution_id} - {self.name}"


class SystemConfiguration(models.Model):
    """Global system-wide configurations"""
    global_maintenance_staff = models.BooleanField(default=False)
    global_maintenance_students = models.BooleanField(default=False)
    global_maintenance_hod = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "system_configurations"

    def __str__(self):
        return "Global System Configuration"


class Department(models.Model):
    """Department model for organizing students and staff"""
    institution = models.ForeignKey(
        Institution,
        on_delete=models.CASCADE,
        related_name="departments",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=10, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "departments"

    def __str__(self):
        return f"{self.code} - {self.name}"


class StudentProfile(models.Model):
    ROLE_CHOICES = (
        ("student", "Student"),
        ("class_representative", "Class Representative"),
        ("placement_coordinator", "Placement Coordinator"),
    )

    account = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="student_profile",
        null=True,
        blank=True,
    )
    institution = models.ForeignKey(
        Institution,
        on_delete=models.CASCADE,
        related_name="students",
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
    role = models.CharField(max_length=25, choices=ROLE_CHOICES, default="student")
    batch = models.CharField(max_length=20, blank=True, default="")
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        related_name="students",
        null=True,
        blank=True,
    )
    current_streak = models.PositiveIntegerField(default=0)
    login_days = models.PositiveIntegerField(default=0)
    last_login_on = models.DateField(null=True, blank=True)
    campus_rank = models.CharField(max_length=60, blank=True, default="")
    tracked_companies = models.JSONField(default=list, blank=True)

    def __str__(self):
        return self.register_number or self.name

    def parse_register_number(self):
        """
        Parse register number format: 953623243023
        - 9536 = institution code (4 digits)
        - 23 = joining year (2 digits)
        - 243 = department code (3 digits)
        - 023 = unique number (3 digits)
        Returns: (institution_code, joining_year, department_code, unique_number)
        """
        if not self.register_number:
            return None, None, None, None

        reg_num = str(self.register_number).strip()
        # Remove any non-digit characters
        reg_num = re.sub(r'\D', '', reg_num)

        if len(reg_num) >= 12:
            institution_code = reg_num[0:4]
            joining_year = reg_num[4:6]
            department_code = reg_num[6:9]
            unique_number = reg_num[9:12]
            return institution_code, joining_year, department_code, unique_number

        return None, None, None, None

    def calculate_batch(self):
        """
        Calculate batch from register number.
        Batch format: "23-27" (joining year - joining year + 4)
        """
        _, joining_year, _, _ = self.parse_register_number()

        if joining_year:
            try:
                start_year = int(joining_year)
                end_year = start_year + 4
                return f"{start_year:02d}-{end_year:02d}"
            except ValueError:
                pass

        return ""

    def extract_department_code(self):
        """Extract department code from register number"""
        _, _, department_code, _ = self.parse_register_number()
        return department_code or ""

    def map_department_and_batch(self):
        """Auto-map department and batch based on register number"""
        _, joining_year, dept_code, _ = self.parse_register_number()

        if joining_year:
            self.batch = self.calculate_batch()

        if dept_code:
            # Try to find department by code
            try:
                dept = Department.objects.filter(code__iexact=dept_code).first()
                if dept:
                    self.department = dept
            except Department.DoesNotExist:
                pass

        self.save(update_fields=["batch", "department"])

    @property
    def password_is_set(self):
        return bool(self.account and self.account.has_usable_password())

    def update_streak_for_activity(self, activity_date=None):
        """Update streak based on problem-solving activity (not just login)"""
        from django.utils import timezone
        
        activity_date = activity_date or timezone.localdate()
        
        # Only update if this is a new day compared to last activity
        if self.last_login_on == activity_date:
            return False  # Already recorded today
            
        if self.last_login_on == activity_date - timedelta(days=1):
            self.current_streak += 1  # Consecutive day
        else:
            self.current_streak = 1   # Reset streak
            
        self.last_login_on = activity_date
        self.save(update_fields=["current_streak", "last_login_on"])
        return True

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
    companies = models.TextField(blank=True, default="")
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


class DailyProblem(models.Model):
    problem = models.ForeignKey(Problem, on_delete=models.CASCADE, related_name="daily_instances")
    date = models.DateField(unique=True, default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-date",)

    def __str__(self):
        return f"{self.date} - {self.problem.title}"


class Announcement(models.Model):
    CATEGORY_CHOICES = (
        ("contest", "New Contest"),
        ("leaderboard", "Leaderboard Published"),
        ("general", "General Announcement"),
        ("maintenance", "System Maintenance"),
    )
    title = models.CharField(max_length=200)
    content = models.TextField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="general")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.title


class Notification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, null=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"To {self.recipient.username}: {self.title}"


class AptitudeTopic(models.Model):
    title = models.CharField(max_length=200)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subtopics')
    description = models.TextField(blank=True, null=True)
    icon_name = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Aptitude Topics"

    def __str__(self):
        return self.title


class AptitudeQuestion(models.Model):
    topic = models.ForeignKey(AptitudeTopic, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    option_a = models.CharField(max_length=500)
    option_b = models.CharField(max_length=500)
    option_c = models.CharField(max_length=500)
    option_d = models.CharField(max_length=500)
    correct_option = models.CharField(max_length=1)  # A, B, C, or D
    explanation = models.TextField(blank=True, null=True)
    difficulty = models.CharField(max_length=20, choices=(('Easy', 'Easy'), ('Medium', 'Medium'), ('Hard', 'Hard')), default='Easy')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.topic.title} - {self.question_text[:50]}..."


class Achievement(models.Model):
    CATEGORY_CHOICES = [
        ('coding', 'Coding'),
        ('aptitude', 'Aptitude'),
    ]
    name = models.CharField(max_length=100)
    description = models.TextField()
    badge_icon = models.CharField(max_length=50, default="Award")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='coding')
    criteria_type = models.CharField(max_length=50)  # e.g., 'solve_count', 'streak'
    criteria_value = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class UserAchievement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="achievements")
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE)
    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'achievement')

    def __str__(self):
        return f"{self.user.username} - {self.achievement.name}"


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
    all_tests_passed = models.BooleanField(default=False)
    execution_time = models.CharField(max_length=40, blank=True, default="")
    memory = models.CharField(max_length=40, blank=True, default="")
    time_complexity = models.CharField(max_length=20, blank=True, default="")
    space_complexity = models.CharField(max_length=20, blank=True, default="")
    time_spent_seconds = models.PositiveIntegerField(default=0)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-submitted_at",)

    def __str__(self):
        return f"{self.student} - {self.problem.slug} - {self.status}"

    def save(self, *args, **kwargs):
        # Auto-set all_tests_passed based on passed vs total cases
        if self.total_cases > 0:
            self.all_tests_passed = self.passed_cases == self.total_cases
        super().save(*args, **kwargs)
        # Update or create SolvedProblem record when all tests pass
        if self.all_tests_passed:
            try:
                SolvedProblem.objects.get_or_create(
                    student=self.student,
                    problem=self.problem,
                    defaults={
                        "language": self.language,
                        "solved_at": self.submitted_at,
                    },
                )
            except Exception as e:
                # Log error but don't fail the submission
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create SolvedProblem: {e}")


class SolvedProblem(models.Model):
    """Tracks unique problems solved by each student (one record per problem)"""
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="solved_problems",
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="solved_by",
    )
    language = models.CharField(max_length=40, default="JavaScript")
    solved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-solved_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["student", "problem"],
                name="unique_student_problem_solved",
            )
        ]

    def __str__(self):
        return f"{self.student} solved {self.problem.slug}"


class SolvedAptitude(models.Model):
    """Tracks unique aptitude questions solved by each student"""
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name='solved_aptitude',
    )
    question = models.ForeignKey(
        AptitudeQuestion,
        on_delete=models.CASCADE,
        related_name='solved_by',
    )
    solved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "solved_aptitude"
        unique_together = ('student', 'question')
        ordering = ("-solved_at",)

    def __str__(self):
        return f"{self.student} solved aptitude q#{self.question.id}"


class DiscussionMessage(models.Model):
    THREAD_TYPES = (
        ("general", "General Discussion"),
        ("individual", "Direct Message"),
        ("batch", "Batch Discussion"),
        ("staff", "Staff Room"),
        ("hod_tp_ja", "HOD / TPU / JA / TPO Panel"),
        ("problem", "Problem Specific"),
    )

    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="sent_messages",
        null=True,
        blank=True
    )
    recipient = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="received_messages",
        null=True,
        blank=True
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="discussion_messages",
        null=True,
        blank=True
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.SET_NULL,
        related_name="discussion_messages",
        null=True,
        blank=True,
    )
    thread_type = models.CharField(max_length=20, choices=THREAD_TYPES, default="general")
    batch_name = models.CharField(max_length=100, null=True, blank=True)
    institution = models.ForeignKey(
        'Institution',
        on_delete=models.CASCADE,
        related_name="discussion_messages",
        null=True,
        blank=True
    )
    department = models.ForeignKey(
        'Department',
        on_delete=models.CASCADE,
        related_name="discussion_messages",
        null=True,
        blank=True
    )
    body = models.TextField()
    is_poll = models.BooleanField(default=False)
    poll_options = models.JSONField(default=list, blank=True) # list of strings
    poll_votes = models.JSONField(default=dict, blank=True) # {str(user_id): option_index}
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        sender_name = self.sender.username if self.sender else str(self.student)
        return f"{sender_name} -> {self.thread_type}"


class ProblemSession(models.Model):
    """Tracks time spent solving a problem"""
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="problem_sessions",
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    time_spent_seconds = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-started_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["student", "problem", "is_active"],
                condition=models.Q(is_active=True),
                name="unique_active_session_per_student_problem",
            )
        ]

    def __str__(self):
        return f"{self.student} - {self.problem.slug} - {self.time_spent_seconds}s"

    def end_session(self):
        """End the session and calculate total time spent"""
        if self.is_active:
            self.ended_at = timezone.now()
            duration = self.ended_at - self.started_at
            self.time_spent_seconds = int(duration.total_seconds())
            self.is_active = False
            self.save(update_fields=["ended_at", "time_spent_seconds", "is_active"])
        return self.time_spent_seconds


class StaffProfile(models.Model):
    """Staff/Faculty profile with direct password field"""
    
    ROLE_CHOICES = (
        ("staff", "Staff"),
        ("hod", "Head of Department"),
        ("tpu", "TPU (Training & Placement)"),
        ("director", "Director"),
        ("ja", "Junior Admin (JA)"),
        ("admin", "System Admin"),
    )
    
    account = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        null=True,
        blank=True,
    )
    institution = models.ForeignKey(
        Institution,
        on_delete=models.CASCADE,
        related_name="staff",
        null=True,
        blank=True,
    )
    faculty_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=120)
    password = models.CharField(max_length=128, blank=True, default="")  # For first-login flow
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="staff")
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        related_name="staff",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True, help_text="Whether staff can access the system")

    class Meta:
        db_table = "staff_profiles"

    def __str__(self):
        return f"{self.faculty_id} - {self.name} ({self.get_role_display()})"

    @property
    def password_is_set(self):
        return bool(self.password) or bool(self.account and self.account.has_usable_password())

    def set_password(self, raw_password):
        """Hash and store password"""
        from django.contrib.auth.hashers import make_password
        self.password = make_password(raw_password)
        if self.account:
            self.account.set_password(raw_password)
            self.account.save()
        self.save(update_fields=["password"])

    def check_password(self, raw_password):
        """Verify password"""
        from django.contrib.auth.hashers import check_password as check_hash
        # Check staff_profiles password first
        if self.password and check_hash(raw_password, self.password):
            return True
        # Fallback to User account password
        if self.account:
            return self.account.check_password(raw_password)
        return False


class Contest(models.Model):
    """Contests created by staff for their department"""
    CONTEST_STATUS_CHOICES = (
        ("draft", "Draft"),
        ("pending_approval", "Pending Approval"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("published", "Published"),
        ("active", "Active"),
        ("completed", "Completed"),
        ("archived", "Archived"),
    )

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    
    # Who created the contest
    created_by = models.ForeignKey(
        StaffProfile,
        on_delete=models.CASCADE,
        related_name="contests",
    )
    
    # Department and Institution (for filtering)
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name="contests",
        null=True,
        blank=True,
    )
    institution = models.ForeignKey(
        Institution,
        on_delete=models.CASCADE,
        related_name="contests",
        null=True,
        blank=True,
    )
    
    # Contest type
    CONTEST_TYPE_CHOICES = (
        ("programming", "Programming"),
        ("aptitude", "Aptitude"),
    )
    contest_type = models.CharField(
        max_length=20,
        choices=CONTEST_TYPE_CHOICES,
        default="programming",
    )
    
    # Contest details
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    
    # Contest questions
    problems = models.ManyToManyField(
        Problem,
        related_name="contests",
        blank=True,
    )
    aptitude_questions = models.ManyToManyField(
        'AptitudeQuestion',
        related_name="contests",
        blank=True,
    )
    
    # Status and Approval
    status = models.CharField(
        max_length=20,
        choices=CONTEST_STATUS_CHOICES,
        default="draft",
    )
    
    # HOD Approval tracking
    approved_by = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        related_name="approved_contests",
        null=True,
        blank=True,
        help_text="HOD who approved this contest"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    
    # Batch assignment
    assigned_batches = models.JSONField(
        default=list,
        blank=True,
        help_text="List of batch codes assigned to this contest"
    )
    assigned_students = models.ManyToManyField(
        StudentProfile,
        related_name="assigned_contests",
        blank=True,
        help_text="Specific students assigned to this contest"
    )
    
    # Analytics
    total_participants = models.PositiveIntegerField(default=0)
    total_submissions = models.PositiveIntegerField(default=0)
    
    # Winner allocation
    winners_allocated = models.BooleanField(default=False)
    winners_allocated_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_for_approval_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = "contests"
        ordering = ["-created_at"]
    
    def __str__(self):
        return f"{self.title} - {self.created_by.faculty_id} ({self.department.code if self.department else 'No Dept'})"
    
    @property
    def is_active(self):
        """Check if contest is currently active"""
        if self.status != "published":
            return False
        now = timezone.now()
        if self.start_time and self.end_time:
            return self.start_time <= now <= self.end_time
        return False
    
    @property
    def is_ended(self):
        """Check if contest has ended"""
        if self.end_time:
            return timezone.now() > self.end_time
        return False
    
    @property
    def is_upcoming(self):
        """Check if contest is upcoming"""
        if self.start_time:
            return timezone.now() < self.start_time
        return False
    
    def submit_for_approval(self):
        """Submit contest for HOD approval"""
        self.status = "pending_approval"
        self.submitted_for_approval_at = timezone.now()
        self.save(update_fields=['status', 'submitted_for_approval_at'])
    
    def approve(self, hod_profile):
        """Approve contest by HOD"""
        self.status = "approved"
        self.approved_by = hod_profile
        self.approved_at = timezone.now()
        self.save(update_fields=['status', 'approved_by', 'approved_at'])
    
    def reject(self, reason=""):
        """Reject contest"""
        self.status = "rejected"
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejection_reason'])
    
    def publish(self):
        """Publish approved contest to students"""
        if self.status == "approved":
            self.status = "published"
            self.save(update_fields=['status'])
    
    def update_analytics(self):
        """Update contest analytics based on participant activity"""
        if self.contest_type == 'aptitude':
            # Count unique participants from aptitude submissions
            self.total_participants = AptitudeContestSubmission.objects.filter(contest=self).values('student').distinct().count()
            self.total_submissions = AptitudeContestSubmission.objects.filter(contest=self).count()
        else:
            # Count unique participants from programming contest submissions
            self.total_participants = ContestSubmission.objects.filter(contest=self).values('student').distinct().count()
            self.total_submissions = ContestSubmission.objects.filter(contest=self).count()
        
        self.save(update_fields=['total_participants', 'total_submissions'])


class ContestSubmission(models.Model):
    """Submissions made during contests"""
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="contest_submissions",
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="contest_submissions",
    )
    
    # Submission details
    code = models.TextField()
    language = models.CharField(max_length=50)
    status = models.CharField(max_length=50)  # Accepted, Wrong Answer, etc.
    score = models.PositiveIntegerField(default=0)
    
    # Timing
    submitted_at = models.DateTimeField(auto_now_add=True)
    time_taken_seconds = models.PositiveIntegerField(default=0)
    
    class Meta:
        db_table = "contest_submissions"
        ordering = ["-submitted_at"]
    
    def __str__(self):
        return f"{self.student.register_number} - {self.problem.slug} - {self.status}"


class AptitudeContestSubmission(models.Model):
    """Submissions made during aptitude contests"""
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name="aptitude_submissions",
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="aptitude_contest_submissions",
    )
    question = models.ForeignKey(
        AptitudeQuestion,
        on_delete=models.CASCADE,
        related_name="contest_submissions",
    )
    
    selected_option = models.CharField(max_length=1, null=True, blank=True) # A, B, C, D
    is_correct = models.BooleanField(default=False)
    score = models.IntegerField(default=0)
    
    submitted_at = models.DateTimeField(auto_now_add=True)
    time_taken_seconds = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "aptitude_contest_submissions"
        unique_together = ("contest", "student", "question")
        ordering = ["submitted_at"]

    def __str__(self):
        return f"{self.student.register_number} - Q#{self.question.id} - {self.is_correct}"


class ContestParticipation(models.Model):
    """Tracks when students start and complete contests"""
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name="participations",
    )
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="contest_participations",
    )
    
    # Timing
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    time_spent_seconds = models.PositiveIntegerField(default=0)
    
    # Status
    is_active = models.BooleanField(default=True)
    has_started = models.BooleanField(default=True)
    
    # Score
    total_score = models.PositiveIntegerField(default=0)
    problems_solved = models.PositiveIntegerField(default=0)
    total_time_taken = models.PositiveIntegerField(default=0, help_text="Total time taken in seconds")
    
    # Winner allocation
    final_rank = models.PositiveIntegerField(null=True, blank=True)
    is_winner = models.BooleanField(default=False)
    
    class Meta:
        db_table = "contest_participations"
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["contest", "student"],
                name="unique_contest_student_participation"
            )
        ]
    
    def __str__(self):
        return f"{self.student.register_number} - {self.contest.title}"
    
    def end_participation(self):
        """End the contest participation"""
        if self.is_active:
            self.completed_at = timezone.now()
            duration = self.completed_at - self.started_at
            self.time_spent_seconds = int(duration.total_seconds())
            self.is_active = False
            self.save(update_fields=['completed_at', 'time_spent_seconds', 'is_active'])
        return self.time_spent_seconds
