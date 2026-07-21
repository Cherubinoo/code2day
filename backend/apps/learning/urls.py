from django.urls import path

from .views import (
    JADashboardView,
    JABatchListView,
    JABatchDetailView,
    JAStudentCreateView,
    JAStudentUpdateView,
    JAStudentDeleteView,
    JAStudentMoveView,
    JABulkBatchAssignView,
    JABulkSectionAssignView,
    JABulkImportView,
    JAExcelTemplateView,
    JAStudentListView,
    JAImportReportView,
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
    TempDataDiagnosticsView,
    BatchListView,
    BatchStudentsView,
    CampusRankingView,
    ContestApprovalView,
    ContestBatchAssignView,
    ContestPublishView,
    ContestSubmitForApprovalView,
    CSRFTokenView,
    DashboardView,
    DailyLeaderboardView,
    DepartmentStudentsFilterView,
    DiscussionMessageListCreateView,
    DiscussionPollVoteView,
    DiscussionThreadListView,
    EditorBootstrapView,
    FirstLoginView,
    HealthCheckView,
    PasswordResetView,
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
    StudentContestStopView,
    StudentContestSessionStatusView,
    StudentContestSubmitView,
    StudentContestWinnersView,
    StudentLogoutView,
    StudentLoginView,
    StudentLookupView,
    StudentDetailView,
    StudentBlockToggleView,
    StudentIndividualAnalyticsView,
    StudentSelfAnalyticsView,
    UpdateTrackedCompaniesView,
    StaffLookupView,
    StaffFirstLoginView,
    StaffLoginView,
    StaffLogoutView,
    StaffInstitutionDetailView,
    StaffPerformanceView,
    StaffDetailView,
    DepartmentDetailView,
    StaffDeptListView,
    StaffLockToggleView,
    ContestListCreateView,
    ContestDetailView,
    ContestAnalyticsView,
    ContestStudentSubmissionsView,
    UnifiedUserLookupView,
    ExecutorSystemInfoView,
    ExecutorSubmitView,
    AnnouncementListView,
    NotificationListView,
    NotificationMarkReadView,
    AptitudeTopicListView,
    SystemAdminDashboardView,
    PublicInstitutionListView,
    InstitutionManagementView,
    InstitutionDetailManagementView,
    GlobalMaintenanceControlView,
    AdminProblemBankView,
    AdminProblemGenerateTestCasesView,
    AdminProblemTestCasesView,
    AdminProblemTestCaseDetailView,
    AdminLLMProvidersView,
    AdminLLMProviderDetailView,
    AdminLLMProviderParseSnippetView,
    DepartmentManagementView,
    StudentReportPDFView,
    StaffReportPDFView,
    AptitudeQuestionListView,
    AptitudeQuestionSubmitView,
    AptitudeContestSubmitView,
    InstitutionBrandingPreviewView,
    JAStaffListView,
    JABatchAdvisorView,
    JABatchAdvisorDeleteView,
    JAMentorAssignView,
    JAMentorListView,
    StaffMentorDashboardView,
    StaffClassAdvisorDashboardView,
    StudentMentorAdvisorView,
    LabTopicListView,
    LabProblemListView,
    LabProblemDetailView,
    LabSubmitView,
    HODDeptStaffView,
    HODDeptInfoView,
    HODLabAssignmentView,
    HODLabAssignmentDeleteView,
    StaffLabAssignmentView,
    StaffLabSubmissionsView,
    StudentLabAssignmentsView,
    LabAssignmentSubmitView,
    HODLabListView,
    HODLabDetailView,
    StaffLabListView,
    StaffLabExercisesView,
    StaffLabExercisesBulkView,
    StaffExerciseDetailView,
    StaffExerciseGenerateTestCasesView,
    StaffLabStudentsView,
    StudentLabListView,
    StudentLabExercisesView,
    StudentExerciseRunView,
    StudentExerciseSubmitView,
    StudentExerciseReportView,
    StaffLabExerciseStudentReportView,
    HODManageStaffView,
    HODManageStaffDetailView,
    HODCompanyListView,
    HODCompanyDetailView,
)

# Import file management views
from .file_views import (
    InstitutionFilesAPIView,
    InstitutionFileDetailAPIView,
    InstitutionFileDownloadAPIView,
    InstitutionBrandingAPIView,
    InstitutionTemplateGeneratorAPIView,
)

