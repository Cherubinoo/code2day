from django.urls import path

from .views import (
    AdminStatsView,
    AdminUserListView,
    AdminInstitutionListCreateView,
    AdminInstitutionDetailView,
    AdminInstitutionFullDetailView,
    AdminInstitutionStaffView,
    AdminStaffRoleUpdateView,
    AdminAWSStatsView,
    AdminAssignUserToInstitutionView,
    AdminLookupView,
    AdminFirstLoginView,
    AdminLoginView,
    AdminLogoutView,
    BatchListView,
    BatchStudentsView,
    CampusRankingView,
    ContestApprovalView,
    ContestBatchAssignView,
    ContestPublishView,
    ContestSubmitForApprovalView,
    DashboardView,
    DepartmentStudentsFilterView,
    DiscussionMessageListCreateView,
    EditorBootstrapView,
    FirstLoginView,
    HealthCheckView,
    ProblemDetailView,
    ProblemListView,
    ProblemProgressUpdateView,
    ProblemSessionStartView,
    ProblemSessionEndView,
    ProblemsByTopicView,
    CodeRunView,
    RegisterNumberListView,
    StudentContestDetailView,
    StudentContestListView,
    StudentContestProblemView,
    StudentContestStartView,
    StudentContestAutoSubmitView,
    StudentContestSubmitView,
    StudentLogoutView,
    StudentLoginView,
    StudentLookupView,
    StudentDetailView,
    StudentBlockToggleView,
    StudentIndividualAnalyticsView,
    StaffLookupView,
    StaffFirstLoginView,
    StaffLoginView,
    StaffLogoutView,
    StaffInstitutionDetailView,
    StaffPerformanceView,
    StaffDetailView,
    StaffLockToggleView,
    ContestListCreateView,
    ContestDetailView,
    ContestAnalyticsView,
    ContestStudentSubmissionsView,
    UnifiedUserLookupView,
    Judge0SystemInfoView,
    Judge0SubmitView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),

    # Dashboard & problems
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("ranking/", CampusRankingView.as_view(), name="campus-ranking"),
    path("problems/", ProblemListView.as_view(), name="problem-list"),
    path("problems/by-topic/", ProblemsByTopicView.as_view(), name="problems-by-topic"),
    path("problems/progress/", ProblemProgressUpdateView.as_view(), name="problem-progress-update"),
    path("problems/<slug:slug>/", ProblemDetailView.as_view(), name="problem-detail"),

    # Problem sessions - timing
    path("problems/<slug:slug>/session/start/", ProblemSessionStartView.as_view(), name="problem-session-start"),
    path("problems/<slug:slug>/session/end/", ProblemSessionEndView.as_view(), name="problem-session-end"),

    # Student Contests
    path("student/contests/", StudentContestListView.as_view(), name="student-contest-list"),
    path("student/contests/<int:contest_id>/", StudentContestDetailView.as_view(), name="student-contest-detail"),
    path("student/contests/<int:contest_id>/start/", StudentContestStartView.as_view(), name="student-contest-start"),
    path("student/contests/<int:contest_id>/auto-submit/", StudentContestAutoSubmitView.as_view(), name="student-contest-auto-submit"),
    path("student/contests/<int:contest_id>/problems/<slug:problem_slug>/", StudentContestProblemView.as_view(), name="student-contest-problem"),
    path("student/contests/<int:contest_id>/problems/<slug:problem_slug>/submit/", StudentContestSubmitView.as_view(), name="student-contest-submit"),

    # Code execution
    path("run/", CodeRunView.as_view(), name="code-run"),

    # Editor bootstrap
    path("editor/bootstrap/", EditorBootstrapView.as_view(), name="editor-bootstrap"),

    # Unified User Lookup (checks student, staff, admin)
    path("auth/lookup/", UnifiedUserLookupView.as_view(), name="unified-user-lookup"),

    # Student Auth
    path("auth/student/", StudentLookupView.as_view(), name="student-lookup"),
    path("auth/register-numbers/", RegisterNumberListView.as_view(), name="register-number-list"),
    path("auth/first-login/", FirstLoginView.as_view(), name="student-first-login"),
    path("auth/login/", StudentLoginView.as_view(), name="student-login"),
    path("auth/logout/", StudentLogoutView.as_view(), name="student-logout"),

    # Staff/Faculty Auth
    path("auth/staff/", StaffLookupView.as_view(), name="staff-lookup"),
    path("auth/staff/first-login/", StaffFirstLoginView.as_view(), name="staff-first-login"),
    path("auth/staff/login/", StaffLoginView.as_view(), name="staff-login"),
    path("auth/staff/logout/", StaffLogoutView.as_view(), name="staff-logout"),

    # Admin endpoints
    path("admin/stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("admin/users/", AdminUserListView.as_view(), name="admin-users"),
    path("admin/institutions/", AdminInstitutionListCreateView.as_view(), name="admin-institutions"),
    path("admin/institutions/<int:institution_id>/", AdminInstitutionDetailView.as_view(), name="admin-institution-detail"),
    path("admin/institutions/<int:institution_id>/details/", AdminInstitutionFullDetailView.as_view(), name="admin-institution-full-detail"),
    path("admin/institutions/<int:institution_id>/staff/", AdminInstitutionStaffView.as_view(), name="admin-institution-staff"),
    path("admin/staff/<str:faculty_id>/role/", AdminStaffRoleUpdateView.as_view(), name="admin-staff-role-update"),
    path("admin/aws-stats/", AdminAWSStatsView.as_view(), name="admin-aws-stats"),
    path("admin/assign-user/", AdminAssignUserToInstitutionView.as_view(), name="admin-assign-user"),

    # Staff Institution
    path("staff/institutions/<int:institution_id>/details/", StaffInstitutionDetailView.as_view(), name="staff-institution-detail"),
    path("staff/institutions/<int:institution_id>/performance/", StaffPerformanceView.as_view(), name="staff-performance"),
    path("staff/<str:faculty_id>/details/", StaffDetailView.as_view(), name="staff-detail"),
    path("staff/<str:faculty_id>/lock/", StaffLockToggleView.as_view(), name="staff-lock-toggle"),

    # Student Details
    path("students/<str:register_number>/details/", StudentDetailView.as_view(), name="student-detail"),
    path("students/<str:register_number>/block/", StudentBlockToggleView.as_view(), name="student-block-toggle"),

    # Contests
    path("contests/", ContestListCreateView.as_view(), name="contest-list"),
    path("contests/<int:pk>/", ContestDetailView.as_view(), name="contest-detail"),
    path("contests/<int:pk>/analytics/", ContestAnalyticsView.as_view(), name="contest-analytics"),
    path("contests/<int:contest_id>/student/<str:register_number>/submissions/", ContestStudentSubmissionsView.as_view(), name="contest-student-submissions"),
    path("contests/<int:contest_id>/assign-batches/", ContestBatchAssignView.as_view(), name="contest-batch-assign"),
    path("contests/<int:contest_id>/submit-for-approval/", ContestSubmitForApprovalView.as_view(), name="contest-submit-approval"),
    path("contests/<int:contest_id>/approve/", ContestApprovalView.as_view(), name="contest-approve"),
    path("contests/<int:contest_id>/publish/", ContestPublishView.as_view(), name="contest-publish"),

    # Batch Management
    path("batches/", BatchListView.as_view(), name="batch-list"),
    path("batches/<str:batch_code>/students/", BatchStudentsView.as_view(), name="batch-students"),

    # Student Management
    path("students/filter/", DepartmentStudentsFilterView.as_view(), name="students-filter"),
    path("students/<str:register_number>/analytics/", StudentIndividualAnalyticsView.as_view(), name="student-analytics"),

    # Admin Auth
    path("auth/admin/", AdminLookupView.as_view(), name="admin-lookup"),
    path("auth/admin/first-login/", AdminFirstLoginView.as_view(), name="admin-first-login"),
    path("auth/admin/login/", AdminLoginView.as_view(), name="admin-login"),
    path("auth/admin/logout/", AdminLogoutView.as_view(), name="admin-logout"),

    # Discussions
    path("discussions/", DiscussionMessageListCreateView.as_view(), name="discussion-messages"),

    # Judge0 Direct API
    path("judge0/system_info/", Judge0SystemInfoView.as_view(), name="judge0-system-info"),
    path("judge0/submit/", Judge0SubmitView.as_view(), name="judge0-submit"),
]
