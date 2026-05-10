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
        """Create header for contest report using branded header"""
        # Use the new branded header function
        report_title = f"Contest Performance Report: {contest.title}"
        department = contest.department.name if contest.department else "All Departments"
        user_name = getattr(profile, 'name', 'System Administrator')
        
        return create_branded_report_header(
            institution=contest.institution,
            report_title=report_title,
            report_type="Contest Analytics",
            department=department,
            user_name=user_name,
            academic_year=datetime.now().year
        )

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


def generate_branded_template(institution, template_type, branding_data):
    """
    Generate branded PDF templates for institutions
    
    Args:
        institution: Institution model instance
        template_type: Type of template ('letterhead', 'certificate', 'report_header')
        branding_data: Dictionary containing branding information
    
    Returns:
        BytesIO buffer containing the generated PDF
    """
    if not REPORTLAB_AVAILABLE:
        raise ImportError("ReportLab is required for PDF generation")
    
    buffer = BytesIO()
    
    # Create document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=1*inch,
        bottomMargin=0.75*inch
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Get branding colors
    primary_color = branding_data.get('primary_color', '#4f7942')
    secondary_color = branding_data.get('secondary_color', '#2d5016')
    accent_color = branding_data.get('accent_color', '#059669')
    
    if template_type == 'letterhead':
        story.extend(_create_letterhead_template(institution, branding_data, styles, primary_color, secondary_color))
    elif template_type == 'certificate':
        story.extend(_create_certificate_template(institution, branding_data, styles, primary_color, secondary_color))
    elif template_type == 'report_header':
        story.extend(_create_report_header_template(institution, branding_data, styles, primary_color, secondary_color))
    else:
        raise ValueError(f"Unknown template type: {template_type}")
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    return buffer


def _create_letterhead_template(institution, branding_data, styles, primary_color, secondary_color):
    """Create compact report header template (not full letterhead)"""
    story = []
    
    # This creates a sample of the compact header that will appear on reports
    sample_style = ParagraphStyle(
        'SampleNote',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#666666'),
        spaceAfter=16,
        borderWidth=1,
        borderColor=colors.HexColor('#cccccc'),
        borderPadding=8,
        backColor=colors.HexColor('#f9f9f9')
    )
    
    story.append(Paragraph("SAMPLE: This shows how your college header will appear on PDF reports", sample_style))
    story.append(Spacer(1, 16))
    
    # Create the actual compact header that will be used in reports
    header_elements = create_branded_report_header(
        institution=institution,
        report_title="Sample Report Title",
        report_type="Performance Report",
        department="Computer Science",
        user_name="Administrator",
        academic_year="2024-25"
    )
    
    story.extend(header_elements)
    
    # Add sample content to show how it looks with actual report content
    content_style = ParagraphStyle(
        'SampleContent',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_LEFT,
        spaceAfter=12
    )
    
    story.append(Paragraph("<b>EXECUTIVE SUMMARY</b>", content_style))
    story.append(Paragraph("This is where your report content will appear. The header above will be automatically added to all PDF reports generated from the system.", content_style))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("<b>REPORT SECTIONS</b>", content_style))
    story.append(Paragraph("• Student Performance Analytics", content_style))
    story.append(Paragraph("• Contest Results and Rankings", content_style))
    story.append(Paragraph("• Department-wise Statistics", content_style))
    story.append(Paragraph("• Individual Student Reports", content_style))
    story.append(Spacer(1, 12))
    
    # Footer note
    footer_style = ParagraphStyle(
        'FooterNote',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#888888'),
        spaceAfter=12,
        borderWidth=1,
        borderColor=colors.HexColor('#cccccc'),
        borderPadding=8,
        backColor=colors.HexColor('#f9f9f9')
    )
    
    story.append(Spacer(1, 24))
    story.append(Paragraph("This compact header design ensures professional branding while maximizing space for report content.", footer_style))
    
    return story