# Import PDF report views
from .pdf_reports import ContestReportPDFView, StudentContestReportPDFView, BatchReportPDFView

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("csrf-token/", CSRFTokenView.as_view(), name="csrf-token"),
    
    # Public endpoints
    path("institutions/", PublicInstitutionListView.as_view(), name="public-institutions"),

    # Dashboard & problems
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("dashboard/tracked-companies/", UpdateTrackedCompaniesView.as_view(), name="update-tracked-companies"),
    path("dashboard/daily/leaderboard/", DailyLeaderboardView.as_view(), name="daily-leaderboard"),
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
    path("student/contests/<int:contest_id>/stop/", StudentContestStopView.as_view(), name="student-contest-stop"),
    path("student/contests/<int:contest_id>/session-status/", StudentContestSessionStatusView.as_view(), name="student-contest-session-status"),
    path("student/contests/<int:contest_id>/winners/", StudentContestWinnersView.as_view(), name="student-contest-winners"),
    path("student/contests/<int:contest_id>/problems/<slug:problem_slug>/", StudentContestProblemView.as_view(), name="student-contest-problem"),
    path("student/contests/<int:contest_id>/problems/<slug:problem_slug>/submit/", StudentContestSubmitView.as_view(), name="student-contest-submit"),
    path("student/contests/<int:contest_id>/aptitude/submit/", AptitudeContestSubmitView.as_view(), name="student-contest-aptitude-submit"),

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
    # System Administration V2
    path("admin/dashboard/", SystemAdminDashboardView.as_view(), name="admin-dashboard-v2"),
    path("admin/v2/institutions/", InstitutionManagementView.as_view(), name="admin-inst-mgmt"),
    path("admin/v2/institutions/<int:pk>/", InstitutionManagementView.as_view(), name="admin-inst-mgmt-detail"),
    path("admin/v2/institutions/<int:pk>/hub/", InstitutionDetailManagementView.as_view(), name="admin-inst-hub"),
    path("admin/v2/global-maintenance/", GlobalMaintenanceControlView.as_view(), name="admin-global-maintenance"),
    path("admin/v2/problem-bank/", AdminProblemBankView.as_view(), name="admin-problem-bank"),
    path("admin/v2/problem-bank/<int:problem_id>/generate-test-cases/", AdminProblemGenerateTestCasesView.as_view(), name="admin-problem-bank-generate"),
    path("admin/v2/problem-bank/<int:problem_id>/test-cases/", AdminProblemTestCasesView.as_view(), name="admin-problem-bank-test-cases"),
    path("admin/v2/problem-bank/<int:problem_id>/test-cases/<int:test_case_id>/", AdminProblemTestCaseDetailView.as_view(), name="admin-problem-bank-test-case-detail"),
    path("admin/v2/llm-providers/", AdminLLMProvidersView.as_view(), name="admin-llm-providers"),
    path("admin/v2/llm-providers/parse-snippet/", AdminLLMProviderParseSnippetView.as_view(), name="admin-llm-provider-parse-snippet"),
    path("admin/v2/llm-providers/<int:provider_id>/", AdminLLMProviderDetailView.as_view(), name="admin-llm-provider-detail"),
    path("admin/v2/institutions/<int:inst_pk>/departments/", DepartmentManagementView.as_view(), name="admin-dept-mgmt"),
    path("admin/v2/institutions/<int:inst_pk>/departments/<int:pk>/", DepartmentManagementView.as_view(), name="admin-dept-mgmt-detail"),
    path("departments/<int:dept_id>/details/", DepartmentDetailView.as_view(), name="department-detail"),

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
    path("batches/<str:batch_code>/report/", BatchReportPDFView.as_view(), name="batch-report-pdf"),

    # Student Management
    path("students/filter/", DepartmentStudentsFilterView.as_view(), name="students-filter"),
    path("students/<str:register_number>/analytics/", StudentIndividualAnalyticsView.as_view(), name="student-analytics"),
    path("student/analytics/", StudentSelfAnalyticsView.as_view(), name="student-self-analytics"),

    # Admin Auth
    path("auth/admin/", AdminLookupView.as_view(), name="admin-lookup"),
    path("auth/admin/first-login/", AdminFirstLoginView.as_view(), name="admin-first-login"),
    path("auth/admin/login/", AdminLoginView.as_view(), name="admin-login"),
    path("auth/admin/logout/", AdminLogoutView.as_view(), name="admin-logout"),

    # Password Reset
    path("auth/password-reset/", PasswordResetView.as_view(), name="password-reset"),

    # Discussions
    path("discussions/", DiscussionMessageListCreateView.as_view(), name="discussion-messages"),
    path("discussions/<int:pk>/vote/", DiscussionPollVoteView.as_view(), name="discussion-poll-vote"),

    # Announcements & Notifications
    path("announcements/", AnnouncementListView.as_view(), name="announcement-list"),
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/<int:notification_id>/read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),
    path("aptitude/topics/", AptitudeTopicListView.as_view(), name="aptitude-topic-list"),
    path("aptitude/questions/", AptitudeQuestionListView.as_view(), name="aptitude-question-list"),
    path("aptitude/questions/submit/", AptitudeQuestionSubmitView.as_view(), name="aptitude-question-submit"),

    path("students/<str:register_number>/report/", StudentReportPDFView.as_view(), name="student-report-pdf"),
    path("staff/<str:faculty_id>/report/", StaffReportPDFView.as_view(), name="staff-report-pdf"),
    path("contests/<int:contest_id>/report/", ContestReportPDFView.as_view(), name="contest-report-pdf"),
    path("contests/<int:contest_id>/students/<str:register_number>/report/", StudentContestReportPDFView.as_view(), name="contest-student-report-pdf"),
    
    # Institution Branding
    path("admin/v2/institutions/<int:pk>/branding/preview/", InstitutionBrandingPreviewView.as_view(), name="institution-branding-preview"),
    path("admin/v2/institutions/<int:pk>/branding/upload-logo/", InstitutionDetailManagementView.as_view(), name="institution-logo-upload"),
    
    # File Management System
    path("admin/v2/institutions/<int:pk>/files/", InstitutionFilesAPIView.as_view(), name="institution-files"),
    path("admin/v2/institutions/<int:pk>/files/<int:file_id>/", InstitutionFileDetailAPIView.as_view(), name="institution-file-detail"),
    path("admin/v2/institutions/<int:pk>/files/<int:file_id>/download/", InstitutionFileDownloadAPIView.as_view(), name="institution-file-download"),
    path("admin/v2/institutions/<int:pk>/branding/assets/", InstitutionBrandingAPIView.as_view(), name="institution-branding-assets"),
    path("admin/v2/institutions/<int:pk>/branding/", InstitutionBrandingAPIView.as_view(), name="institution-branding-settings"),
    path("admin/v2/institutions/<int:pk>/branding/generate-template/", InstitutionTemplateGeneratorAPIView.as_view(), name="institution-template-generator"),
    
    # JA (Junior Admin) endpoints
    path("ja/dashboard/", JADashboardView.as_view(), name="ja-dashboard"),
    path("ja/batches/", JABatchListView.as_view(), name="ja-batch-list"),
    path("ja/batches/<str:batch_code>/", JABatchDetailView.as_view(), name="ja-batch-detail"),
    path("ja/students/", JAStudentListView.as_view(), name="ja-student-list"),
    path("ja/students/create/", JAStudentCreateView.as_view(), name="ja-student-create"),
    path("ja/students/assign-batch/", JABulkBatchAssignView.as_view(), name="ja-bulk-batch-assign"),
    path("ja/students/assign-section/", JABulkSectionAssignView.as_view(), name="ja-bulk-section-assign"),
    path("ja/students/<str:register_number>/update/", JAStudentUpdateView.as_view(), name="ja-student-update"),
    path("ja/students/<str:register_number>/delete/", JAStudentDeleteView.as_view(), name="ja-student-delete"),
    path("ja/students/<str:register_number>/move/", JAStudentMoveView.as_view(), name="ja-student-move"),
    path("ja/import/", JABulkImportView.as_view(), name="ja-bulk-import"),
    path("ja/import/template/", JAExcelTemplateView.as_view(), name="ja-excel-template"),
    path("ja/import/report/", JAImportReportView.as_view(), name="ja-import-report"),
    # JA — advisor & mentor management
    path("ja/staff/", JAStaffListView.as_view(), name="ja-staff-list"),
    path("ja/advisors/", JABatchAdvisorView.as_view(), name="ja-advisors"),
    path("ja/advisors/<str:batch_code>/", JABatchAdvisorDeleteView.as_view(), name="ja-advisor-delete"),
    path("ja/mentors/", JAMentorListView.as_view(), name="ja-mentor-list"),
    path("ja/mentors/assign/", JAMentorAssignView.as_view(), name="ja-mentor-assign"),
    # Staff — mentor & class advisor dashboards
    path("staff/mentor/dashboard/", StaffMentorDashboardView.as_view(), name="staff-mentor-dashboard"),
    path("staff/advisor/dashboard/", StaffClassAdvisorDashboardView.as_view(), name="staff-advisor-dashboard"),
    # Student — mentor/advisor info
    path("student/mentor-advisor/", StudentMentorAdvisorView.as_view(), name="student-mentor-advisor"),

    # Executor Direct API
    path("executor/system_info/", ExecutorSystemInfoView.as_view(), name="executor-system-info"),
    path("executor/submit/", ExecutorSubmitView.as_view(), name="executor-submit"),
    path("discussions/staff-dept-list/", StaffDeptListView.as_view(), name="staff-dept-list"),
    path("discussions/threads/", DiscussionThreadListView.as_view(), name="discussion-threads"),

    # ── Labs (self-paced) ─────────────────────────────────────────────────────
    path("lab/topics/",                             LabTopicListView.as_view(),    name="lab-topic-list"),
    path("lab/topics/<slug:topic_slug>/problems/",  LabProblemListView.as_view(),  name="lab-problem-list"),
    path("lab/problems/<slug:slug>/",               LabProblemDetailView.as_view(),name="lab-problem-detail"),
    path("lab/problems/<slug:slug>/submit/",        LabSubmitView.as_view(),       name="lab-submit"),

    # ── Lab Assignments (Practical Labs) ──────────────────────────────────────
    path("lab/assignments/hod/staff/",                                   HODDeptStaffView.as_view(),         name="hod-dept-staff"),
    path("lab/assignments/hod/dept-info/",                               HODDeptInfoView.as_view(),          name="hod-dept-info"),
    path("lab/assignments/hod/",                                         HODLabAssignmentView.as_view(),     name="hod-lab-assignments"),
    path("lab/assignments/hod/<int:assignment_id>/delete/",              HODLabAssignmentDeleteView.as_view(), name="hod-lab-assignment-delete"),
    path("lab/assignments/staff/",                                       StaffLabAssignmentView.as_view(),   name="staff-lab-assignments"),
    path("lab/assignments/staff/<int:assignment_id>/submissions/",       StaffLabSubmissionsView.as_view(),  name="staff-lab-submissions"),
    path("lab/assignments/student/",                                     StudentLabAssignmentsView.as_view(),name="student-lab-assignments"),
    path("lab/assignments/<int:assignment_id>/problems/<slug:slug>/submit/", LabAssignmentSubmitView.as_view(), name="lab-assignment-submit"),

    # ── Lab V2 (HOD → Staff → Student) ───────────────────────────────────────
    path("lab/v2/",                                                          HODLabListView.as_view(),          name="hod-lab-v2-list"),
    path("lab/v2/staff/",                                                    StaffLabListView.as_view(),         name="staff-lab-v2-list"),
    path("lab/v2/student/",                                                  StudentLabListView.as_view(),       name="student-lab-v2-list"),
    path("lab/v2/<int:lab_id>/",                                             HODLabDetailView.as_view(),         name="hod-lab-v2-detail"),
    path("lab/v2/<int:lab_id>/exercises/",                                   StaffLabExercisesView.as_view(),    name="staff-lab-exercises"),
    path("lab/v2/<int:lab_id>/exercises/bulk/",                              StaffLabExercisesBulkView.as_view(),name="staff-lab-exercises-bulk"),
    path("lab/v2/<int:lab_id>/exercises/<int:exercise_id>/",                 StaffExerciseDetailView.as_view(),  name="staff-exercise-detail"),
    path("lab/v2/<int:lab_id>/exercises/<int:exercise_id>/generate-test-cases/", StaffExerciseGenerateTestCasesView.as_view(), name="staff-exercise-generate-test-cases"),
    path("lab/v2/<int:lab_id>/students/",                                    StaffLabStudentsView.as_view(),     name="staff-lab-students"),
    path("lab/v2/<int:lab_id>/exercises/list/",                              StudentLabExercisesView.as_view(),  name="student-lab-exercises"),
    path("lab/v2/<int:lab_id>/exercises/<int:exercise_id>/run/",             StudentExerciseRunView.as_view(),   name="student-exercise-run"),
    path("lab/v2/<int:lab_id>/exercises/<int:exercise_id>/submit/",          StudentExerciseSubmitView.as_view(),name="student-exercise-submit"),
    path("lab/v2/<int:lab_id>/exercises/<int:exercise_id>/report/",          StudentExerciseReportView.as_view(), name="student-exercise-report"),
    path("lab/v2/<int:lab_id>/exercises/<int:exercise_id>/students/<str:register_number>/report/", StaffLabExerciseStudentReportView.as_view(), name="staff-lab-exercise-student-report"),

    # ── HOD Staff Management ─────────────────────────────────────────────────
    path("hod/staff/",                  HODManageStaffView.as_view(),       name="hod-manage-staff"),
    path("hod/staff/<str:faculty_id>/", HODManageStaffDetailView.as_view(), name="hod-manage-staff-detail"),

    # ── HOD Company Management (Company Based Lab Practical) ─────────────────
    path("hod/companies/",                     HODCompanyListView.as_view(),   name="hod-companies-list"),
    path("hod/companies/<int:company_id>/",    HODCompanyDetailView.as_view(), name="hod-companies-detail"),

    # ── TEMPORARY: data-loss diagnostic, remove after investigation ──────────
    path("_diag/db/<str:token>/", TempDataDiagnosticsView.as_view(), name="temp-data-diagnostics"),
]
