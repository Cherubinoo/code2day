from django.contrib import admin

from .models import Problem, StudentProfile, Submission


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


admin.site.register(Problem)
admin.site.register(Submission)