def _create_certificate_template(institution, branding_data, styles, primary_color, secondary_color):
    """Create certificate template"""
    story = []
    
    # Certificate border (decorative)
    border_style = ParagraphStyle(
        'BorderStyle',
        parent=styles['Normal'],
        fontSize=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=24
    )
    story.append(Paragraph("╔" + "═" * 60 + "╗", border_style))
    
    # Certificate title
    cert_title_style = ParagraphStyle(
        'CertTitleStyle',
        parent=styles['Normal'],
        fontSize=28,
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=24
    )
    story.append(Paragraph("CERTIFICATE OF ACHIEVEMENT", cert_title_style))
    
    # Institution name
    inst_style = ParagraphStyle(
        'InstStyle',
        parent=styles['Normal'],
        fontSize=18,
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
        textColor=colors.HexColor(secondary_color),
        spaceAfter=36
    )
    display_name = branding_data.get('display_name', institution.name)
    story.append(Paragraph(display_name, inst_style))
    
    # Certificate content
    content_style = ParagraphStyle(
        'CertContentStyle',
        parent=styles['Normal'],
        fontSize=14,
        alignment=TA_CENTER,
        spaceAfter=24
    )
    
    story.append(Paragraph("This is to certify that", content_style))
    story.append(Spacer(1, 12))
    
    name_style = ParagraphStyle(
        'NameStyle',
        parent=styles['Normal'],
        fontSize=20,
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=24
    )
    story.append(Paragraph("_" * 40, name_style))
    story.append(Paragraph("(Student Name)", content_style))
    story.append(Spacer(1, 24))
    
    story.append(Paragraph("has successfully completed", content_style))
    story.append(Spacer(1, 12))
    story.append(Paragraph("_" * 50, name_style))
    story.append(Paragraph("(Course/Contest Name)", content_style))
    story.append(Spacer(1, 24))
    
    story.append(Paragraph("with outstanding performance", content_style))
    story.append(Spacer(1, 36))
    
    # Date and signature section
    signature_style = ParagraphStyle(
        'SignatureStyle',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_LEFT,
        spaceAfter=12
    )
    
    # Create signature table
    sig_data = [
        ['Date: _______________', '', 'Signature: _______________'],
        ['', '', ''],
        ['', '', 'Authorized Signatory']
    ]
    
    sig_table = Table(sig_data, colWidths=[2*inch, 1*inch, 2*inch])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    
    story.append(sig_table)
    story.append(Spacer(1, 24))
    
    # Bottom border
    story.append(Paragraph("╚" + "═" * 60 + "╝", border_style))
    
    return story


def _create_report_header_template(institution, branding_data, styles, primary_color, secondary_color):
    """Create compact report header for PDF reports"""
    story = []
    
    # Create a compact header table with logo and institution info
    header_data = []
    
    # Get institution info
    display_name = branding_data.get('display_name', institution.name)
    subheading = branding_data.get('subheading', '')
    address = branding_data.get('address', institution.address or '')
    contact_info = []
    
    if branding_data.get('contact_phone'):
        contact_info.append(f"Phone: {branding_data['contact_phone']}")
    if branding_data.get('contact_email'):
        contact_info.append(f"Email: {branding_data['contact_email']}")
    if branding_data.get('website'):
        contact_info.append(f"Web: {branding_data['website']}")
    
    # Create header content
    institution_info = f"<b>{display_name}</b>"
    if subheading:
        institution_info += f"<br/><i>{subheading}</i>"
    if address:
        institution_info += f"<br/>{address}"
    if contact_info:
        institution_info += f"<br/>{' | '.join(contact_info)}"
    
    # Logo placeholder and institution info in a table
    header_data = [
        ['[LOGO]', institution_info, f'<b>Report Generated</b><br/>{datetime.now().strftime("%B %d, %Y")}<br/>{datetime.now().strftime("%I:%M %p")}']
    ]
    
    header_table = Table(header_data, colWidths=[1*inch, 4*inch, 1.5*inch])
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),  # Logo center
        ('ALIGN', (1, 0), (1, 0), 'LEFT'),    # Institution info left
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),   # Date right
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTSIZE', (1, 0), (1, 0), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#333333')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor(primary_color)),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8f9fa')),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(header_table)
    story.append(Spacer(1, 16))
    
    # Report title section
    title_style = ParagraphStyle(
        'ReportTitleStyle',
        parent=styles['Normal'],
        fontSize=16,
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=8,
        borderWidth=1,
        borderColor=colors.HexColor(primary_color),
        borderPadding=8,
        backColor=colors.HexColor('#f0f8ff')
    )
    story.append(Paragraph("[REPORT TITLE]", title_style))
    story.append(Spacer(1, 16))
    
    # Report metadata in a compact format
    meta_style = ParagraphStyle(
        'ReportMetaStyle',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_LEFT,
        textColor=colors.HexColor('#666666'),
        spaceAfter=16
    )
    
    meta_info = f"<b>Report Details:</b> [REPORT TYPE] | <b>Department:</b> [DEPARTMENT] | <b>Academic Year:</b> [ACADEMIC YEAR] | <b>Generated By:</b> [USER NAME]"
    story.append(Paragraph(meta_info, meta_style))
    
    # Separator line
    separator_style = ParagraphStyle(
        'SeparatorStyle',
        parent=styles['Normal'],
        fontSize=8,
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=16
    )
    story.append(Paragraph("═" * 100, separator_style))
    
    return story


