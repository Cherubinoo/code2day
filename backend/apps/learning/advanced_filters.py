"""
Advanced Student Filtering and Export System
============================================

This module provides comprehensive filtering capabilities for students based on:
1. Overall Performance (total problems solved, ranking)
2. Topic-wise Performance (algorithms, data structures, etc.)
3. Aptitude Level (quantitative, logical reasoning, etc.)
4. Programming Efficiency (time complexity, execution time)
5. Programming Language-wise (Python, Java, C++, etc.)

Role-based access control ensures users only see data they're authorized to access.
"""

import csv
import json
from datetime import datetime, timedelta
from django.db.models import Count, Q, Avg, Sum, Max, Min, F, Case, When, IntegerField
from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from .models import (
    StudentProfile, StaffProfile, Problem, SolvedProblem, 
    ProblemSolution, AptitudeTopic, AptitudeQuestion, SolvedAptitude,
    ProblemSession, Department, Institution
)
from .auth_utils import UnifiedAuthMixin


class AdvancedStudentFilterView(UnifiedAuthMixin, APIView):
    """
    Advanced student filtering with performance-based criteria:
    - Overall performance (problems solved, ranking)
    - Topic-wise performance (algorithms, data structures, etc.)
    - Aptitude performance (quantitative, logical, etc.)
    - Programming efficiency (time complexity, execution time)
    - Language-wise performance (Python, Java, C++, etc.)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        # Get base queryset based on user role
        students_qs = self._get_authorized_students(profile, profile_type)
        
        # Apply performance-based filters
        students_qs = self._apply_performance_filters(students_qs, request.query_params)
        
        # Apply topic-wise filters
        students_qs = self._apply_topic_filters(students_qs, request.query_params)
        
        # Apply aptitude filters
        students_qs = self._apply_aptitude_filters(students_qs, request.query_params)
        
        # Apply programming efficiency filters
        students_qs = self._apply_efficiency_filters(students_qs, request.query_params)
        
        # Apply language-wise filters
        students_qs = self._apply_language_filters(students_qs, request.query_params)
        
        # Apply basic filters (search, batch, etc.)
        students_qs = self._apply_basic_filters(students_qs, request.query_params)
        
        # Add performance annotations
        students_qs = self._add_performance_annotations(students_qs)
        
        # Pagination and ordering
        page_size = min(int(request.query_params.get('page_size', 50)), 500)
        page = int(request.query_params.get('page', 1))
        offset = (page - 1) * page_size
        
        total_count = students_qs.count()
        students = students_qs[offset:offset + page_size]
        
        # Format response data
        data = []
        for student in students:
            student_data = self._format_student_data(student)
            data.append(student_data)
        
        return Response({
            "students": data,
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": (total_count + page_size - 1) // page_size,
            "filters_applied": self._get_applied_filters(request.query_params)
        })

    def _get_authorized_students(self, profile, profile_type):
        """Get students based on user's role and permissions"""
        if profile_type == "student":
            # Students can only see themselves
            return StudentProfile.objects.filter(id=profile.id)
        
        elif profile_type == "staff":
            # Staff can see students in their department
            return StudentProfile.objects.filter(
                institution=profile.institution,
                department=profile.department
            )
        
        elif profile_type == "hod":
            # HOD can see all students in their department
            return StudentProfile.objects.filter(
                institution=profile.institution,
                department=profile.department
            )
        
        elif profile_type in ["director", "tpu", "ja"]:
            # Directors, TPU, JA can see all students in their institution
            return StudentProfile.objects.filter(
                institution=profile.institution
            )
        
        elif profile_type == "admin":
            # Admins can see all students
            return StudentProfile.objects.all()
        
        else:
            return StudentProfile.objects.none()

    def _apply_performance_filters(self, queryset, params):
        """Apply overall performance filters"""
        # Problems solved range
        min_solved = params.get('min_problems_solved')
        max_solved = params.get('max_problems_solved')
        
        if min_solved:
            queryset = queryset.annotate(
                total_solved=Count('solved_problems', distinct=True)
            ).filter(total_solved__gte=int(min_solved))
        
        if max_solved:
            if not hasattr(queryset.model, 'total_solved'):
                queryset = queryset.annotate(
                    total_solved=Count('solved_problems', distinct=True)
                )
            queryset = queryset.filter(total_solved__lte=int(max_solved))
        
        # Difficulty-based filters
        min_easy = params.get('min_easy_solved')
        min_medium = params.get('min_medium_solved')
        min_hard = params.get('min_hard_solved')
        
        if min_easy:
            queryset = queryset.annotate(
                easy_solved=Count('solved_problems', 
                    filter=Q(solved_problems__problem__difficulty='Easy'), 
                    distinct=True)
            ).filter(easy_solved__gte=int(min_easy))
        
        if min_medium:
            queryset = queryset.annotate(
                medium_solved=Count('solved_problems', 
                    filter=Q(solved_problems__problem__difficulty='Medium'), 
                    distinct=True)
            ).filter(medium_solved__gte=int(min_medium))
        
        if min_hard:
            queryset = queryset.annotate(
                hard_solved=Count('solved_problems', 
                    filter=Q(solved_problems__problem__difficulty='Hard'), 
                    distinct=True)
            ).filter(hard_solved__gte=int(min_hard))
        
        # Streak filters
        min_streak = params.get('min_current_streak')
        if min_streak:
            queryset = queryset.filter(current_streak__gte=int(min_streak))
        
        return queryset

    def _apply_topic_filters(self, queryset, params):
        """Apply topic-wise performance filters"""
        # Get topic filters from params
        topics = params.get('topics', '').split(',') if params.get('topics') else []
        min_topic_solved = params.get('min_topic_solved')
        
        if topics and min_topic_solved:
            # Filter students who solved at least min_topic_solved problems in specified topics
            topic_filter = Q()
            for topic in topics:
                if topic.strip():
                    topic_filter |= Q(solved_problems__problem__tags__contains=topic.strip())
            
            queryset = queryset.annotate(
                topic_solved_count=Count('solved_problems', 
                    filter=topic_filter, 
                    distinct=True)
            ).filter(topic_solved_count__gte=int(min_topic_solved))
        
        return queryset

    def _apply_aptitude_filters(self, queryset, params):
        """Apply aptitude performance filters"""
        min_aptitude = params.get('min_aptitude_solved')
        aptitude_topics = params.get('aptitude_topics', '').split(',') if params.get('aptitude_topics') else []
        
        if min_aptitude:
            aptitude_filter = Q()
            if aptitude_topics:
                # Filter by specific aptitude topics
                for topic_name in aptitude_topics:
                    if topic_name.strip():
                        aptitude_filter |= Q(solved_aptitude__question__topic__title__icontains=topic_name.strip())
            
            if aptitude_filter:
                queryset = queryset.annotate(
                    aptitude_solved_count=Count('solved_aptitude', 
                        filter=aptitude_filter, 
                        distinct=True)
                ).filter(aptitude_solved_count__gte=int(min_aptitude))
            else:
                queryset = queryset.annotate(
                    aptitude_solved_count=Count('solved_aptitude', distinct=True)
                ).filter(aptitude_solved_count__gte=int(min_aptitude))
        
        return queryset

    def _apply_efficiency_filters(self, queryset, params):
        """Apply programming efficiency filters"""
        # Average time spent per problem
        max_avg_time = params.get('max_avg_time_minutes')
        if max_avg_time:
            max_seconds = int(max_avg_time) * 60
            queryset = queryset.annotate(
                avg_time_spent=Avg('solutions__time_spent_seconds')
            ).filter(avg_time_spent__lte=max_seconds)
        
        # Success rate (percentage of solutions that pass all tests)
        min_success_rate = params.get('min_success_rate')
        if min_success_rate:
            queryset = queryset.annotate(
                total_submissions=Count('solutions'),
                successful_submissions=Count('solutions', filter=Q(solutions__all_tests_passed=True))
            ).annotate(
                success_rate=Case(
                    When(total_submissions=0, then=0),
                    default=F('successful_submissions') * 100 / F('total_submissions'),
                    output_field=IntegerField()
                )
            ).filter(success_rate__gte=int(min_success_rate))
        
        return queryset

    def _apply_language_filters(self, queryset, params):
        """Apply programming language-wise filters"""
        languages = params.get('languages', '').split(',') if params.get('languages') else []
        min_lang_problems = params.get('min_language_problems')
        
        if languages and min_lang_problems:
            language_filter = Q()
            for lang in languages:
                if lang.strip():
                    language_filter |= Q(solved_problems__language__icontains=lang.strip())
            
            queryset = queryset.annotate(
                lang_solved_count=Count('solved_problems', 
                    filter=language_filter, 
                    distinct=True)
            ).filter(lang_solved_count__gte=int(min_lang_problems))
        
        return queryset

    def _apply_basic_filters(self, queryset, params):
        """Apply basic filters like search, batch, department"""
        # Search filter
        search = params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | 
                Q(register_number__icontains=search) |
                Q(title__icontains=search)
            )
        
        # Batch filter
        batch = params.get('batch')
        if batch:
            queryset = queryset.filter(batch=batch)
        
        # Department filter (for admin/director level users)
        department_id = params.get('department_id')
        if department_id:
            queryset = queryset.filter(department_id=department_id)
        
        return queryset

    def _add_performance_annotations(self, queryset):
        """Add performance-related annotations to the queryset"""
        return queryset.select_related('department', 'institution').annotate(
            total_problems_solved=Count('solved_problems', distinct=True),
            easy_problems_solved=Count('solved_problems', 
                filter=Q(solved_problems__problem__difficulty='Easy'), 
                distinct=True),
            medium_problems_solved=Count('solved_problems', 
                filter=Q(solved_problems__problem__difficulty='Medium'), 
                distinct=True),
            hard_problems_solved=Count('solved_problems', 
                filter=Q(solved_problems__problem__difficulty='Hard'), 
                distinct=True),
            total_aptitude_solved=Count('solved_aptitude', distinct=True),
            total_submissions=Count('solutions'),
            successful_submissions=Count('solutions', filter=Q(solutions__all_tests_passed=True)),
            avg_time_per_problem=Avg('solutions__time_spent_seconds'),
            last_activity=Max('solved_problems__solved_at')
        )

    def _format_student_data(self, student):
        """Format student data for response"""
        # Calculate success rate
        success_rate = 0
        if student.total_submissions > 0:
            success_rate = round((student.successful_submissions / student.total_submissions) * 100, 1)
        
        # Format average time
        avg_time_minutes = 0
        if student.avg_time_per_problem:
            avg_time_minutes = round(student.avg_time_per_problem / 60, 1)
        
        return {
            "id": student.id,
            "register_number": student.register_number,
            "name": student.name,
            "title": student.title,
            "batch": student.batch,
            "department": student.department.name if student.department else None,
            "department_code": student.department.code if student.department else None,
            "current_streak": student.current_streak,
            "login_days": student.login_days,
            "last_login": student.last_login_on.isoformat() if student.last_login_on else None,
            "performance": {
                "total_problems_solved": student.total_problems_solved,
                "easy_solved": student.easy_problems_solved,
                "medium_solved": student.medium_problems_solved,
                "hard_solved": student.hard_problems_solved,
                "aptitude_solved": student.total_aptitude_solved,
                "success_rate": success_rate,
                "avg_time_minutes": avg_time_minutes,
                "total_submissions": student.total_submissions,
                "last_activity": student.last_activity.isoformat() if student.last_activity else None
            }
        }

    def _get_applied_filters(self, params):
        """Return summary of applied filters"""
        filters = {}
        
        if params.get('min_problems_solved'):
            filters['min_problems_solved'] = params.get('min_problems_solved')
        if params.get('max_problems_solved'):
            filters['max_problems_solved'] = params.get('max_problems_solved')
        if params.get('topics'):
            filters['topics'] = params.get('topics').split(',')
        if params.get('languages'):
            filters['languages'] = params.get('languages').split(',')
        if params.get('min_success_rate'):
            filters['min_success_rate'] = params.get('min_success_rate')
        if params.get('batch'):
            filters['batch'] = params.get('batch')
        if params.get('search'):
            filters['search'] = params.get('search')
        
        return filters


