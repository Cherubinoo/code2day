import logging

from django.contrib import admin, messages

from .models import (
    ExecutionRecord, Problem, ProblemSolution, StudentProfile, Submission, TestCase,
    LabTopic, LabProblem, LabTestCase, LabSubmission, LLMProvider, LabExerciseReport,
)
from .services.testcase_generator import generate_test_cases, derive_examples, TestCaseGenError

logger = logging.getLogger(__name__)


@admin.register(LLMProvider)
class LLMProviderAdmin(admin.ModelAdmin):
    """Fallback chain for automatic test case generation — tried in priority
    order (lowest first). Add a row here to add a new fallback provider, or
    toggle is_active off to take one out of rotation, without a redeploy."""
    list_display = ("name", "priority", "is_active", "model_name", "use_streaming", "updated_at")
    list_editable = ("priority", "is_active")
    list_filter = ("is_active", "use_streaming")
    fields = (
        "name", "priority", "is_active",
        "base_url", "api_key", "model_name", "use_streaming",
        "temperature", "top_p", "max_tokens", "timeout_seconds", "extra_body",
    )


@admin.register(LabExerciseReport)
class LabExerciseReportAdmin(admin.ModelAdmin):
    list_display = ("__str__", "exp_no", "exp_name", "generated_at")
    search_fields = ("exp_name", "submission__student__register_number")
    readonly_fields = ("submission", "generated_at", "updated_at")


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = (
        "register_number",
        "name",
        "personal_email",
        "mobile_number",
        "current_streak",
        "login_days",
        "password_is_set",
    )
    search_fields = ("register_number", "name", "personal_email", "mobile_number")


@admin.register(TestCase)
class TestCaseAdmin(admin.ModelAdmin):
    list_display = ("problem", "order", "is_sample")
    list_filter = ("problem", "is_sample")


@admin.register(ProblemSolution)
class ProblemSolutionAdmin(admin.ModelAdmin):
    list_display = ("student", "problem", "language", "status", "passed_cases", "total_cases", "submitted_at")
    list_filter = ("status", "language")
    search_fields = ("student__register_number", "problem__slug")


class TestCaseInline(admin.TabularInline):
    model = TestCase
    extra = 0
    fields = ("order", "stdin", "expected_output", "input_data", "is_sample")


@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "difficulty", "execution_type", "is_daily", "test_case_count")
    list_filter = ("difficulty", "execution_type", "is_daily")
    search_fields = ("title", "slug")
    inlines = [TestCaseInline]
    actions = ["generate_missing_test_cases"]

    # Cap per click — each generation is a real LLM call (up to ~60s in the
    # worst case if the primary provider times out and it falls back), and
    # this runs synchronously inside one admin request.
    GENERATE_ACTION_CAP = 10

    def test_case_count(self, obj):
        return obj.test_cases.count()

    @admin.action(description="Generate test cases for selected problems (skips ones that already have any)")
    def generate_missing_test_cases(self, request, queryset):
        candidates = [p for p in queryset if not p.test_cases.exists()]
        capped = candidates[: self.GENERATE_ACTION_CAP]
        skipped_existing = queryset.count() - len(candidates)

        generated_total = 0
        failed = []
        for problem in capped:
            try:
                generated = generate_test_cases(
                    title=problem.title, description=problem.description, examples=problem.examples,
                    difficulty=problem.difficulty,
                )
            except TestCaseGenError as exc:
                failed.append(problem.title)
                logger.warning("Bulk test-case generation failed for %r: %s", problem.slug, exc)
                continue
            for order, case in enumerate(generated, start=1):
                TestCase.objects.create(
                    problem=problem, stdin=case["stdin"], expected_output=case["expected_output"],
                    is_sample=case["is_sample"], order=order,
                )
            if not problem.examples:
                problem.examples = derive_examples(generated)
                problem.save(update_fields=["examples"])
            generated_total += len(generated)

        msg = f"Generated test cases for {len(capped) - len(failed)} problem(s) ({generated_total} test cases total)."
        if skipped_existing:
            msg += f" Skipped {skipped_existing} that already had test cases."
        if len(candidates) > self.GENERATE_ACTION_CAP:
            msg += f" Only processed the first {self.GENERATE_ACTION_CAP} — select fewer at a time or re-run for the rest."
        if failed:
            msg += f" Failed for: {', '.join(failed)}."
        self.message_user(request, msg, level=messages.WARNING if failed else messages.INFO)

    def save_model(self, request, obj, form, change):
        # Saving (including bulk imports that go through this ModelAdmin)
        # only ever creates/updates the Problem row — test cases are always
        # a separate, explicit step via the "Generate test cases" action
        # above or the admin bank's per-problem Generate button, never
        # triggered automatically on save.
        super().save_model(request, obj, form, change)


admin.site.register(Submission)
admin.site.register(ExecutionRecord)


# ─── Labs ─────────────────────────────────────────────────────────────────────

class LabTestCaseInline(admin.TabularInline):
    model = LabTestCase
    extra = 1
    fields = ("order", "stdin", "expected_output", "is_sample")


class LabProblemInline(admin.TabularInline):
    model = LabProblem
    extra = 0
    fields = ("order", "title", "slug", "difficulty", "is_active")
    show_change_link = True


@admin.register(LabTopic)
class LabTopicAdmin(admin.ModelAdmin):
    list_display  = ("name", "slug", "icon", "order", "is_active")
    list_editable = ("order", "is_active")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [LabProblemInline]


@admin.register(LabProblem)
class LabProblemAdmin(admin.ModelAdmin):
    list_display  = ("title", "topic", "difficulty", "order", "is_active", "created_at")
    list_filter   = ("topic", "difficulty", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [LabTestCaseInline]


@admin.register(LabSubmission)
class LabSubmissionAdmin(admin.ModelAdmin):
    list_display  = ("student", "problem", "language", "status", "passed_cases", "total_cases", "all_passed", "submitted_at")
    list_filter   = ("status", "all_passed", "language")
    search_fields = ("student__register_number", "problem__slug")
