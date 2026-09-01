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

    # Maintenance Modes — one flag per StaffProfile/StudentProfile role
    maintenance_staff = models.BooleanField(default=False)
    maintenance_students = models.BooleanField(default=False)
    maintenance_hod = models.BooleanField(default=False)
    maintenance_inst_admin = models.BooleanField(default=False)
    maintenance_ja = models.BooleanField(default=False)
    maintenance_tpu = models.BooleanField(default=False)
    maintenance_director = models.BooleanField(default=False)

    # Branding Information
    display_name = models.CharField(max_length=300, blank=True, default="", help_text="Full display name for reports and headers")
    subheading = models.CharField(max_length=200, blank=True, default="", help_text="Subtitle or tagline")
    logo_url = models.URLField(blank=True, default="", help_text="URL to college logo image")
    logo_file = models.ImageField(upload_to='college_logos/', blank=True, null=True, help_text="Uploaded college logo")
    website = models.URLField(blank=True, default="", help_text="Official website URL")
    established_year = models.PositiveIntegerField(null=True, blank=True, help_text="Year of establishment")
    
    class Meta:
        db_table = "institutions"

    def __str__(self):
        return f"{self.institution_id} - {self.name}"
    
    @property
    def logo_display_url(self):
        """Get the logo URL - prioritize uploaded file over URL"""
        if self.logo_file:
            return self.logo_file.url
        return self.logo_url or ""
    
    def get_display_name(self):
        """Get the display name or fallback to regular name"""
        return self.display_name or self.name


class SystemConfiguration(models.Model):
    """Global system-wide configurations"""
    global_maintenance_staff = models.BooleanField(default=False)
    global_maintenance_students = models.BooleanField(default=False)
    global_maintenance_hod = models.BooleanField(default=False)
    global_maintenance_tpu = models.BooleanField(default=False)
    global_maintenance_director = models.BooleanField(default=False)
    global_maintenance_ja = models.BooleanField(default=False)
    global_maintenance_admin = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "system_configurations"

    def __str__(self):
        return "Global System Configuration"



# Department.name is stored as a short abbreviation (e.g. "CSE", "AD", "Mech")
# rather than the full descriptive title used on official documents/PDFs. This
# maps every abbreviation variant seen in the wild to its official full name.
DEPARTMENT_FULL_NAMES = {
    "AD": "Artificial Intelligence & Data Science (AI&DS)",
    "AIDS": "Artificial Intelligence & Data Science (AI&DS)",
    "AI&DS": "Artificial Intelligence & Data Science (AI&DS)",
    "CSE": "Computer Science & Engineering (CSE)",
    "CSE-AIML": "Computer Science & Engineering (Artificial Intelligence & Machine Learning) (CSE-AIML)",
    "CSEAIML": "Computer Science & Engineering (Artificial Intelligence & Machine Learning) (CSE-AIML)",
    "AIML": "Computer Science & Engineering (Artificial Intelligence & Machine Learning) (CSE-AIML)",
    "CSBS": "Computer Science & Business Systems (CSBS)",
    "IT": "Information Technology (IT)",
    "ECE": "Electronics & Communication Engineering (ECE)",
    "EEE": "Electrical & Electronics Engineering (EEE)",
    "MECH": "Mechanical Engineering (MECH)",
    "CIVIL": "Civil Engineering (CIVIL)",
}


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

    def get_full_name(self):
        """Official descriptive department name for headers/PDFs, e.g. 'CSE' -> 'Computer Science & Engineering (CSE)'."""
        key = (self.name or "").strip().upper().replace(" ", "")
        return DEPARTMENT_FULL_NAMES.get(key, self.name)


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
    section = models.CharField(max_length=5, blank=True, default="")
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
    mentor = models.ForeignKey(
        "StaffProfile",
        on_delete=models.SET_NULL,
        related_name="mentees",
        null=True,
        blank=True,
        help_text="Staff assigned as mentor for this student",
    )
    allow_copy_paste = models.BooleanField(
        default=False,
        help_text="Allow copy/paste and drag-drop in coding workspace for this student",
    )

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
        try:
            login_day = login_day or timezone.localdate()

            if self.last_login_on == login_day:
                StudentActivity.objects.get_or_create(
                    student=self,
                    activity_date=login_day,
                    activity_type="login",
                )
                return False

            if self.current_streak is None:
                self.current_streak = 0
            if self.login_days is None:
                self.login_days = 0

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
        except Exception:
            return False


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
    hints = models.JSONField(default=list, blank=True)  # ["hint1", "hint2"] — legacy, unused by generation
    explanation = models.TextField(blank=True, default="")  # brief LLM-generated approach summary
    editorial = models.TextField(blank=True, default="")
    companies = models.TextField(blank=True, default="")
    source_dataset_id = models.CharField(max_length=50, blank=True, default="")

    EXEC_TYPE_CHOICES = [
        ("auto",        "Auto-detect from code"),
        ("stdin",       "Standard Input / Output"),
        ("function",    "Function-Based"),
        ("class",       "Class / Object-Based"),
        ("interactive", "Interactive"),
    ]
    execution_type = models.CharField(
        max_length=20,
        choices=EXEC_TYPE_CHOICES,
        default="auto",
        help_text="How test-case input is passed to the solution. 'auto' detects from code structure.",
    )
    function_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Explicit function/method name to call. Leave blank to use slug-based detection.",
    )
    param_schema = models.JSONField(
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Optional structured parameter/return-type schema, e.g. "
            '{"params":[{"name":"nums","type":"int[]","order":0},'
            '{"name":"target","type":"int","order":1}],"return_type":"int[]"}. '
            "Types are limited to int/float/double/string/boolean and their [] / [][] array forms "
            "(see services/param_types.py). When null, execution uses the existing regex/heuristic "
            "path unchanged — this field is strictly opt-in per problem."
        ),
    )

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


