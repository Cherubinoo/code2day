from django.urls import path

from .views import (
    DashboardView,
    DiscussionMessageListCreateView,
    EditorBootstrapView,
    FirstLoginView,
    ProblemListView,
    ProblemProgressUpdateView,
    RegisterNumberListView,
    StudentLogoutView,
    StudentLoginView,
    StudentLookupView,
)

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("problems/", ProblemListView.as_view(), name="problem-list"),
    path("problems/progress/", ProblemProgressUpdateView.as_view(), name="problem-progress-update"),
    path("editor/bootstrap/", EditorBootstrapView.as_view(), name="editor-bootstrap"),
    path("auth/student/", StudentLookupView.as_view(), name="student-lookup"),
    path("auth/register-numbers/", RegisterNumberListView.as_view(), name="register-number-list"),
    path("auth/first-login/", FirstLoginView.as_view(), name="student-first-login"),
    path("auth/login/", StudentLoginView.as_view(), name="student-login"),
    path("auth/logout/", StudentLogoutView.as_view(), name="student-logout"),
    path("discussions/", DiscussionMessageListCreateView.as_view(), name="discussion-messages"),
]
