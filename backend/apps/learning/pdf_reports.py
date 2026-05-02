"""
PDF Report Generation System
============================

Professional PDF reports for student performance data with:
- College logo and branding
- Institutional header information
- Detailed but minimal content layout
- Performance metrics and analytics
- Role-based report customization
- Contest analytics and individual student reports
"""

import os
from datetime import datetime, timedelta
from io import BytesIO
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

# PDF generation libraries
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
    from reportlab.platypus.frames import Frame
    from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.graphics.shapes import Drawing, Rect
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics import renderPDF
    from reportlab.lib.utils import ImageReader
    import requests
    from PIL import Image as PILImage
    import io
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

from .auth_utils import UnifiedAuthMixin
from .models import (
    StudentProfile, StaffProfile, Contest, ContestParticipation, 
    ContestSubmission, SolvedProblem, ProblemSolution, SolvedAptitude,
    Problem, AptitudeQuestion, Department, Institution
)


# ---------------------------------------------------------------------------
# PDF Watermark Utility for Contest Reports
# ---------------------------------------------------------------------------

class WatermarkDocTemplate(BaseDocTemplate):
    """Custom document template that adds watermark to all pages"""
    
    def __init__(self, filename, institution=None, **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
        self.institution = institution
        self.watermark_image = None
        
        # Try to get watermark image
        if institution and institution.logo_display_url:
            try:
                self.watermark_image = self._get_watermark_image(institution.logo_display_url)
            except Exception as e:
                print(f"Failed to load watermark image: {e}")
        
        # Add page template with frame
        frame = Frame(
            self.leftMargin, self.bottomMargin, 
            self.width, self.height, 
            id='normal'
        )
        template = PageTemplate(id='main', frames=frame, onPage=self._add_watermark)
        self.addPageTemplates([template])
    
    def _get_watermark_image(self, logo_url):
        """Download and prepare watermark image"""
        try:
            if logo_url.startswith('http'):
                # Download from URL
                response = requests.get(logo_url, timeout=10)
                response.raise_for_status()
                image_data = response.content
            else:
                # Local file path
                with open(logo_url, 'rb') as f:
                    image_data = f.read()
            
            # Process image with PIL
            pil_image = PILImage.open(io.BytesIO(image_data))
            
            # Convert to RGBA if needed
            if pil_image.mode != 'RGBA':
                pil_image = pil_image.convert('RGBA')
            
            # Make it semi-transparent for watermark effect
            alpha = pil_image.split()[-1]
            alpha = alpha.point(lambda p: p * 0.15)  # 15% opacity
            pil_image.putalpha(alpha)
            
            # Convert back to bytes
            output = io.BytesIO()
            pil_image.save(output, format='PNG')
            output.seek(0)
            
            return ImageReader(output)
        except Exception as e:
            print(f"Error processing watermark image: {e}")
            return None
    
    def _add_watermark(self, canvas, doc):
        """Add watermark to each page"""
        if not self.watermark_image:
            return
        
        try:
            # Calculate watermark position (center of page)
            page_width, page_height = A4
            watermark_size = min(page_width, page_height) * 0.4  # 40% of page size
            
            x = (page_width - watermark_size) / 2
            y = (page_height - watermark_size) / 2
            
            # Draw watermark
            canvas.drawImage(
                self.watermark_image, 
                x, y, 
                width=watermark_size, 
                height=watermark_size,
                mask='auto'
            )
        except Exception as e:
            print(f"Error adding watermark: {e}")


def create_watermarked_pdf_contest(buffer, institution=None, **kwargs):
    """Create a PDF document with watermark support for contest reports"""
    if institution and institution.logo_display_url:
        return WatermarkDocTemplate(buffer, institution=institution, **kwargs)
    else:
        return SimpleDocTemplate(buffer, **kwargs)


@method_decorator(csrf_exempt, name='dispatch')
class ContestReportPDFView(UnifiedAuthMixin, APIView):
    """
    Generate comprehensive PDF report for contest analytics
    with participant performance, rankings, and statistics
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not REPORTLAB_AVAILABLE:
            return Response({
                "error": "PDF generation not available. Please install reportlab: pip install reportlab"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        # Get the contest
        try:
            contest = Contest.objects.select_related('created_by', 'department', 'institution').get(id=contest_id)
        except Contest.DoesNotExist:
            return Response({
                "error": "Contest not found"
            }, status=status.HTTP_404_NOT_FOUND)

        # Check access permissions
        if not self._can_access_contest(profile, profile_type, contest):
            return Response({
                "error": "Access denied. You don't have permission to view this contest report."
            }, status=status.HTTP_403_FORBIDDEN)

        # Generate PDF with watermark
        buffer = BytesIO()
        pdf_doc = self._create_pdf_document(buffer, contest.institution)
        
        # Build PDF content
        story = []
        
        # Add header with college branding
        story.extend(self._create_contest_header(contest, profile))
        
        # Add contest overview
        story.extend(self._create_contest_overview(contest))
        
        # Add participant statistics
        story.extend(self._create_participant_statistics(contest))
        
        # Add leaderboard
        story.extend(self._create_contest_leaderboard(contest))
        
        # Add problem-wise analysis (for programming contests)
        if contest.contest_type == 'programming':
            story.extend(self._create_problem_analysis(contest))
        
        # Add footer
        story.extend(self._create_contest_footer(contest))
        
        # Build PDF
        pdf_doc.build(story)
        
        # Return PDF response
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'contest_report_{contest.id}_{timestamp}.pdf'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response

    def _can_access_contest(self, profile, profile_type, contest):
        """Check if the current user can access this contest's data"""
        if profile_type == "student":
            # Students can only access contests they participated in
            return contest.participations.filter(student=profile).exists()
        
        elif profile_type == "staff":
            # Staff can access contests in their department
            return (profile.institution == contest.institution and 
                    profile.department == contest.department)
        
        elif profile_type == "hod":
            # HOD can access all contests in their department
            return (profile.institution == contest.institution and 
                    profile.department == contest.department)
        
        elif profile_type in ["director", "tpu", "ja"]:
            # Directors, TPU, JA can access all contests in their institution
            return profile.institution == contest.institution
        
        elif profile_type == "admin":
            # Admins can access all contests
            return True
        
        return False

    def _create_pdf_document(self, buffer, institution=None):
        """Create PDF document with custom page template and watermark"""
        doc = create_watermarked_pdf_contest(
            buffer,
            institution=institution,
            pagesize=A4,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=1*inch,
            bottomMargin=0.75*inch
        )
        return doc

    def _create_contest_header(self, contest, profile):
        """Create header for contest report"""
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            spaceAfter=6,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#2c3e50')
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Normal'],
            fontSize=14,
            spaceAfter=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#34495e')
        )
        
        # Try to find college logo
        logo_found = False
        logo_paths = [
            os.path.join(settings.STATIC_ROOT or '', 'images', 'college_logo.png'),
            os.path.join(settings.STATIC_ROOT or '', 'images', 'college_logo.jpg'),
            os.path.join(settings.BASE_DIR, 'frontend', 'public', 'images', 'college_logo.png'),
            os.path.join(settings.BASE_DIR, 'frontend', 'public', 'images', 'college_logo.jpg'),
            os.path.join(settings.BASE_DIR, 'frontend', 'public', 'logo', 'logo.jpeg'),
            os.path.join(settings.MEDIA_ROOT or '', 'logos', 'college_logo.png'),
        ]
        
        for logo_path in logo_paths:
            if os.path.exists(logo_path):
                try:
                    logo = Image(logo_path, width=2.5*inch, height=1.25*inch)
                    logo.hAlign = 'CENTER'
                    story.append(logo)
                    story.append(Spacer(1, 12))
                    logo_found = True
                    break
                except Exception as e:
                    continue
        
        if not logo_found:
            header_style = ParagraphStyle(
                'HeaderDecoration',
                parent=styles['Normal'],
                fontSize=24,
                spaceAfter=12,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#3498db')
            )
            story.append(Paragraph("🏆", header_style))
        
        # Institution name
        institution_name = "Code2Day Learning Platform"
        if contest.institution:
            institution_name = contest.institution.name
        
        story.append(Paragraph(institution_name, title_style))
        story.append(Paragraph("Contest Performance Report", subtitle_style))
        
        # Department information
        if contest.department:
            dept_style = ParagraphStyle(
                'DeptStyle',
                parent=styles['Normal'],
                fontSize=12,
                spaceAfter=6,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#7f8c8d')
            )
            story.append(Paragraph(f"Department: {contest.department.name}", dept_style))
        
        # Add decorative line
        line_style = ParagraphStyle(
            'Line',
            parent=styles['Normal'],
            fontSize=8,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#bdc3c7')
        )
        story.append(Paragraph("━" * 60, line_style))
        
        return story

    def _create_contest_overview(self, contest):
        """Create contest overview section"""
        story = []
        styles = getSampleStyleSheet()
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            textColor=colors.HexColor('#2c3e50'),
            borderWidth=1,
            borderColor=colors.HexColor('#3498db'),
            borderPadding=8,
            backColor=colors.HexColor('#ecf0f1')
        )
        
        story.append(Paragraph("📋 Contest Overview", section_style))
        
        # Contest information table
        overview_data = [
            ['Field', 'Information'],
            ['Contest Title', contest.title],
            ['Contest Type', contest.get_contest_type_display()],
            ['Created By', contest.created_by.name if contest.created_by else 'N/A'],
            ['Department', contest.department.name if contest.department else 'N/A'],
            ['Status', contest.get_status_display()],
            ['Duration', f"{contest.duration_minutes} minutes" if contest.duration_minutes else 'N/A'],
            ['Start Time', contest.start_time.strftime('%B %d, %Y at %I:%M %p') if contest.start_time else 'N/A'],
            ['End Time', contest.end_time.strftime('%B %d, %Y at %I:%M %p') if contest.end_time else 'N/A'],
            ['Total Participants', str(contest.total_participants)],
            ['Total Submissions', str(contest.total_submissions)],
            ['Report Generated', datetime.now().strftime('%B %d, %Y at %I:%M %p')],
        ]
        
        overview_table = Table(overview_data, colWidths=[2*inch, 3.5*inch])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 1), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        story.append(overview_table)
        story.append(Spacer(1, 20))
        
        return story

    def _create_participant_statistics(self, contest):
        """Create participant statistics section"""
        story = []
        styles = getSampleStyleSheet()
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            textColor=colors.HexColor('#2c3e50'),
            borderWidth=1,
            borderColor=colors.HexColor('#27ae60'),
            borderPadding=8,
            backColor=colors.HexColor('#ecf0f1')
        )
        
        story.append(Paragraph("📊 Participant Statistics", section_style))
        
        # Get participation data
        participations = ContestParticipation.objects.filter(contest=contest)
        
        if participations.exists():
            # Calculate statistics
            total_participants = participations.count()
            completed_participants = participations.filter(completed_at__isnull=False).count()
            
            from django.db.models import Avg, Max
            avg_score = participations.aggregate(avg_score=Avg('total_score'))['avg_score'] or 0
            max_score = participations.aggregate(max_score=Max('total_score'))['max_score'] or 0
            
            # Score distribution
            score_ranges = [
                ('0-25%', participations.filter(total_score__lte=max_score*0.25).count() if max_score > 0 else 0),
                ('26-50%', participations.filter(total_score__gt=max_score*0.25, total_score__lte=max_score*0.5).count() if max_score > 0 else 0),
                ('51-75%', participations.filter(total_score__gt=max_score*0.5, total_score__lte=max_score*0.75).count() if max_score > 0 else 0),
                ('76-100%', participations.filter(total_score__gt=max_score*0.75).count() if max_score > 0 else 0),
            ]
            
            # Statistics table
            stats_data = [
                ['Metric', 'Value'],
                ['Total Participants', str(total_participants)],
                ['Completed Contest', str(completed_participants)],
                ['Completion Rate', f"{(completed_participants/total_participants*100):.1f}%" if total_participants > 0 else "0%"],
                ['Average Score', f"{avg_score:.1f}"],
                ['Highest Score', str(int(max_score))],
            ]
            
            stats_table = Table(stats_data, colWidths=[2.5*inch, 1.5*inch])
            stats_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27ae60')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
            ]))
            
            story.append(stats_table)
            story.append(Spacer(1, 15))
            
            # Score distribution table
            dist_data = [['Score Range', 'Number of Participants', 'Percentage']]
            for range_name, count in score_ranges:
                percentage = (count / total_participants * 100) if total_participants > 0 else 0
                dist_data.append([range_name, str(count), f"{percentage:.1f}%"])
            
            dist_table = Table(dist_data, colWidths=[2*inch, 1.5*inch, 1*inch])
            dist_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e74c3c')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
            ]))
            
            story.append(dist_table)
        else:
            no_data_style = ParagraphStyle(
                'NoData',
                parent=styles['Normal'],
                fontSize=10,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#7f8c8d'),
                spaceAfter=12
            )
            story.append(Paragraph("No participation data available for this contest.", no_data_style))
        
        story.append(Spacer(1, 20))
        return story

    def _create_contest_leaderboard(self, contest):
        """Create contest leaderboard section"""
        story = []
        styles = getSampleStyleSheet()
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            textColor=colors.HexColor('#2c3e50'),
            borderWidth=1,
            borderColor=colors.HexColor('#f39c12'),
            borderPadding=8,
            backColor=colors.HexColor('#ecf0f1')
        )
        
        story.append(Paragraph("🏆 Contest Leaderboard", section_style))
        
        # Get top participants
        top_participants = ContestParticipation.objects.filter(contest=contest).select_related('student').order_by('-total_score', 'total_time_taken')[:20]
        
        if top_participants:
            leaderboard_data = [['Rank', 'Register No.', 'Name', 'Score', 'Time Taken', 'Status']]
            
            for idx, participation in enumerate(top_participants, 1):
                time_taken = f"{participation.total_time_taken//60}m {participation.total_time_taken%60}s" if participation.total_time_taken else "N/A"
                status = "Completed" if participation.completed_at else "In Progress"
                
                leaderboard_data.append([
                    str(idx),
                    participation.student.register_number or 'N/A',
                    participation.student.name[:25] + "..." if len(participation.student.name) > 25 else participation.student.name,
                    str(participation.total_score),
                    time_taken,
                    status
                ])
            
            leaderboard_table = Table(leaderboard_data, colWidths=[0.5*inch, 1.2*inch, 1.8*inch, 0.8*inch, 1*inch, 1*inch])
            leaderboard_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f39c12')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
            ]))
            
            # Add alternating row colors and highlight top 3
            for i in range(1, len(leaderboard_data)):
                if i <= 3:  # Top 3 get special highlighting
                    if i == 1:
                        leaderboard_table.setStyle(TableStyle([('BACKGROUND', (0, i), (-1, i), colors.HexColor('#ffd700'))]))  # Gold
                    elif i == 2:
                        leaderboard_table.setStyle(TableStyle([('BACKGROUND', (0, i), (-1, i), colors.HexColor('#c0c0c0'))]))  # Silver
                    elif i == 3:
                        leaderboard_table.setStyle(TableStyle([('BACKGROUND', (0, i), (-1, i), colors.HexColor('#cd7f32'))]))  # Bronze
                elif i % 2 == 0:
                    leaderboard_table.setStyle(TableStyle([('BACKGROUND', (0, i), (-1, i), colors.HexColor('#ecf0f1'))]))
            
            story.append(leaderboard_table)
        else:
            no_data_style = ParagraphStyle(
                'NoData',
                parent=styles['Normal'],
                fontSize=10,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#7f8c8d'),
                spaceAfter=12
            )
            story.append(Paragraph("No leaderboard data available for this contest.", no_data_style))
        
        story.append(Spacer(1, 20))
        return story

    def _create_problem_analysis(self, contest):
        """Create problem-wise analysis for programming contests"""
        story = []
        styles = getSampleStyleSheet()
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            textColor=colors.HexColor('#2c3e50'),
            borderWidth=1,
            borderColor=colors.HexColor('#9b59b6'),
            borderPadding=8,
            backColor=colors.HexColor('#ecf0f1')
        )
        
        story.append(Paragraph("🧩 Problem-wise Analysis", section_style))
        
        # Get problems and their submission stats
        problems = contest.problems.all()
        
        if problems:
            problem_data = [['Problem', 'Difficulty', 'Total Attempts', 'Successful', 'Success Rate']]
            
            for problem in problems:
                total_attempts = ContestSubmission.objects.filter(contest=contest, problem=problem).count()
                successful = ContestSubmission.objects.filter(contest=contest, problem=problem, status='Accepted').count()
                success_rate = (successful / total_attempts * 100) if total_attempts > 0 else 0
                
                problem_data.append([
                    problem.title[:30] + "..." if len(problem.title) > 30 else problem.title,
                    problem.difficulty,
                    str(total_attempts),
                    str(successful),
                    f"{success_rate:.1f}%"
                ])
            
            problem_table = Table(problem_data, colWidths=[2.5*inch, 1*inch, 1*inch, 1*inch, 1*inch])
            problem_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#9b59b6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
            ]))
            
            story.append(problem_table)
        else:
            no_data_style = ParagraphStyle(
                'NoData',
                parent=styles['Normal'],
                fontSize=10,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#7f8c8d'),
                spaceAfter=12
            )
            story.append(Paragraph("No problems assigned to this contest.", no_data_style))
        
        story.append(Spacer(1, 20))
        return story

    def _create_contest_footer(self, contest):
        """Create footer for contest report"""
        story = []
        styles = getSampleStyleSheet()
        
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#7f8c8d')
        )
        
        story.append(Spacer(1, 30))
        story.append(Paragraph(f"Contest Report for '{contest.title}' (ID: {contest.id})", footer_style))
        story.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        story.append(Paragraph("This report contains contest performance data and analytics.", footer_style))
        story.append(Paragraph("For questions about this report, please contact your instructor or system administrator.", footer_style))
        
        return story