class SystemUpdate(models.Model):
    """System updates, release notes, and broadcast announcements posted by Admin"""
    ROLE_CHOICES = (
        ("all", "All Roles"),
        ("student", "Students Only"),
        ("staff", "Faculty Only"),
        ("hod", "HODs Only"),
        ("ja", "Junior Admins Only"),
        ("tpu", "TPU Officers Only"),
        ("director", "Directors Only"),
    )
    CATEGORY_CHOICES = (
        ("feature", "New Feature"),
        ("bugfix", "Improvement & Fix"),
        ("announcement", "Announcement"),
    )

    title = models.CharField(max_length=255)
    version = models.CharField(max_length=50, blank=True, default="")
    content = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="feature")
    target_role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="all")
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.target_role.upper()}] {self.title} ({self.version})"


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


class ReadingPassage(models.Model):
    """A passage of text for the Reading Comprehension aptitude section —
    students read the passage, then answer several MCQ questions tied to
    it (AptitudeQuestion.passage), reusing the same question/answer/
    grading machinery as every other aptitude question. Optionally filed
    under a node in the same Category > Topic tree as regular aptitude
    questions, so passages can be organized/browsed alongside them
    instead of only as one flat list."""
    title = models.CharField(max_length=255)
    passage_text = models.TextField()
    topic = models.ForeignKey(AptitudeTopic, on_delete=models.SET_NULL, related_name='reading_passages', null=True, blank=True)
    difficulty = models.CharField(max_length=20, choices=(('Easy', 'Easy'), ('Medium', 'Medium'), ('Hard', 'Hard')), default='Medium')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class AptitudeQuestion(models.Model):
    QUESTION_TYPE_CHOICES = (
        ('MCQ', 'Multiple Choice'),
        ('RC', 'Reading Comprehension'),
    )

    topic = models.ForeignKey(AptitudeTopic, on_delete=models.CASCADE, related_name='questions', null=True, blank=True)
    passage = models.ForeignKey(ReadingPassage, on_delete=models.CASCADE, related_name='questions', null=True, blank=True)
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPE_CHOICES, default='MCQ')
    question_text = models.TextField()
    question_image = models.URLField(max_length=1000, blank=True, default='')
    option_a = models.CharField(max_length=500)
    option_a_image = models.URLField(max_length=1000, blank=True, default='')
    option_b = models.CharField(max_length=500)
    option_b_image = models.URLField(max_length=1000, blank=True, default='')
    option_c = models.CharField(max_length=500)
    option_c_image = models.URLField(max_length=1000, blank=True, default='')
    option_d = models.CharField(max_length=500)
    option_d_image = models.URLField(max_length=1000, blank=True, default='')
    correct_option = models.CharField(max_length=1)  # A, B, C, or D
    explanation = models.TextField(blank=True, null=True)
    difficulty = models.CharField(max_length=20, choices=(('Easy', 'Easy'), ('Medium', 'Medium'), ('Hard', 'Hard')), default='Easy')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        parent = self.topic.title if self.topic else (self.passage.title if self.passage else "Unfiled")
        return f"{parent} - {self.question_text[:50]}..."


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
    input_data = models.JSONField(
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Structured input keyed by the parent Problem.param_schema's param names, e.g. "
            '{"nums": [2,7,11,15], "target": 9}. Only consulted when the parent Problem has a '
            "param_schema; otherwise stdin (unchanged) is used."
        ),
    )

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