@method_decorator(csrf_exempt, name='dispatch')
class StudentDataExportView(UnifiedAuthMixin, APIView):
    """
    Export filtered student data to CSV format
    Supports all the same filters as AdvancedStudentFilterView
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        # Use the same filtering logic as AdvancedStudentFilterView
        filter_view = AdvancedStudentFilterView()
        filter_view.request = request
        
        # Get filters from request data
        filter_params = request.data if hasattr(request, 'data') else {}
        
        # Get filtered students
        students_qs = filter_view._get_authorized_students(profile, profile_type)
        students_qs = filter_view._apply_performance_filters(students_qs, filter_params)
        students_qs = filter_view._apply_topic_filters(students_qs, filter_params)
        students_qs = filter_view._apply_aptitude_filters(students_qs, filter_params)
        students_qs = filter_view._apply_efficiency_filters(students_qs, filter_params)
        students_qs = filter_view._apply_language_filters(students_qs, filter_params)
        students_qs = filter_view._apply_basic_filters(students_qs, filter_params)
        students_qs = filter_view._add_performance_annotations(students_qs)
        
        # Limit export size for performance
        max_export = 5000
        if students_qs.count() > max_export:
            return Response({
                "error": f"Export limited to {max_export} records. Please apply more filters to reduce the dataset.",
                "current_count": students_qs.count()
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create CSV response
        response = HttpResponse(content_type='text/csv')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'student_data_export_{timestamp}.csv'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        writer = csv.writer(response)
        
        # Write header
        header = [
            'Register Number', 'Name', 'Title', 'Batch', 'Department', 'Department Code',
            'Current Streak', 'Login Days', 'Last Login',
            'Total Problems Solved', 'Easy Solved', 'Medium Solved', 'Hard Solved',
            'Aptitude Solved', 'Success Rate (%)', 'Avg Time (minutes)',
            'Total Submissions', 'Last Activity'
        ]
        writer.writerow(header)
        
        # Write data
        for student in students_qs:
            success_rate = 0
            if student.total_submissions > 0:
                success_rate = round((student.successful_submissions / student.total_submissions) * 100, 1)
            
            avg_time_minutes = 0
            if student.avg_time_per_problem:
                avg_time_minutes = round(student.avg_time_per_problem / 60, 1)
            
            row = [
                student.register_number,
                student.name,
                student.title,
                student.batch,
                student.department.name if student.department else '',
                student.department.code if student.department else '',
                student.current_streak,
                student.login_days,
                student.last_login_on.strftime('%Y-%m-%d') if student.last_login_on else '',
                student.total_problems_solved,
                student.easy_problems_solved,
                student.medium_problems_solved,
                student.hard_problems_solved,
                student.total_aptitude_solved,
                success_rate,
                avg_time_minutes,
                student.total_submissions,
                student.last_activity.strftime('%Y-%m-%d %H:%M') if student.last_activity else ''
            ]
            writer.writerow(row)
        
        return response


# Import the PDF report class from pdf_reports
from .pdf_reports import ContestReportPDFView


@method_decorator(csrf_exempt, name='dispatch')
class StudentPerformancePDFReport(UnifiedAuthMixin, APIView):
    """
    Generate professional PDF reports for student performance data
    with college branding and institutional information
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not REPORTLAB_AVAILABLE:
            return Response({
                "error": "PDF generation not available. Please install reportlab: pip install reportlab"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        # Use the same filtering logic as AdvancedStudentFilterView
        filter_view = AdvancedStudentFilterView()
        filter_view.request = request
        
        # Get filters from request data instead of query params for POST
        filter_params = request.data if hasattr(request, 'data') else request.query_params
        
        # Get filtered students
        students_qs = filter_view._get_authorized_students(profile, profile_type)
        students_qs = filter_view._apply_performance_filters(students_qs, filter_params)
        students_qs = filter_view._apply_topic_filters(students_qs, filter_params)
        students_qs = filter_view._apply_aptitude_filters(students_qs, filter_params)
        students_qs = filter_view._apply_efficiency_filters(students_qs, filter_params)
        students_qs = filter_view._apply_language_filters(students_qs, filter_params)
        students_qs = filter_view._apply_basic_filters(students_qs, filter_params)
        students_qs = filter_view._add_performance_annotations(students_qs)
        
        # Limit export size for performance
        max_export = 1000  # Reduced for PDF
        if students_qs.count() > max_export:
            return Response({
                "error": f"PDF export limited to {max_export} records. Please apply more filters to reduce the dataset.",
                "current_count": students_qs.count()
            }, status=status.HTTP_400_BAD_REQUEST)

        # Generate PDF using the ContestReportPDFView as a base
        from .pdf_reports import ContestReportPDFView
        pdf_generator = ContestReportPDFView()
        
        # Generate PDF
        buffer = BytesIO()
        pdf_doc = pdf_generator._create_pdf_document(buffer)
        
        # Build PDF content
        story = []
        
        # Add header with college branding
        story.extend(self._create_header(profile, profile_type))
        
        # Add report title and metadata
        story.extend(self._create_report_metadata(filter_params, students_qs.count()))
        
        # Add performance summary
        story.extend(self._create_performance_summary(students_qs))
        
        # Add student data table
        story.extend(self._create_student_table(students_qs))
        
        # Add footer
        story.extend(self._create_footer())
        
        # Build PDF
        pdf_doc.build(story)
        
        # Return PDF response
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'student_performance_report_{timestamp}.pdf'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response

    def _create_header(self, profile, profile_type):
        """Create header with college logo and institutional information"""
        # Use the same header creation logic as ContestReportPDFView
        from .pdf_reports import ContestReportPDFView
        pdf_generator = ContestReportPDFView()
        
        # Create a mock contest object for header generation
        class MockContest:
            def __init__(self, profile):
                self.institution = getattr(profile, 'institution', None)
                self.department = getattr(profile, 'department', None)
        
        mock_contest = MockContest(profile)
        return pdf_generator._create_contest_header(mock_contest, profile)

    def _create_report_metadata(self, params, total_students):
        """Create report metadata section"""
        # Implementation similar to ContestReportPDFView but for student performance
        story = []
        # Add metadata about the report
        return story

    def _create_performance_summary(self, students_qs):
        """Create performance summary section"""
        story = []
        # Add performance statistics
        return story

    def _create_student_table(self, students_qs):
        """Create detailed student performance table"""
        story = []
        # Add student data table
        return story

    def _create_footer(self):
        """Create report footer"""
        story = []
        # Add footer
        return story


# Try to import reportlab for PDF functionality
try:
    from reportlab.lib import colors
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False