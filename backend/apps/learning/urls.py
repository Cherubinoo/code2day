from django.urls import path

from .views import (
    DashboardView,
    DiscussionMessageListCreateView,
    EditorBootstrapView,
    FirstLoginView,
    HealthCheckView,
    ProblemDetailView,
    ProblemListView,
    ProblemProgressUpdateView,
    CodeRunView,
    RegisterNumberListView,
    StudentLogoutView,
    StudentLoginView,
    StudentLookupView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),

    # Dashboard & problems
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("problems/", ProblemListView.as_view(), name="problem-list"),
    path("problems/progress/", ProblemProgressUpdateView.as_view(), name="problem-progress-update"),
    path("problems/<slug:slug>/", ProblemDetailView.as_view(), name="problem-detail"),

    # Code execution
    path("run/", CodeRunView.as_view(), name="code-run"),

    # Editor bootstrap
    path("editor/bootstrap/", EditorBootstrapView.as_view(), name="editor-bootstrap"),

    # Auth
    path("auth/student/", StudentLookupView.as_view(), name="student-lookup"),
    path("auth/register-numbers/", RegisterNumberListView.as_view(), name="register-number-list"),
    path("auth/first-login/", FirstLoginView.as_view(), name="student-first-login"),
    path("auth/login/", StudentLoginView.as_view(), name="student-login"),
    path("auth/logout/", StudentLogoutView.as_view(), name="student-logout"),

    # Discussions
    path("discussions/", DiscussionMessageListCreateView.as_view(), name="discussion-messages"),
]