class AptitudeAttempt(models.Model):
    """Logs every free-practice aptitude answer — correct or wrong.
    SolvedAptitude only records correct answers, so it can show "questions
    solved" but not real per-topic accuracy; this is what the progress-page
    Study Progress radar is built from."""
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name='aptitude_attempts',
    )
    question = models.ForeignKey(
        AptitudeQuestion,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    selected_option = models.CharField(max_length=1)
    is_correct = models.BooleanField()
    attempted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "aptitude_attempts"
        ordering = ("-attempted_at",)

    def __str__(self):
        return f"{self.student} attempted aptitude q#{self.question_id} ({'correct' if self.is_correct else 'wrong'})"


class DiscussionMessage(models.Model):
    THREAD_TYPES = (
        ("general", "General Discussion"),
        ("individual", "Direct Message"),
        ("batch", "Batch Discussion"),
        ("section", "Section Discussion"),
        ("mentor_group", "Mentor Group Chat"),
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
    section = models.CharField(max_length=5, blank=True, default="")
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
        ("academics", "Academic Coordinator"),
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
    def is_hod(self):
        return self.role in ("hod", "academics", "admin")

    @property
    def is_academic_coordinator(self):
        return self.role == "academics"

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


class BatchAdvisor(models.Model):
    """Assigns a class advisor (staff) to a section within a batch/department."""

    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name="batch_advisors",
    )
    batch = models.CharField(max_length=20, help_text="Batch name e.g. 23-27")
    section = models.CharField(max_length=5, blank=True, default="", help_text="Section A/B/C etc.")
    advisor = models.ForeignKey(
        StaffProfile,
        on_delete=models.CASCADE,
        related_name="advised_batches",
        help_text="Staff member who is the class advisor for this batch/section",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        related_name="batch_advisor_assignments",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "batch_advisors"
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "section", "department"],
                name="unique_batch_section_department_advisor",
            )
        ]

    def __str__(self):
        sec = f" Sec {self.section}" if self.section else ""
        return f"{self.advisor.name} → {self.batch}{sec} ({self.department.code})"


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
        ("combined", "Combined (Coding + Aptitude + Reading)"),
    )
    contest_type = models.CharField(
        max_length=20,
        choices=CONTEST_TYPE_CHOICES,
        default="programming",
    )
    # Only meaningful when contest_type == "combined" — how much each section
    # contributes to the participant's final weighted score. Staff-set,
    # must sum to 100 (enforced in ContestListCreateView.post). Reading
    # questions are AptitudeQuestion rows (question_type="RC") that ride
    # along in `aptitude_questions` alongside regular MCQ questions, so
    # their weight is tracked separately here even though there's no
    # separate M2M for them.
    coding_weight_percent = models.PositiveIntegerField(default=34)
    aptitude_weight_percent = models.PositiveIntegerField(default=33)
    reading_weight_percent = models.PositiveIntegerField(default=33)
    
    # Contest timing - Enhanced for session-based contests
    access_start_time = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="When students can start accessing the contest"
    )
    access_end_time = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="When the contest link expires (no new participants allowed)"
    )
    session_duration_minutes = models.PositiveIntegerField(
        default=60,
        help_text="Individual session time limit in minutes (e.g., 30 min from when student starts)"
    )
    
    # Legacy fields for backward compatibility
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
    assigned_sections = models.JSONField(
        default=list,
        blank=True,
        help_text="List of 'batch::section' strings scoping this contest to specific sections within a batch"
    )
    assigned_students = models.ManyToManyField(
        StudentProfile,
        related_name="assigned_contests",
        blank=True,
        help_text="Specific students assigned to this contest"
    )
    # Security & Anti-Cheat Settings
    enable_tab_switch_check = models.BooleanField(
        default=True,
        help_text="Monitor tab switches and window blur during contest"
    )
    max_tab_switches = models.PositiveIntegerField(
        default=3,
        help_text="Maximum tab switch warnings before auto-submission"
    )
    enable_fullscreen_lock = models.BooleanField(
        default=False,
        help_text="Enforce fullscreen mode during contest"
    )
    enable_copy_paste_lock = models.BooleanField(
        default=False,
        help_text="Disable copy and paste in contest workspace"
    )
    enable_webcam_proctoring = models.BooleanField(
        default=False,
        help_text="Require webcam access and capture periodic snapshots during contest"
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
    
    def is_student_assigned(self, student):
        """Strict check if a student is assigned to this contest (batch, section, or individual)"""
        if self.assigned_students.filter(id=student.id).exists():
            return True

        if self.department and student.department != self.department:
            return False

        # If specific sections are assigned, student MUST match one of the assigned sections
        if self.assigned_sections:
            student_key = f"{student.batch}::{student.section}"
            for entry in self.assigned_sections:
                if isinstance(entry, str):
                    if entry == student_key or entry == student.section:
                        return True
                    if "::" in entry:
                        b, _, s = entry.partition("::")
                        if student.batch == b and student.section == s:
                            return True
                elif isinstance(entry, dict):
                    b = entry.get("batch")
                    s = entry.get("section")
                    if (not b or b == student.batch) and s == student.section:
                        return True
            # Explicit section scoping was set, but student section didn't match any
            return False

        # Otherwise fallback to batch level check
        if self.assigned_batches and student.batch in self.assigned_batches:
            return True

        return False
    
    @property
    def is_active(self):
        """Check if contest is currently accessible for new participants"""
        if self.status != "published":
            return False
        now = timezone.now()
        
        # Use new session-based timing if available
        if self.access_start_time and self.access_end_time:
            return self.access_start_time <= now <= self.access_end_time
        
        # Fallback to legacy timing
        if self.start_time and self.end_time:
            return self.start_time <= now <= self.end_time
        return False
    
    @property
    def is_ended(self):
        """Check if contest access has ended (no new participants allowed)"""
        now = timezone.now()
        
        # Use new session-based timing if available
        if self.access_end_time:
            return now > self.access_end_time
            
        # Fallback to legacy timing
        if self.end_time:
            return now > self.end_time
        return False
    
    @property
    def is_upcoming(self):
        """Check if contest is upcoming"""
        now = timezone.now()
        
        # Use new session-based timing if available
        if self.access_start_time:
            return now < self.access_start_time
            
        # Fallback to legacy timing
        if self.start_time:
            return now < self.start_time
        return False

    @property
    def problem_count(self):
        return self.problems.count()

    @property
    def aptitude_question_count(self):
        return self.aptitude_questions.count()

    @property
    def assigned_student_count(self):
        """Total unique students assigned via individual, batch, or section assignment"""
        q = models.Q(id__in=self.assigned_students.values_list('id', flat=True))
        if self.assigned_batches:
            # We filter by department too to be safe, as batches might not be globally unique
            q |= models.Q(batch__in=self.assigned_batches, department=self.department)
        for entry in self.assigned_sections:
            batch, _, section = str(entry).partition("::")
            if batch and section:
                q |= models.Q(batch=batch, section=section, department=self.department)

        return StudentProfile.objects.filter(q).distinct().count()
    
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
    
    def update_status_if_ended(self):
        """Update contest status to completed if it has ended"""
        if self.status in ["published", "approved"] and self.is_ended:
            self.status = "completed"
            self.save(update_fields=['status'])
            return True
        return False
    
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
    
    # Session-based timing
    started_at = models.DateTimeField(auto_now_add=True)
    session_end_time = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="When this individual session expires (calculated from started_at + session_duration)"
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    time_spent_seconds = models.PositiveIntegerField(default=0)
    
    # Status
    is_active = models.BooleanField(default=True)
    has_started = models.BooleanField(default=True)
    auto_submitted = models.BooleanField(
        default=False,
        help_text="True if contest was auto-submitted due to time expiry"
    )
    manually_stopped = models.BooleanField(
        default=False,
        help_text="True if contest was manually stopped by student"
    )
    is_locked = models.BooleanField(
        default=False,
        help_text="True if contest workspace is locked due to violation limits"
    )
    lock_reason = models.CharField(max_length=255, blank=True, default="")
    snapshots = models.JSONField(
        default=list,
        blank=True,
        help_text="List of webcam snapshots captured during proctoring"
    )
    
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
    
    def save(self, *args, **kwargs):
        # First save to get the started_at timestamp
        is_new = self.pk is None
        super().save(*args, **kwargs)
        
        # Calculate session end time after the first save when we have started_at
        if is_new and not self.session_end_time and self.started_at and self.contest:
            duration_minutes = self.contest.session_duration_minutes or self.contest.duration_minutes
            self.session_end_time = self.started_at + timezone.timedelta(minutes=duration_minutes)
            # Save again to update session_end_time
            super().save(update_fields=['session_end_time'])
    
    @property
    def is_session_expired(self):
        """Check if individual session has expired"""
        if not self.session_end_time:
            return False
        return timezone.now() > self.session_end_time
    
    @property
    def remaining_time_seconds(self):
        """Get remaining time in seconds for this session"""
        if not self.session_end_time or not self.is_active:
            return 0
        remaining = self.session_end_time - timezone.now()
        return max(0, int(remaining.total_seconds()))
    
    def end_participation(self, auto_submitted=False):
        """End the contest participation"""
        if self.is_active:
            self.completed_at = timezone.now()
            duration = self.completed_at - self.started_at
            self.time_spent_seconds = int(duration.total_seconds())
            self.total_time_taken = self.time_spent_seconds
            self.is_active = False
            self.auto_submitted = auto_submitted
            self.save(update_fields=['completed_at', 'time_spent_seconds', 'total_time_taken', 'is_active', 'auto_submitted'])
        return self.time_spent_seconds


# ─── Labs ─────────────────────────────────────────────────────────────────────

class LabTopic(models.Model):
    """A data-structure / algorithm course bucket (e.g. "Arrays", "Trees")."""

    ICON_CHOICES = [
        ("array",     "Array"),
        ("linkedlist","Linked List"),
        ("stack",     "Stack"),
        ("queue",     "Queue"),
        ("tree",      "Tree"),
        ("graph",     "Graph"),
        ("hash",      "Hash / Map"),
        ("sort",      "Sorting"),
        ("search",    "Searching"),
        ("dp",        "Dynamic Programming"),
        ("string",    "Strings"),
        ("recursion", "Recursion"),
        ("math",      "Math"),
        ("other",     "Other"),
    ]

    name        = models.CharField(max_length=80, unique=True)
    slug        = models.SlugField(unique=True)
    description = models.TextField(blank=True, default="")
    icon        = models.CharField(max_length=20, choices=ICON_CHOICES, default="other")
    order       = models.PositiveIntegerField(default=0, help_text="Display order in the grid")
    is_active   = models.BooleanField(default=True)

    class Meta:
        db_table  = "lab_topics"
        ordering  = ("order", "name")

    def __str__(self):
        return self.name


class LabProblem(models.Model):
    """A coding problem that belongs to a LabTopic (separate table from Problem)."""

    DIFFICULTY_CHOICES = [
        ("Easy",   "Easy"),
        ("Medium", "Medium"),
        ("Hard",   "Hard"),
    ]

    EXEC_TYPE_CHOICES = [
        ("auto",        "Auto-detect from code"),
        ("stdin",       "Standard Input / Output"),
        ("function",    "Function-Based"),
        ("class",       "Class / Object-Based"),
        ("interactive", "Interactive"),
    ]

    topic         = models.ForeignKey(LabTopic, on_delete=models.CASCADE, related_name="problems")
    title         = models.CharField(max_length=160)
    slug          = models.SlugField(unique=True)
    description   = models.TextField()
    difficulty    = models.CharField(max_length=10, choices=DIFFICULTY_CHOICES, default="Easy")
    tags          = models.JSONField(default=list, blank=True)
    examples      = models.JSONField(default=list, blank=True)
    hints         = models.JSONField(default=list, blank=True)
    editorial     = models.TextField(blank=True, default="")
    execution_type = models.CharField(max_length=20, choices=EXEC_TYPE_CHOICES, default="auto")
    function_name  = models.CharField(max_length=100, blank=True, default="")
    order          = models.PositiveIntegerField(default=0, help_text="Order within the topic")
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lab_problems"
        ordering = ("topic", "order", "difficulty", "title")

    def __str__(self):
        return f"[{self.topic.name}] {self.title}"


class LabTestCase(models.Model):
    """Test case for a LabProblem."""

    problem         = models.ForeignKey(LabProblem, on_delete=models.CASCADE, related_name="test_cases")
    stdin           = models.TextField(blank=True, default="")
    expected_output = models.TextField()
    is_sample       = models.BooleanField(default=False)
    order           = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "lab_test_cases"
        ordering = ("order",)

    def __str__(self):
        return f"TestCase #{self.order} for {self.problem.slug}"


class LabSubmission(models.Model):
    """Records a student's submission attempt on a LabProblem."""

    student        = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="lab_submissions")
    problem        = models.ForeignKey(LabProblem, on_delete=models.CASCADE, related_name="submissions")
    language       = models.CharField(max_length=40)
    language_id    = models.PositiveIntegerField()
    source_code    = models.TextField()
    status         = models.CharField(max_length=40, default="Attempted")
    passed_cases   = models.PositiveIntegerField(default=0)
    total_cases    = models.PositiveIntegerField(default=0)
    all_passed     = models.BooleanField(default=False)
    execution_time = models.CharField(max_length=40, blank=True, default="")
    memory         = models.CharField(max_length=40, blank=True, default="")
    submitted_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lab_submissions"
        ordering = ("-submitted_at",)

    def __str__(self):
        return f"{self.student} – {self.problem.slug} – {self.status}"


