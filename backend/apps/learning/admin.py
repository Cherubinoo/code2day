from django.contrib import admin

from .models import ExecutionRecord, Problem, ProblemSolution, StudentProfile, Submission, TestCase


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
