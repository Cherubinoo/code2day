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
        try:
            pdf_doc = self._create_pdf_document(buffer, contest.institution)
            
            # Build PDF content
            story = []
            story.extend(self._create_contest_header(contest, profile))
            story.extend(self._create_contest_overview(contest))
            story.extend(self._create_participant_statistics(contest))
            story.extend(self._create_contest_leaderboard(contest))
            if contest.contest_type == 'programming':
                story.extend(self._create_problem_analysis(contest))
            story.extend(self._create_contest_footer(contest))
            pdf_doc.build(story)
        except Exception as pdf_err:
            import traceback
            return Response(
                {"error": f"PDF generation failed: {str(pdf_err)}", "trace": traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
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
        
        # Use live counts
        live_participants = ContestParticipation.objects.filter(contest=contest).count()
        if contest.contest_type == 'aptitude':
            from .models import AptitudeContestSubmission
            live_submissions = AptitudeContestSubmission.objects.filter(contest=contest).count()
        else:
            live_submissions = ContestSubmission.objects.filter(contest=contest).count()

        # Prefer access_start/end_time, fall back to start/end_time
        start_dt = contest.access_start_time or contest.start_time
        end_dt   = contest.access_end_time   or contest.end_time
        duration = contest.session_duration_minutes or contest.duration_minutes

        overview_data = [
            ['Field', 'Information'],
            ['Contest Title', contest.title],
            ['Contest Type', contest.get_contest_type_display()],
            ['Created By', contest.created_by.name if contest.created_by else 'N/A'],
            ['Department', contest.department.name if contest.department else 'N/A'],
            ['Status', contest.get_status_display()],
            ['Session Duration', f"{duration} minutes" if duration else 'N/A'],
            ['Access Start', start_dt.strftime('%B %d, %Y at %I:%M %p') if start_dt else 'Not set'],
            ['Access End',   end_dt.strftime('%B %d, %Y at %I:%M %p')   if end_dt   else 'Not set'],
            ['Total Participants', str(live_participants)],
            ['Total Submissions', str(live_submissions)],
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
            raw_avg  = participations.aggregate(avg_score=Avg('total_score'))['avg_score'] or 0
            raw_max  = participations.aggregate(max_score=Max('total_score'))['max_score'] or 0

            # Determine total_problems for normalisation
            if contest.contest_type == 'aptitude':
                n_problems = contest.aptitude_questions.count() or 1
            else:
                n_problems = contest.problems.count() or 1

            def norm(raw):
                return self._normalise_score(raw, n_problems, contest.contest_type)

            avg_score_norm = norm(raw_avg)
            max_score_norm = norm(raw_max)

            # Score distribution — always in /100 buckets
            score_ranges = [
                ('0–25',  participations.filter(total_score__lte=raw_max * 0.25).count() if raw_max > 0 else total_participants),
                ('26–50', participations.filter(total_score__gt=raw_max * 0.25, total_score__lte=raw_max * 0.5).count()  if raw_max > 0 else 0),
                ('51–75', participations.filter(total_score__gt=raw_max * 0.5,  total_score__lte=raw_max * 0.75).count() if raw_max > 0 else 0),
                ('76–100',participations.filter(total_score__gt=raw_max * 0.75).count() if raw_max > 0 else 0),
            ]
            
            # Statistics table
            stats_data = [
                ['Metric', 'Value'],
                ['Total Participants', str(total_participants)],
                ['Completed Contest', str(completed_participants)],
                ['Completion Rate', f"{(completed_participants/total_participants*100):.1f}%" if total_participants > 0 else "0%"],
                ['Average Score (/100)', f"{avg_score_norm}"],
                ['Highest Score (/100)', f"{max_score_norm}"],
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
        """
        Create:
          1. Top Performers podium (top 3)
          2. Full leaderboard table (descending score)
          3. Per-student detailed section with cumulative score out of 100
        """
        from django.db.models import Sum
        story = []
        styles = getSampleStyleSheet()

        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=10,
            textColor=colors.HexColor('#2c3e50'),
            borderWidth=1,
            borderColor=colors.HexColor('#f39c12'),
            borderPadding=6,
            backColor=colors.HexColor('#ecf0f1')
        )

        # ── Fetch all participations ordered by score desc ────────────────
        all_participations = (
            ContestParticipation.objects
            .filter(contest=contest)
            .select_related('student')
            .order_by('-total_score', 'total_time_taken')
        )

        if contest.contest_type == 'aptitude':
            from .models import AptitudeContestSubmission
            problems = list(contest.aptitude_questions.all().order_by('id'))
            total_problems = len(problems)
        else:
            problems = list(contest.problems.all().order_by('id'))
            total_problems = len(problems)

        if not all_participations.exists():
            story.append(Paragraph("No participants yet.", styles['Normal']))
            story.append(Spacer(1, 20))
            return story

        # ── 1. TOP PERFORMERS PODIUM ──────────────────────────────────────
        story.append(Paragraph("🏆 Top Performers", section_style))

        top3 = list(all_participations[:3])
        podium_colors = [
            colors.HexColor('#FFD700'),  # Gold
            colors.HexColor('#C0C0C0'),  # Silver
            colors.HexColor('#CD7F32'),  # Bronze
        ]
        medals = ['🥇 1st', '🥈 2nd', '🥉 3rd']

        podium_data = [['Medal', 'Name', 'Register No.', 'Score / 100', 'Solved', 'Time Taken']]
        for i, part in enumerate(top3):
            t = part.total_time_taken or part.time_spent_seconds or 0
            time_str = f"{t // 60}m {t % 60}s" if t else '—'
            # Normalise score to /100
            norm_score = self._normalise_score(part.total_score, total_problems, contest.contest_type)
            podium_data.append([
                medals[i],
                part.student.name,
                part.student.register_number or '—',
                f"{norm_score}/100",
                f"{part.problems_solved}/{total_problems}",
                time_str,
            ])

        podium_tbl = Table(podium_data, colWidths=[0.7*inch, 2*inch, 1.3*inch, 1*inch, 0.7*inch, 0.9*inch], repeatRows=1)
        podium_style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
        ]
        for i, _ in enumerate(top3, 1):
            podium_style_cmds.append(('BACKGROUND', (0, i), (-1, i), podium_colors[i - 1]))
            podium_style_cmds.append(('FONTNAME', (0, i), (-1, i), 'Helvetica-Bold'))
        podium_tbl.setStyle(TableStyle(podium_style_cmds))
        story.append(podium_tbl)
        story.append(Spacer(1, 20))

        # ── 2. FULL LEADERBOARD TABLE ─────────────────────────────────────
        story.append(Paragraph("📊 Full Student Results (Descending Order)", section_style))

        # For aptitude with many questions, cap the per-question columns to avoid overflow
        MAX_PROB_COLS = 15
        display_problems = problems[:MAX_PROB_COLS]
        extra_problems = len(problems) - len(display_problems)

        header = ['Rank', 'Register No.', 'Name', 'Score/100', 'Solved', 'Time', 'Status']
        for i, p in enumerate(display_problems):
            label = getattr(p, 'title', None) or getattr(p, 'question_text', '')
            short = label[:8] + '…' if len(label) > 8 else label
            header.append(f'Q{i+1}\n{short}' if contest.contest_type == 'aptitude' else f'P{i+1}\n{short}')
        if extra_problems:
            header.append(f'+{extra_problems}\nmore')

        # Fit within A4 width (~6.7 inch usable)
        fixed_width = 0.4 + 1.1 + 1.5 + 0.7 + 0.5 + 0.7 + 0.6  # = 5.5 inch
        remaining = max(0.0, 6.7 - fixed_width)
        n_prob_cols = len(display_problems) + (1 if extra_problems else 0)
        prob_col_w = round(remaining / n_prob_cols, 3) if n_prob_cols else 0.5

        col_widths = [0.4*inch, 1.1*inch, 1.5*inch, 0.7*inch, 0.5*inch, 0.7*inch, 0.6*inch]
        col_widths += [prob_col_w * inch] * (len(display_problems) + (1 if extra_problems else 0))

        rows = [header]
        for idx, part in enumerate(all_participations, 1):
            t = part.total_time_taken or part.time_spent_seconds or 0
            time_str = f"{t // 60}m {t % 60}s" if t else '—'
            status_str = 'Done' if part.completed_at else 'Active'
            norm_score = self._normalise_score(part.total_score, total_problems, contest.contest_type)
            row = [
                str(idx),
                part.student.register_number or '—',
                (part.student.name[:20] + '…') if len(part.student.name) > 20 else part.student.name,
                f"{norm_score}/100",
                f"{part.problems_solved}/{total_problems}",
                time_str,
                status_str,
            ]
            # Per-problem best result (only display_problems columns)
            for problem in display_problems:
                if contest.contest_type == 'aptitude':
                    from .models import AptitudeContestSubmission
                    best = AptitudeContestSubmission.objects.filter(
                        contest=contest, student=part.student, question=problem
                    ).first()
                    row.append('✓' if (best and best.is_correct) else ('✗' if best else '—'))
                else:
                    best = (
                        ContestSubmission.objects
                        .filter(contest=contest, student=part.student, problem=problem)
                        .order_by('-score', '-submitted_at')
                        .first()
                    )
                    row.append('✓' if (best and best.status == 'Accepted') else (f'{best.score}' if best else '—'))
            if extra_problems:
                row.append('…')
            rows.append(row)

        tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        num_rows = len(rows)  # includes header row
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f39c12')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bdc3c7')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ]
        # Only apply medal colours if those rows actually exist
        if num_rows >= 2:
            style_cmds.append(('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#fff9c4')))  # Gold
        if num_rows >= 3:
            style_cmds.append(('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#f5f5f5')))  # Silver
        if num_rows >= 4:
            style_cmds.append(('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#ffe0b2')))  # Bronze
        tbl.setStyle(TableStyle(style_cmds))
        story.append(tbl)
        story.append(Spacer(1, 24))

        # ── 3. PER-STUDENT DETAILED SECTION ──────────────────────────────
        story.append(Paragraph("📋 Individual Student Report (Descending Order)", section_style))

        student_header_style = ParagraphStyle(
            'StudentHeader',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica-Bold',
            textColor=colors.white,
            backColor=colors.HexColor('#2c3e50'),
            borderPadding=6,
            spaceAfter=4,
        )

        for idx, part in enumerate(all_participations, 1):
            student = part.student
            norm_score = self._normalise_score(part.total_score, total_problems, contest.contest_type)
            t = part.total_time_taken or part.time_spent_seconds or 0
            time_str = f"{t // 60}m {t % 60}s" if t else '—'

            story.append(Paragraph(
                f"#{idx}  {student.name}  ({student.register_number or '—'})  "
                f"Score: {norm_score}/100  |  Solved: {part.problems_solved}/{total_problems}  |  Time: {time_str}",
                student_header_style
            ))

            if contest.contest_type == 'aptitude':
                from .models import AptitudeContestSubmission
                subs = (
                    AptitudeContestSubmission.objects
                    .filter(contest=contest, student=student)
                    .select_related('question')
                    .order_by('question__id')
                )
                if not subs.exists():
                    story.append(Paragraph("  No submissions.", styles['Normal']))
                else:
                    sub_data = [['Question (truncated)', 'Selected', 'Correct?', 'Score', 'Time Taken']]
                    for sub in subs:
                        q_text = sub.question.question_text[:40] + '…' if len(sub.question.question_text) > 40 else sub.question.question_text
                        sub_data.append([
                            q_text,
                            sub.selected_option or '—',
                            'Yes ✓' if sub.is_correct else 'No ✗',
                            str(sub.score),
                            f"{sub.time_taken_seconds}s" if sub.time_taken_seconds else '—',
                        ])
                    sub_tbl = Table(sub_data, colWidths=[3.2*inch, 0.7*inch, 0.8*inch, 0.6*inch, 0.9*inch], repeatRows=1)
                    sub_tbl.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                        ('FONTSIZE', (0, 0), (-1, -1), 8),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bdc3c7')),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
                    ]))
                    for r_idx, sub in enumerate(subs, 1):
                        if sub.is_correct:
                            sub_tbl.setStyle(TableStyle([('BACKGROUND', (0, r_idx), (-1, r_idx), colors.HexColor('#d1fae5'))]))
                    story.append(sub_tbl)
            else:
                # Programming contest — group by problem, show best submission per problem
                # then all attempts
                subs = (
                    ContestSubmission.objects
                    .filter(contest=contest, student=student)
                    .select_related('problem')
                    .order_by('problem__id', '-score', '-submitted_at')
                )
                if not subs.exists():
                    story.append(Paragraph("  No submissions.", styles['Normal']))
                else:
                    # Build per-problem summary first
                    prob_summary = []
                    for problem in problems:
                        p_subs = [s for s in subs if s.problem_id == problem.id]
                        if not p_subs:
                            continue
                        best = p_subs[0]  # already ordered by -score
                        # Get test case info from ProblemSolution if available
                        ps = ProblemSolution.objects.filter(
                            student=student, problem=problem
                        ).order_by('-submitted_at').first()
                        passed = ps.passed_cases if ps else '—'
                        total_tc = ps.total_cases if ps else '—'
                        cases_str = f"{passed}/{total_tc}" if ps else '—'
                        # Per-problem score normalised to 100/num_problems
                        per_prob_max = round(100 / total_problems, 1) if total_problems else 100
                        prob_score = round((best.score / 100) * per_prob_max, 1) if best.score else 0
                        prob_summary.append([
                            (problem.title[:28] + '…') if len(problem.title) > 28 else problem.title,
                            best.language or '—',
                            best.status or '—',
                            f"{prob_score}/{per_prob_max}",
                            cases_str,
                            f"{len(p_subs)} attempt{'s' if len(p_subs) != 1 else ''}",
                            best.submitted_at.strftime('%H:%M:%S') if best.submitted_at else '—',
                        ])

                    if prob_summary:
                        sum_data = [['Problem', 'Lang', 'Best Status', 'Score', 'Test Cases', 'Attempts', 'Time']]
                        sum_data.extend(prob_summary)
                        sum_tbl = Table(
                            sum_data,
                            colWidths=[2.0*inch, 0.6*inch, 1.0*inch, 0.7*inch, 0.8*inch, 0.7*inch, 0.7*inch],
                            repeatRows=1,
                        )
                        sum_tbl.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                            ('FONTSIZE', (0, 0), (-1, -1), 8),
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bdc3c7')),
                            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#eaf4fb')]),
                        ]))
                        for r_idx, row in enumerate(prob_summary, 1):
                            if 'Accepted' in row[2]:
                                sum_tbl.setStyle(TableStyle([('BACKGROUND', (0, r_idx), (-1, r_idx), colors.HexColor('#d1fae5'))]))
                        story.append(sum_tbl)

                    # Cumulative score box
                    cum_style = ParagraphStyle(
                        'CumScore', parent=styles['Normal'],
                        fontSize=10, fontName='Helvetica-Bold',
                        textColor=colors.HexColor('#1a5276'),
                        backColor=colors.HexColor('#d6eaf8'),
                        borderPadding=5, spaceAfter=4,
                    )
                    story.append(Paragraph(
                        f"Cumulative Score: {norm_score} / 100  "
                        f"(Problems solved: {part.problems_solved}/{total_problems}  |  "
                        f"Total time: {time_str})",
                        cum_style
                    ))

            story.append(Spacer(1, 12))

        story.append(Spacer(1, 20))
        return story

    @staticmethod
    def _normalise_score(raw_score, total_problems, contest_type):
        """
        Normalise a raw cumulative score to /100.
        For programming: each problem is worth 100 pts raw → total max = 100 * n_problems
        For aptitude: each question is worth 1 pt raw → total max = n_questions
        """
        if not total_problems or not raw_score:
            return 0
        if contest_type == 'aptitude':
            # raw_score = number of correct answers; max = total_problems
            return round((raw_score / total_problems) * 100, 1)
        else:
            # raw_score = sum of per-problem scores (each 0-100); max = 100 * n_problems
            max_raw = 100 * total_problems
            return round((raw_score / max_raw) * 100, 1)

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
    except Exception:
        # Model doesn't exist or no branding settings — use defaults
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