class LabAssignment(models.Model):
    """A practical lab assignment created by HOD for a specific batch."""

    lab_topic    = models.ForeignKey(LabTopic, on_delete=models.CASCADE, related_name="assignments")
    name         = models.CharField(max_length=200, help_text="e.g. 'Array Lab – Semester 1'")
    subject      = models.CharField(max_length=200, blank=True, default="")
    assigned_staff = models.ForeignKey(
        StaffProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="lab_assignments", help_text="Staff who monitors this lab"
    )
    created_by   = models.ForeignKey(
        StaffProfile, on_delete=models.CASCADE, related_name="created_lab_assignments"
    )
    department   = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="lab_assignments"
    )
    batch        = models.CharField(max_length=20, blank=True, default="")
    year         = models.CharField(max_length=5, blank=True, default="")
    section      = models.CharField(max_length=10, blank=True, default="")
    start_date   = models.DateTimeField(null=True, blank=True, help_text="When the lab opens for students")
    deadline     = models.DateTimeField(help_text="When the lab closes (end date)")
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lab_assignments"
        ordering = ("-created_at",)

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.deadline

    def __str__(self):
        return self.name


class LabAssignmentSubmission(models.Model):
    """One student's solved submission for a specific problem inside a LabAssignment."""

    assignment  = models.ForeignKey(LabAssignment, on_delete=models.CASCADE, related_name="submissions")
    student     = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="lab_assignment_submissions")
    problem     = models.ForeignKey(LabProblem, on_delete=models.CASCADE, related_name="assignment_submissions")
    language    = models.CharField(max_length=40)
    language_id = models.PositiveIntegerField(default=71)
    source_code = models.TextField()
    output      = models.TextField(blank=True, default="")
    status      = models.CharField(max_length=40, default="Attempted")
    passed_cases = models.PositiveIntegerField(default=0)
    total_cases  = models.PositiveIntegerField(default=0)
    all_passed   = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lab_assignment_submissions"
        ordering = ("-updated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student", "problem"],
                name="unique_lab_assignment_student_problem",
            )
        ]

    def __str__(self):
        return f"{self.student} – {self.assignment.name} – {self.problem.slug} – {self.status}"


