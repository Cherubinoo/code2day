from django.contrib import admin

from .models import (
    ExecutionRecord, Problem, ProblemSolution, StudentProfile, Submission, TestCase,
    LabTopic, LabProblem, LabTestCase, LabSubmission,
)


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


admin.site.register(Problem)
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
