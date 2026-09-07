"""Every import apps/learning/views.py used to need at module scope, kept
verbatim and in one place so every other module in this package can do
`from ._imports import *` and be guaranteed to have whatever the original
monolithic views.py had in scope — this is what makes the split below safe
even though the class-to-file classification is a best-effort judgment call
in a few ambiguous cases: a class landing in an unexpected file can never
fail with a missing import."""
import glob
import logging
import mimetypes
import os
import re
import threading
from collections import defaultdict
from datetime import date, timedelta

from io import BytesIO
from django.core.files.base import ContentFile
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum, Avg, Max, Max, Exists, OuterRef
from django.http import HttpResponse, FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..auth_utils import RateLimitExceeded, StudentAuthMixin, UnifiedAuthMixin, check_rate_limit
from ..data import FALLBACK_DASHBOARD, FALLBACK_PROBLEMS
from ..module_registry import MODULE_KEYS, serializable_registry
from ..drive_image_cache import cached_image_path, fetch_and_cache_drive_image, DriveImageFetchError
from ..models import (
    BatchAdvisor,
    Contest,
    ContestParticipation,
    ContestSubmission,
    DiscussionMessage,
    ExecutionRecord,
    Institution,
    Problem,
    ProblemSession,
    ProblemSolution,
    SolvedProblem,
    TestCase,
    StaffProfile,
    StudentActivity,
    StudentProfile,
    Submission,
    DailyProblem,
    Announcement,
    Notification,
    SystemUpdate,
    AptitudeTopic,
    AptitudeQuestion,
    AptitudeExplanationAuditRun,
    ReadingPassage,
    Achievement,
    UserAchievement,
    SystemConfiguration,
    Department,
    SolvedAptitude,
    AptitudeAttempt,
    AptitudeContestSubmission,
    LabTopic,
    LabProblem,
    LabTestCase,
    LabSubmission,
    LabAssignment,
    LabAssignmentSubmission,
    Lab,
    LabExercise,
    LabExerciseSubmission,
    LabExerciseTestCase,
    LabExerciseReport,
    LabStudentSession,
    LLMProvider,
    LLMUsageLog,
    Company,
    LAB_LANGUAGE_CHOICES,
    Examination,
    SyllabusSection,
    SyllabusTopic,
    SyllabusSubtopic,
    CompetitiveQuestion,
    SyllabusFolder,
    SyllabusFolderMedia,
    QuestionUsageMark,
    PasswordResetOTP,
    ProblemMetadataGenerationRun,
    InterviewTrack,
    InterviewTopic,
    InterviewFolder,
    InterviewFolderMedia,
    InterviewQuestion,
    SqlFrogProgress,
)
from ..db_manager import create_institution_db, delete_institution_db
from ..serializers import (
    CodeRunSerializer,
    DEFAULT_PRACTICE_LANGUAGES,
    DiscussionMessageCreateSerializer,
    DiscussionMessageSerializer,
    FirstLoginSerializer,
    ProblemDetailSerializer,
    ProblemProgressUpdateSerializer,
    ProblemSerializer,
    StaffProfileSerializer,
    StudentLoginSerializer,
    StudentLookupListSerializer,
    StudentProfileSerializer,
)
from ..services.judge0 import (
    Judge0ServiceError,
    Judge0TimeoutError,
)
from ..sql_frog_levels import WORLD_1_LEVELS, WORLD_1_LEVELS_BY_ID, FUTURE_WORLDS
from ..services.reading_qa_import import create_passages_in_db, parse_workbook_to_passages
from ..services.execution_adapter import (
    normalize_comparable_output,
    prepare_execution_payload,
    compare_typed_output,
    compare_design_output,
)
from ..services.problem_testcases import build_runtime_test_cases
from ..services.complexity_analyzer import calculate_complexity
from ..services.code_validator import validate_submission
from ..services import param_types

# ReportLab imports for PDF generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
from reportlab.lib.utils import ImageReader
import requests
from PIL import Image as PILImage
import io