# ─────────────────────────────────────────────────────────────────────────────
# Lab V2  (simple practical lab management — no test-case execution)
# ─────────────────────────────────────────────────────────────────────────────

LAB_LANGUAGE_CHOICES = ["Python", "C", "C++", "Java"]


def default_lab_languages():
    return list(LAB_LANGUAGE_CHOICES)


class Company(models.Model):
    """A company a HOD sets up for company-specific ("Company Based") lab practicals."""

    name        = models.CharField(max_length=200)
    department  = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="companies"
    )
    created_by  = models.ForeignKey(
        StaffProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_companies"
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "companies"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(fields=["department", "name"], name="unique_company_per_department")
        ]

    def __str__(self):
        return self.name


class Lab(models.Model):
    """Lab container created by HOD — groups exercises for a batch/section."""

    LAB_TYPE_CHOICES = (
        ("practical", "Lab Practical"),
        ("company", "Company Based Lab Practical"),
        ("university", "University Lab Practical"),
    )

    name            = models.CharField(max_length=200)
    department      = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="labs"
    )
    batch           = models.CharField(max_length=20)
    section         = models.CharField(max_length=10, blank=True, default="")
    start_date      = models.DateTimeField()
    end_date        = models.DateTimeField()
    staff_in_charge = models.ForeignKey(
        StaffProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="managed_labs"
    )
    created_by      = models.ForeignKey(
        StaffProfile, on_delete=models.SET_NULL, null=True,
        related_name="created_labs"
    )
    is_active       = models.BooleanField(default=True)
    approval_status = models.CharField(max_length=20, default="approved") # pending_approval, approved, rejected
    is_published    = models.BooleanField(default=True)
    enable_tab_switch_check = models.BooleanField(default=False)
    max_tab_switches       = models.IntegerField(default=3)
    enable_fullscreen_lock = models.BooleanField(default=False)
    enable_copy_paste_lock = models.BooleanField(default=False)
    created_at      = models.DateTimeField(auto_now_add=True)
    lab_type        = models.CharField(max_length=20, choices=LAB_TYPE_CHOICES, default="practical")
    company         = models.OneToOneField(
        Company, on_delete=models.CASCADE, null=True, blank=True, related_name="lab"
    )
    linked_lab      = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name="university_labs"
    )
    allowed_languages = models.JSONField(default=default_lab_languages)
    pass_threshold_percent = models.PositiveIntegerField(
        default=70,
        help_text="Minimum percentage of an exercise's test cases that must pass for a student's submission to be accepted",
    )

    class Meta:
        db_table = "labs"
        ordering = ("-created_at",)

    @property
    def is_expired(self):
        return timezone.now() > self.end_date

    def __str__(self):
        return self.name