def create_branded_report_header(institution, report_title="Report", report_type="", department="", user_name="", academic_year=""):
    """
    Create a compact branded header for PDF reports
    
    Args:
        institution: Institution model instance
        report_title: Title of the report
        report_type: Type of report (Student Performance, Contest Analytics, etc.)
        department: Department name
        user_name: Name of user generating the report
        academic_year: Academic year
    
    Returns:
        List of ReportLab story elements for the header
    """
    if not REPORTLAB_AVAILABLE:
        return []
    
    story = []
    styles = getSampleStyleSheet()
    
    # Get branding settings
    branding_settings = None
    primary_color = '#4f7942'
    secondary_color = '#2d5016'
    
    try:
        from .models import InstitutionBrandingSettings
        branding_settings = InstitutionBrandingSettings.objects.get(institution=institution)
        primary_color = branding_settings.primary_color
        secondary_color = branding_settings.secondary_color
    except InstitutionBrandingSettings.DoesNotExist:
        # Use default colors if no branding settings exist
        pass
    except Exception as e:
        # Log error but continue with defaults
        print(f"Error accessing branding settings for {institution.name}: {e}")
        pass
    
    # Institution info
    display_name = institution.display_name or institution.name
    subheading = institution.subheading or ''
    address = institution.address or ''
    
    # Contact info
    contact_parts = []
    if institution.contact_phone:
        contact_parts.append(f"Ph: {institution.contact_phone}")
    if institution.contact_email:
        contact_parts.append(f"Email: {institution.contact_email}")
    if institution.website:
        contact_parts.append(f"Web: {institution.website}")
    
    contact_info = " | ".join(contact_parts)
    
    # Create header table
    institution_cell = f"""
    <b><font size="12" color="{primary_color}">{display_name}</font></b><br/>
    """
    
    if subheading:
        institution_cell += f'<font size="9" color="{secondary_color}"><i>{subheading}</i></font><br/>'
    
    if address:
        institution_cell += f'<font size="8" color="#666666">{address}</font><br/>'
    
    if contact_info:
        institution_cell += f'<font size="8" color="#666666">{contact_info}</font>'
    
    # Date and time info
    date_cell = f"""
    <b><font size="9" color="{primary_color}">Report Generated</font></b><br/>
    <font size="8" color="#666666">{datetime.now().strftime('%B %d, %Y')}</font><br/>
    <font size="8" color="#666666">{datetime.now().strftime('%I:%M %p')}</font>
    """
    
    # Logo placeholder (can be replaced with actual logo if available)
    logo_cell = f'<font size="24" color="{primary_color}">🏛️</font>'
    
    # Try to use actual logo if available
    logo_path = None
    
    # First try branding settings primary logo
    if branding_settings and branding_settings.primary_logo:
        try:
            logo_path = branding_settings.primary_logo.file.path
        except:
            pass
    
    # Fallback to institution logo_file
    if not logo_path and institution.logo_file:
        try:
            logo_path = institution.logo_file.path
        except:
            pass
    
    # Fallback to institution logo_url (download and cache)
    if not logo_path and institution.logo_url:
        try:
            import requests
            from PIL import Image as PILImage
            import tempfile
            
            response = requests.get(institution.logo_url, timeout=10)
            response.raise_for_status()
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp_file:
                tmp_file.write(response.content)
                logo_path = tmp_file.name
        except Exception as e:
            print(f"Failed to download logo from URL: {e}")
    
    # Use logo if we have a valid path
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image(logo_path, width=0.8*inch, height=0.8*inch)
            logo_cell = logo
        except Exception as e:
            print(f"Failed to load logo image: {e}")
            pass
    
    header_data = [[logo_cell, institution_cell, date_cell]]
    
    header_table = Table(header_data, colWidths=[1*inch, 4.5*inch, 1.5*inch])
    header_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('ALIGN', (1, 0), (1, 0), 'LEFT'),
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor(primary_color)),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8f9fa')),
    ]))
    
    story.append(header_table)
    story.append(Spacer(1, 12))
    
    # Report title section
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=16,
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=8,
        borderWidth=1,
        borderColor=colors.HexColor(primary_color),
        borderPadding=6,
        backColor=colors.HexColor('#f0f8ff')
    )
    
    story.append(Paragraph(report_title, title_style))
    story.append(Spacer(1, 8))
    
    # Report metadata
    if report_type or department or user_name or academic_year:
        meta_parts = []
        if report_type:
            meta_parts.append(f"<b>Type:</b> {report_type}")
        if department:
            meta_parts.append(f"<b>Department:</b> {department}")
        if academic_year:
            meta_parts.append(f"<b>Academic Year:</b> {academic_year}")
        if user_name:
            meta_parts.append(f"<b>Generated By:</b> {user_name}")
        
        if meta_parts:
            meta_style = ParagraphStyle(
                'ReportMeta',
                parent=styles['Normal'],
                fontSize=9,
                alignment=TA_CENTER,
                textColor=colors.HexColor('#666666'),
                spaceAfter=12
            )
            
            story.append(Paragraph(" | ".join(meta_parts), meta_style))
    
    # Separator line
    separator_style = ParagraphStyle(
        'Separator',
        parent=styles['Normal'],
        fontSize=8,
        alignment=TA_CENTER,
        textColor=colors.HexColor(primary_color),
        spaceAfter=16
    )
    story.append(Paragraph("━" * 80, separator_style))
    
    return story


def enhance_existing_pdf_with_header(pdf_content, institution, report_title="Report", **kwargs):
    """
    Add branded header to existing PDF content
    
    Args:
        pdf_content: List of ReportLab story elements
        institution: Institution model instance
        report_title: Title of the report
        **kwargs: Additional parameters for header (report_type, department, etc.)
    
    Returns:
        Enhanced story with branded header
    """
    header_story = create_branded_report_header(institution, report_title, **kwargs)
    return header_story + pdf_content