class LabExercise(models.Model):
    """An exercise (problem statement) added by staff to a Lab."""

    lab         = models.ForeignKey(Lab, on_delete=models.CASCADE, related_name="exercises")
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    explanation = models.TextField(blank=True, default="")  # brief LLM-generated approach summary
    order       = models.PositiveIntegerField(default=0)
    difficulty  = models.CharField(max_length=20, default="Medium")
    added_by    = models.ForeignKey(
        StaffProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="added_exercises"
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lab_exercises"
        ordering = ("order", "created_at")

    def __str__(self):
        return f"{self.lab.name} – {self.title}"


class LabExerciseTestCase(models.Model):
    """Reference test case for a LabExercise — stored data only, not auto-graded."""

    exercise        = models.ForeignKey(LabExercise, on_delete=models.CASCADE, related_name="test_cases")
    stdin           = models.TextField(blank=True, default="")
    expected_output = models.TextField()
    is_sample       = models.BooleanField(default=False)
    order           = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "lab_exercise_test_cases"
        ordering = ("order",)

    def __str__(self):
        return f"TestCase #{self.order} for {self.exercise_id}"


class LabExerciseSubmission(models.Model):
    """Student code submission for one LabExercise."""

    exercise     = models.ForeignKey(LabExercise, on_delete=models.CASCADE, related_name="submissions")
    student      = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="exercise_submissions")
    code         = models.TextField(blank=True, default="")
    language     = models.CharField(max_length=50, blank=True, default="")
    submitted_at = models.DateTimeField(auto_now=True)
    # The actual test-case results from the run that got this submission
    # accepted — stored so the lab report can reuse them verbatim instead of
    # re-executing the code later, which could legitimately produce a
    # different result (timing, executor flakiness) than what the student
    # was shown at submit time.
    passed_cases = models.PositiveIntegerField(default=0)
    total_cases  = models.PositiveIntegerField(default=0)
    test_results = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "lab_exercise_submissions"
        unique_together = [["exercise", "student"]]
        ordering = ("-submitted_at",)

    def __str__(self):
        return f"{self.student} → {self.exercise}"


class LLMProvider(models.Model):
    """
    A configured LLM API endpoint used for automatic test case generation.
    With many providers configured, requests round-robin across them —
    each generation call uses whichever active provider was used longest
    ago (see last_used_at), falling through to the next-least-recently-used
    one only if that call errors or times out. Add a new row here (no
    redeploy needed) to add another provider to the rotation.
    """

    name = models.CharField(max_length=80, unique=True, help_text="Short label, e.g. 'DeepSeek V4 Pro (NVIDIA)'")
    base_url = models.CharField(max_length=255, help_text="OpenAI-compatible base URL, e.g. https://integrate.api.nvidia.com/v1")
    api_key = models.CharField(max_length=255)
    model_name = models.CharField(max_length=120)
    priority = models.PositiveIntegerField(default=0, help_text="Tie-breaker when last_used_at is equal (e.g. never used) — lower goes first")
    is_active = models.BooleanField(default=True)
    use_streaming = models.BooleanField(default=True, help_text="Whether this endpoint requires stream=True (SSE) responses")
    temperature = models.FloatField(default=0.4)
    top_p = models.FloatField(default=0.95)
    max_tokens = models.PositiveIntegerField(default=16384)
    timeout_seconds = models.PositiveIntegerField(default=45)
    extra_body = models.JSONField(
        default=dict, blank=True,
        help_text='Provider-specific request extras, e.g. {"chat_template_kwargs": {"thinking": false}}',
    )
    last_used_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Set automatically each time this provider is picked for a request — drives round-robin selection.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "llm_providers"
        ordering = ("priority", "id")

    def __str__(self):
        return f"{self.name} ({'active' if self.is_active else 'disabled'}, priority={self.priority})"


class LabExerciseReport(models.Model):
    """
    A generated "lab record" PDF for one student's LabExercise submission —
    Exp No / Aim / Algorithm / Program / Output / Result, watermarked with
    the student's register number. Deliberately snapshots aim/algorithm/
    program/output/result at generation time (rather than re-reading the
    live submission) so the record stays a stable, immutable copy even if
    the student later edits and resubmits different code.
    """

    submission = models.OneToOneField(
        LabExerciseSubmission, on_delete=models.CASCADE, related_name="report"
    )
    exp_no = models.PositiveIntegerField(default=0)
    exp_name = models.CharField(max_length=200, blank=True, default="")
    aim = models.TextField(blank=True, default="")
    algorithm = models.TextField(blank=True, default="")
    program = models.TextField(blank=True, default="")
    output = models.TextField(blank=True, default="")
    result = models.TextField(blank=True, default="")
    pdf_file = models.FileField(upload_to="lab_reports/", blank=True, null=True)
    generated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class LabStudentSession(models.Model):
    """Tracks anti-cheat security status, violations, and locking for a student in a Lab."""
    lab              = models.ForeignKey(Lab, on_delete=models.CASCADE, related_name="student_sessions")
    student          = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="lab_sessions")
    is_locked        = models.BooleanField(default=False)
    tab_switch_count = models.IntegerField(default=0)
    lock_reason      = models.CharField(max_length=255, blank=True, default="")
    locked_at        = models.DateTimeField(null=True, blank=True)
    sub_batch        = models.CharField(max_length=50, blank=True, default="Batch 1")
    updated_at       = models.DateTimeField(auto_now=True)
    allocated_exercises = models.ManyToManyField(
        LabExercise, blank=True, related_name="allocated_sessions"
    )

    class Meta:
        db_table = "lab_student_sessions"
        unique_together = (("lab", "student"),)

    def __str__(self):
        return f"{self.student.register_number} - {self.lab.name} ({'Locked' if self.is_locked else 'Active'})"

    def __str__(self):
        return f"Report for {self.submission}"
