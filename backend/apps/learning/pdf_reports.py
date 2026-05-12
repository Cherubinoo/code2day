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
        # Reserve 1.5 inches at the top for the header
        header_height = 1.5 * inch
        frame = Frame(
            self.leftMargin, self.bottomMargin, 
            self.width, self.height, 
            id='normal'
        )
        template = PageTemplate(id='main', frames=frame, onPage=self._add_header_and_watermark)
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
    
    def _add_header_and_watermark(self, canvas, doc):
        """Add dynamic institution header and watermark to each page"""
        page_width, page_height = A4
        margin = 0.6 * inch
        
        inst = self.institution
        display_name = getattr(inst, 'display_name', '') or getattr(inst, 'name', 'Institution')
        subheading = getattr(inst, 'subheading', '')
        address = getattr(inst, 'address', '')

        # ── 1. Draw Watermark (Background) ──
        if self.watermark_image:
            try:
                watermark_size = min(page_width, page_height) * 0.4
                x = (page_width - watermark_size) / 2
                y = (page_height - watermark_size) / 2
                canvas.drawImage(self.watermark_image, x, y, width=watermark_size, height=watermark_size, mask='auto')
            except: pass
        
        # ── 2. Draw Header ──
        canvas.saveState()
        
        # Logo
        logo_path = None
        if inst:
            if inst.logo_file:
                try: logo_path = inst.logo_file.path
                except: pass
            elif inst.logo_url:
                logo_path = inst.logo_url
        
        if logo_path:
            try:
                canvas.drawImage(logo_path, margin, page_height - 1.0 * inch, width=0.75 * inch, height=0.75 * inch, mask='auto')
            except: pass
        
        # Text block
        text_x = page_width/2 + 0.5*inch
        
        # Display Name (Red)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.setFillColor(colors.HexColor('#ED1C24'))
        canvas.drawCentredString(text_x, page_height - 0.45*inch, display_name.upper())
        
        # Subheading (Gold)
        if subheading:
            canvas.setFont("Helvetica-Bold", 9)
            canvas.setFillColor(colors.HexColor('#FFA000'))
            canvas.drawCentredString(text_x, page_height - 0.6*inch, subheading.upper())
        
        # Address lines (Blue/Grey)
        if address:
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(colors.HexColor('#2c3e50'))
            address_lines = address.split('\n')
            y = page_height - (0.72 * inch if subheading else 0.6 * inch)
            for line in address_lines[:3]:
                canvas.drawCentredString(text_x, y, line.strip())
                y -= 11
        
        # Red line
        canvas.setStrokeColor(colors.HexColor('#ED1C24'))
        canvas.setLineWidth(1.2)
        canvas.line(margin, page_height - 1.05*inch, page_width - margin, page_height - 1.05*inch)
        
        canvas.restoreState()


def create_watermarked_pdf_contest(buffer, institution=None, **kwargs):
    """Create a PDF document with branding support for contest reports"""
    return WatermarkDocTemplate(buffer, institution=institution, **kwargs)


# ---------------------------------------------------------------------------
# Palette
# ---------------------------------------------------------------------------
_RAMCO_RED = '#ED1C24'
_RAMCO_GOLD = '#FFA000'
_RAMCO_BLUE = '#005696'

_NAVY    = '#1a1a2e'
_BLUE    = '#16213e'
_INDIGO  = '#0f3460'
_TEAL    = '#0d7377'
_GREEN   = '#27ae60'
_ORANGE  = '#e67e22'
_RED     = '#e74c3c'
_GOLD    = '#f1c40f'
_LIGHT   = '#f8fafc'
_WHITE   = '#ffffff'
_BORDER  = '#e2e8f0'
_GRAY    = '#64748b'
_DARK    = '#1e293b'
_SLATE   = '#334155'
_PURPLE  = '#7c3aed'



def _hx(h):
    if not isinstance(h, str): return h
    return colors.HexColor(h)


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def _metric_card(label, value, sub='', bg='#0f3460', fg='#ffffff', w=1.5*inch, h=0.85*inch):
    """Return a single metric card as a 1-cell Table."""
    cell = (
        f'<font size="7" color="{fg}">{label}</font><br/>'
        f'<font size="16" color="{fg}"><b>{value}</b></font>'
        + (f'<br/><font size="6" color="{fg}">{sub}</font>' if sub else '')
    )
    t = Table([[Paragraph(cell, ParagraphStyle('mc', fontName='Helvetica', leading=14))]], colWidths=[w], rowHeights=[h])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), _hx(bg)),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [6]),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    return t


def _section_header(title, color=_INDIGO):
    """Bold section divider bar."""
    s = ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=11,
                       textColor=_hx('#ffffff'), backColor=_hx(color),
                       borderPadding=(6, 10, 6, 10), spaceAfter=8, spaceBefore=14)
    return Paragraph(f'  {title}', s)


def _divider():
    d = Drawing(480, 2)
    d.add(Rect(0, 0, 480, 2, fillColor=_hx(_BORDER), strokeColor=None))
    return d


def _pie_chart(data, labels, colors_list, size=120):
    """Return a Drawing with a pie chart."""
    d = Drawing(size, size)
    pie = Pie()
    pie.x = size // 2 - 40
    pie.y = size // 2 - 40
    pie.width = 80
    pie.height = 80
    pie.data = data if data else [1]
    pie.labels = labels if data else ['No data']
    pie.slices.strokeWidth = 0.5
    for i, c in enumerate(colors_list[:len(pie.data)]):
        pie.slices[i].fillColor = _hx(c)
    d.add(pie)
    return d


def _bar_chart(data, labels, bar_color=_INDIGO, w=300, h=120):
    """Return a Drawing with a vertical bar chart."""
    d = Drawing(w, h)
    if not data or max(data) == 0:
        return d
    bc = VerticalBarChart()
    bc.x = 30
    bc.y = 20
    bc.width = w - 50
    bc.height = h - 30
    bc.data = [data]
    bc.categoryAxis.categoryNames = labels
    bc.categoryAxis.labels.fontSize = 6
    bc.categoryAxis.labels.angle = 30
    bc.valueAxis.valueMin = 0
    bc.valueAxis.valueMax = max(data) * 1.2 or 1
    bc.valueAxis.labels.fontSize = 6
    bc.bars[0].fillColor = _hx(bar_color)
    bc.bars[0].strokeColor = None
    d.add(bc)
    return d


# ---------------------------------------------------------------------------
# AI-style insight generator (rule-based, no external API)
# ---------------------------------------------------------------------------

def _generate_insights(contest, participations, problems, contest_type):
    """Generate rule-based analytical insights."""
    n = participations.count()
    if n == 0:
        return ["No participants yet — insights will appear once students attempt the contest."]

    from django.db.models import Avg, Max, Min, Count
    avg_score = participations.aggregate(a=Avg('total_score'))['a'] or 0
    max_score = participations.aggregate(m=Max('total_score'))['m'] or 0
    completed  = participations.filter(completed_at__isnull=False).count()
    completion_rate = round(completed / n * 100, 1) if n else 0

    insights = []

    # Participation
    if n >= 10:
        insights.append(f"Strong participation with {n} students — contest engagement is healthy.")
    elif n >= 5:
        insights.append(f"Moderate participation ({n} students). Consider promoting future contests earlier.")
    else:
        insights.append(f"Low participation ({n} students). Recommend mandatory participation or incentives.")

    # Completion
    if completion_rate >= 80:
        insights.append(f"Excellent completion rate of {completion_rate}% — students are committed to finishing.")
    elif completion_rate >= 50:
        insights.append(f"Completion rate of {completion_rate}% is average. Time management may be a challenge.")
    else:
        insights.append(f"Low completion rate ({completion_rate}%). Consider extending session duration or reducing problem count.")

    # Score spread
    n_problems = len(problems)
    if contest_type == 'aptitude':
        max_possible = n_problems
        norm_avg = round((avg_score / max_possible) * 100, 1) if max_possible else 0
    else:
        max_possible = 100 * n_problems
        norm_avg = round((avg_score / max_possible) * 100, 1) if max_possible else 0

    if norm_avg >= 75:
        insights.append(f"Average normalised score of {norm_avg}/100 indicates the contest was well-calibrated.")
    elif norm_avg >= 50:
        insights.append(f"Average score of {norm_avg}/100 suggests moderate difficulty — a few problems may need hints.")
    else:
        insights.append(f"Average score of {norm_avg}/100 is low. Problems may be too hard or students need more preparation.")

    # Problem difficulty insights
    if problems:
        is_apt = contest_type == 'aptitude'
        if is_apt:
            from .models import AptitudeContestSubmission as CS
            prob_field = 'question'
        else:
            from .models import ContestSubmission as CS
            prob_field = 'problem'

        hardest = None
        hardest_rate = 101
        easiest = None
        easiest_rate = -1
        
        for p in problems:
            filter_kwargs = {'contest': contest, prob_field: p}
            total = CS.objects.filter(**filter_kwargs).count()
            if total > 0:
                if is_apt:
                    acc = CS.objects.filter(is_correct=True, **filter_kwargs).count()
                else:
                    acc = CS.objects.filter(status='Accepted', **filter_kwargs).count()
                rate = (acc / total) * 100
                if rate < hardest_rate:
                    hardest_rate = rate
                    hardest = p
                if rate > easiest_rate:
                    easiest_rate = rate
                    easiest = p

        if hardest:
            h_title = (hardest.question_text[:40] + "...") if is_apt else hardest.title
            insights.append(f"Problem '{h_title}' was the most challenging with a {round(hardest_rate,1)}% success rate.")
        if easiest and easiest != hardest:
            e_title = (easiest.question_text[:40] + "...") if is_apt else easiest.title
            insights.append(f"Students found '{e_title}' most approachable ({round(easiest_rate,1)}% success).")

    # Recommendations
    insights.append("Recommended: conduct a post-contest review session focusing on unsolved problems.")
    if norm_avg < 50:
        insights.append("Suggested training topics: time complexity, edge cases, and problem decomposition.")

    return insights


# ---------------------------------------------------------------------------
# Main PDF View
# ---------------------------------------------------------------------------

@method_decorator(csrf_exempt, name='dispatch')
class ContestReportPDFView(UnifiedAuthMixin, APIView):
    """
    Generate a professional contest analytics PDF report.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not REPORTLAB_AVAILABLE:
            return Response({"error": "reportlab not installed"}, status=500)

        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        try:
            contest = Contest.objects.select_related('created_by', 'department', 'institution').get(id=contest_id)
        except Contest.DoesNotExist:
            return Response({"error": "Contest not found"}, status=404)

        if not self._can_access_contest(profile, profile_type, contest):
            return Response({"error": "Access denied."}, status=403)

        buffer = BytesIO()
        try:
            doc = create_watermarked_pdf_contest(
                buffer, institution=contest.institution,
                pagesize=A4,
                rightMargin=0.6*inch, leftMargin=0.6*inch,
                topMargin=1.2*inch, bottomMargin=0.6*inch,
            )
            story = self._build_story(contest, profile)
            doc.build(story)
        except Exception as e:
            import traceback
            return Response(
                {"error": f"PDF generation failed: {str(e)}", "trace": traceback.format_exc()},
                status=500,
            )

        buffer.seek(0)
        resp = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        resp['Content-Disposition'] = f'attachment; filename="contest_{contest.id}_{ts}.pdf"'
        return resp

    def _can_access_contest(self, profile, profile_type, contest):
        if profile_type == "student":
            return contest.participations.filter(student=profile).exists()
        elif profile_type in ("staff", "hod"):
            return (profile.institution == contest.institution and
                    profile.department == contest.department)
        elif profile_type in ("director", "tpu", "ja"):
            return profile.institution == contest.institution
        elif profile_type == "admin":
            return True
        return False

    def _normalise_score(self, raw_score, n_problems, contest_type):
        """Normalise a score to a 0-100 scale"""
        if not n_problems or n_problems == 0:
            return 0
        if contest_type == 'aptitude':
            # Each aptitude question is 1 mark
            return round((raw_score / n_problems) * 100, 1)
        else:
            # Each programming problem is 100 marks max (as per StudentContestSubmitView)
            return round((raw_score / (n_problems * 100)) * 100, 1)

    # ------------------------------------------------------------------
    # Master story builder
    # ------------------------------------------------------------------
    def _build_story(self, contest, profile):
        from django.db.models import Avg, Max, Min, Sum, Count
        from .models import AptitudeContestSubmission

        is_apt = contest.contest_type == 'aptitude'
        participations = (ContestParticipation.objects
                          .filter(contest=contest)
                          .select_related('student')
                          .order_by('-total_score', 'total_time_taken'))
        if is_apt:
            problems = list(contest.aptitude_questions.all().order_by('id'))
        else:
            problems = list(contest.problems.all().order_by('id'))
        n_problems = len(problems)

        story = []
        story += self._cover_page(contest, profile)
        story.append(PageBreak())
        
        story += self._overview_section(contest, participations, is_apt, n_problems)
        story.append(Spacer(1, 15))
        story += self._analytics_dashboard(contest, participations, problems, is_apt)
        story.append(PageBreak())
        
        story += self._leaderboard_section(contest, participations, problems, is_apt, n_problems)
        
        return story

    # ------------------------------------------------------------------
    # 1. Cover Page
    # ------------------------------------------------------------------
    def _cover_page(self, contest, profile):
        story = []
        styles = getSampleStyleSheet()

        story.append(Spacer(1, 0.8 * inch))

        # ── Contest title block ──
        title_s = ParagraphStyle('ct', fontName='Helvetica-Bold', fontSize=26,
                                 alignment=1, textColor=_hx(_NAVY), spaceAfter=12)
        story.append(Paragraph(contest.title, title_s))

        sub_s = ParagraphStyle('cs', fontName='Helvetica-Bold', fontSize=14,
                               alignment=1, textColor=_hx(_GRAY), spaceAfter=30)
        ctype = 'Aptitude Contest Report' if contest.contest_type == 'aptitude' else 'Programming Contest Report'
        story.append(Paragraph(ctype, sub_s))

        # ── Info section ──
        story.append(Spacer(1, 20))
        dept  = contest.department.name if contest.department else 'N/A'
        by    = getattr(profile, 'name', 'Administrator')
        start_dt = contest.access_start_time or contest.start_time
        dur   = contest.session_duration_minutes or contest.duration_minutes or 0

        info_data = [
            [Paragraph('<b>Department:</b>', styles['Normal']), dept],
            [Paragraph('<b>Generated By:</b>', styles['Normal']), by],
            [Paragraph('<b>Contest Date:</b>', styles['Normal']), start_dt.strftime('%d %b %Y') if start_dt else 'N/A'],
            [Paragraph('<b>Duration:</b>', styles['Normal']), f'{dur} minutes'],
        ]
        info_tbl = Table(info_data, colWidths=[1.5*inch, 3.5*inch])
        info_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ]))
        story.append(info_tbl)
        
        story.append(Spacer(1, 50))
        
        # ── Decorative rule ──
        d = Drawing(480, 4)
        d.add(Rect(0, 0, 480, 4, fillColor=_hx(_RAMCO_RED), strokeColor=None))
        story.append(d)
        story.append(Spacer(1, 8))

        conf_s = ParagraphStyle('conf', fontName='Helvetica', fontSize=8,
                                alignment=1, textColor=_hx(_GRAY))
        story.append(Paragraph('CONFIDENTIAL — FOR INTERNAL USE ONLY', conf_s))
        return story

    # ------------------------------------------------------------------
    # 2. Executive Summary
    # ------------------------------------------------------------------
    def _executive_summary(self, contest, participations, problems, is_apt):
        story = [_section_header('EXECUTIVE SUMMARY', _NAVY)]
        insights = _generate_insights(contest, participations, problems,
                                      'aptitude' if is_apt else 'programming')
        for i, txt in enumerate(insights, 1):
            bullet_s = ParagraphStyle(f'b{i}', fontName='Helvetica', fontSize=9,
                                      textColor=_hx(_DARK), leading=14,
                                      leftIndent=12, spaceAfter=5)
            story.append(Paragraph(f'<b>{i}.</b>  {txt}', bullet_s))
        story.append(Spacer(1, 10))
        return story

    # ------------------------------------------------------------------
    # 3. Contest Overview
    # ------------------------------------------------------------------
    def _overview_section(self, contest, participations, is_apt, n_problems):
        from django.db.models import Avg, Max
        from .models import AptitudeContestSubmission
        story = [_section_header('CONTEST OVERVIEW', _INDIGO)]

        n = participations.count()
        completed = participations.filter(completed_at__isnull=False).count()
        comp_rate = round(completed / n * 100, 1) if n else 0

        if is_apt:
            subs_count = AptitudeContestSubmission.objects.filter(contest=contest).count()
        else:
            subs_count = ContestSubmission.objects.filter(contest=contest).count()

        raw_avg = participations.aggregate(a=Avg('total_score'))['a'] or 0
        raw_max = participations.aggregate(m=Max('total_score'))['m'] or 0
        avg_norm = self._normalise_score(raw_avg, n_problems, contest.contest_type)
        max_norm = self._normalise_score(raw_max, n_problems, contest.contest_type)

        start_dt = contest.access_start_time or contest.start_time
        end_dt   = contest.access_end_time   or contest.end_time
        dur      = contest.session_duration_minutes or contest.duration_minutes or 0

        # Two-column info table
        left = [
            ['Contest Title', contest.title],
            ['Type', 'Aptitude' if is_apt else 'Programming'],
            ['Status', contest.get_status_display()],
            ['Department', contest.department.name if contest.department else 'N/A'],
            ['Created By', contest.created_by.name if contest.created_by else 'N/A'],
        ]
        right = [
            ['Session Duration', f'{dur} min'],
            ['Access Start', start_dt.strftime('%d %b %Y %I:%M %p') if start_dt else 'Not set'],
            ['Access End',   end_dt.strftime('%d %b %Y %I:%M %p')   if end_dt   else 'Not set'],
            ['Problems / Questions', str(n_problems)],
            ['Report Generated', datetime.now().strftime('%d %b %Y %I:%M %p')],
        ]

        def _info_tbl(rows):
            t = Table(rows, colWidths=[1.5*inch, 2.0*inch])
            t.setStyle(TableStyle([
                ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
                ('FONTNAME', (1,0), (1,-1), 'Helvetica'),
                ('FONTSIZE', (0,0), (-1,-1), 8),
                ('TEXTCOLOR', (0,0), (0,-1), _hx(_SLATE)),
                ('TEXTCOLOR', (1,0), (1,-1), _hx(_DARK)),
                ('ROWBACKGROUNDS', (0,0), (-1,-1), [_hx(_LIGHT), _hx(_WHITE)]),
                ('GRID', (0,0), (-1,-1), 0.3, _hx(_BORDER)),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('LEFTPADDING', (0,0), (-1,-1), 6),
            ]))
            return t

        two_col = Table([[_info_tbl(left), _info_tbl(right)]], colWidths=[3.6*inch, 3.6*inch])
        two_col.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),
                                      ('LEFTPADDING',(0,0),(-1,-1),0),
                                      ('RIGHTPADDING',(0,0),(-1,-1),8)]))
        story.append(two_col)
        story.append(Spacer(1, 14))

        # Metric cards row
        cards = [
            _metric_card('Participants', str(n), bg=_INDIGO),
            _metric_card('Submissions', str(subs_count), bg=_TEAL),
            _metric_card('Completion Rate', f'{comp_rate}%', bg=_GREEN),
            _metric_card('Avg Score', f'{avg_norm}/100', bg=_ORANGE),
            _metric_card('Top Score', f'{max_norm}/100', bg='#7c3aed'),
        ]
        row = Table([cards], colWidths=[1.35*inch]*5)
        row.setStyle(TableStyle([('ALIGN',(0,0),(-1,-1),'CENTER'),
                                  ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                                  ('LEFTPADDING',(0,0),(-1,-1),3),
                                  ('RIGHTPADDING',(0,0),(-1,-1),3)]))
        story.append(row)
        story.append(Spacer(1, 14))
        return story

    # ------------------------------------------------------------------
    # 4. Analytics Dashboard
    # ------------------------------------------------------------------
    def _analytics_dashboard(self, contest, participations, problems, is_apt):
        story = [_section_header('PERFORMANCE ANALYTICS', _RAMCO_RED)]
        from django.db.models import Avg, Max, Count
        from .models import AptitudeContestSubmission

        n = participations.count()
        n_problems = len(problems)

        # Compute per-student avg attempts
        if is_apt:
            total_subs = AptitudeContestSubmission.objects.filter(contest=contest).count()
        else:
            total_subs = ContestSubmission.objects.filter(contest=contest).count()
        avg_attempts = round(total_subs / n, 1) if n else 0

        # Hardest / most solved problem
        hardest_name = 'N/A'
        most_solved_name = 'N/A'
        top_lang = 'N/A'
        
        if problems:
            rates = []
            for p in problems:
                if is_apt:
                    tot = AptitudeContestSubmission.objects.filter(contest=contest, question=p).count()
                    acc = AptitudeContestSubmission.objects.filter(contest=contest, question=p, is_correct=True).count()
                else:
                    tot = ContestSubmission.objects.filter(contest=contest, problem=p).count()
                    acc = ContestSubmission.objects.filter(contest=contest, problem=p, status='Accepted').count()
                rates.append((p.title if not is_apt else f"Q{problems.index(p)+1}", acc / tot * 100 if tot else 0, acc))
            
            rates.sort(key=lambda x: x[1])
            if rates:
                hardest_name = rates[0][0][:20]
                most_solved_name = rates[-1][0][:20]
                
            if not is_apt:
                # Top language (Programming only)
                from django.db.models import Count as DCount
                lang_qs = (ContestSubmission.objects.filter(contest=contest)
                           .values('language').annotate(c=DCount('id')).order_by('-c').first())
                top_lang = lang_qs['language'] if lang_qs else 'N/A'
            else:
                top_lang = 'N/A (Aptitude)'

        raw_avg = participations.aggregate(a=Avg('total_score'))['a'] or 0
        avg_norm = self._normalise_score(raw_avg, n_problems, contest.contest_type)
        comp_rate = round(participations.filter(completed_at__isnull=False).count() / n * 100, 1) if n else 0

        cards = [
            _metric_card('Total Participants', str(n), bg=_INDIGO, w=1.6*inch),
            _metric_card('Total Problems', str(n_problems), bg=_TEAL, w=1.6*inch),
            _metric_card('Avg Score', f'{avg_norm}/100', bg=_GREEN, w=1.6*inch),
            _metric_card('Avg Attempts', str(avg_attempts), bg=_ORANGE, w=1.6*inch),
        ]
        row1 = Table([cards], colWidths=[1.65*inch]*4)
        row1.setStyle(TableStyle([('ALIGN',(0,0),(-1,-1),'CENTER'),
                                   ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                                   ('LEFTPADDING',(0,0),(-1,-1),3),
                                   ('RIGHTPADDING',(0,0),(-1,-1),3)]))
        story.append(row1)
        story.append(Spacer(1, 6))

        cards2 = [
            _metric_card('Completion Rate', f'{comp_rate}%', bg='#7c3aed', w=1.6*inch),
            _metric_card('Hardest Question' if is_apt else 'Hardest Problem', hardest_name, bg=_RED, w=1.6*inch),
            _metric_card('Most Solved', most_solved_name, bg='#0d7377', w=1.6*inch),
            _metric_card('Analysis Status', 'Complete' if n > 0 else 'Pending', bg=_SLATE, w=1.6*inch),
        ]
        row2 = Table([cards2], colWidths=[1.65*inch]*4)
        row2.setStyle(TableStyle([('ALIGN',(0,0),(-1,-1),'CENTER'),
                                   ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                                   ('LEFTPADDING',(0,0),(-1,-1),3),
                                   ('RIGHTPADDING',(0,0),(-1,-1),3)]))
        story.append(row2)
        story.append(Spacer(1, 14))

        # Score distribution bar chart + solved/unsolved pie side by side
        if n > 0:
            possible_max = n_problems if is_apt else (n_problems * 100)
            if possible_max == 0: possible_max = 1
            
            buckets = [
                participations.filter(total_score__lte=possible_max*0.25).count(),
                participations.filter(total_score__gt=possible_max*0.25, total_score__lte=possible_max*0.5).count(),
                participations.filter(total_score__gt=possible_max*0.5,  total_score__lte=possible_max*0.75).count(),
                participations.filter(total_score__gt=possible_max*0.75).count(),
            ]
            bar = _bar_chart(buckets, ['0-25%','26-50%','51-75%','76-100%'],
                             bar_color=_INDIGO, w=300, h=140)

            solved_total = sum(p.problems_solved for p in participations)
            unsolved_total = max(0, n * n_problems - solved_total)
            pie = _pie_chart(
                [solved_total, unsolved_total] if (solved_total + unsolved_total) > 0 else [1, 0],
                ['Correct', 'Incorrect'] if is_apt else ['Solved', 'Unsolved'],
                [_GREEN, _RED], size=130
            )

            chart_row = Table(
                [[bar, pie]],
                colWidths=[3.8*inch, 2.2*inch]
            )
            chart_row.setStyle(TableStyle([
                ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                ('ALIGN',(0,0),(-1,-1),'CENTER'),
                ('BOX',(0,0),(-1,-1),0.5,_hx(_BORDER)),
                ('BACKGROUND',(0,0),(-1,-1),_hx(_LIGHT)),
            ]))

            label_s = ParagraphStyle('cl', fontName='Helvetica', fontSize=7,
                                     textColor=_hx(_GRAY), alignment=1)
            chart_labels = Table(
                [[Paragraph('Score Distribution', label_s),
                  Paragraph('Solved vs Unsolved', label_s)]],
                colWidths=[3.8*inch, 2.2*inch]
            )
            story.append(chart_row)
            story.append(chart_labels)
            story.append(Spacer(1, 10))

        return story


    # ------------------------------------------------------------------
    # 5. Leaderboard
    # ------------------------------------------------------------------
    def _leaderboard_section(self, contest, participations, problems, is_apt, n_problems):
        story = [_section_header('PARTICIPANT RESULTS', _RAMCO_RED)]
        from .models import AptitudeContestSubmission
        if not participations.exists():
            story.append(Paragraph("No participants yet.", ParagraphStyle("np", fontSize=9)))
            return story
        top3 = list(participations[:3])
        medals = ["1st", "2nd", "3rd"]
        pod_bg = ["#FFD700", "#C0C0C0", "#CD7F32"]
        pod_data = [["", "Name", "Reg. No.", "Score/100", "Solved", "Time"]]
        for i, p in enumerate(top3):
            t = p.total_time_taken or p.time_spent_seconds or 0
            pod_data.append([medals[i], p.student.name[:22], p.student.register_number or "-",
                f"{self._normalise_score(p.total_score, n_problems, contest.contest_type)}/100",
                f"{p.problems_solved}/{n_problems}", f"{t//60}m {t%60}s" if t else "-"])
        pod = Table(pod_data, colWidths=[0.4*inch, 2.0*inch, 1.3*inch, 0.9*inch, 0.7*inch, 0.9*inch], repeatRows=1)
        pod_cmds = [
            ("BACKGROUND", (0,0), (-1,0), _hx(_NAVY)), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
            ("ALIGN", (0,0), (-1,-1), "CENTER"), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("GRID", (0,0), (-1,-1), 0.3, _hx(_BORDER)),
        ]
        for i in range(len(top3)):
            pod_cmds.append(("BACKGROUND", (0, i+1), (-1, i+1), _hx(pod_bg[i])))
            pod_cmds.append(("FONTNAME", (0, i+1), (-1, i+1), "Helvetica-Bold"))
        pod.setStyle(TableStyle(pod_cmds))
        story.append(pod)
        story.append(Spacer(1, 12))
        MAX_Q = 12
        disp = problems[:MAX_Q]
        extra = len(problems) - len(disp)
        hdr = ["Rank", "Name", "Reg. No.", "Score/100", "Solved", "Accuracy", "Efficiency", "Time"]
        for i in range(len(disp)):
            hdr.append(f"{'Q' if is_apt else 'P'}{i+1}")
        if extra:
            hdr.append(f"+{extra}")
        fixed_w = 0.35 + 1.8 + 1.1 + 0.75 + 0.55 + 0.7 + 0.7 + 0.7
        rem = max(0.0, 6.7 - fixed_w)
        n_pc = len(disp) + (1 if extra else 0)
        pcw = round(rem / n_pc, 3) if n_pc else 0.4
        cw = [0.35*inch, 1.8*inch, 1.1*inch, 0.75*inch, 0.55*inch, 0.7*inch, 0.7*inch, 0.7*inch]
        cw += [pcw*inch] * (len(disp) + (1 if extra else 0))
        rows = [hdr]
        for rank, part in enumerate(participations, 1):
            t = part.total_time_taken or part.time_spent_seconds or 0
            norm = self._normalise_score(part.total_score, n_problems, contest.contest_type)
            if is_apt:
                total_s = AptitudeContestSubmission.objects.filter(contest=contest, student=part.student).count()
                correct = AptitudeContestSubmission.objects.filter(contest=contest, student=part.student, is_correct=True).count()
            else:
                total_s = ContestSubmission.objects.filter(contest=contest, student=part.student).count()
                correct = ContestSubmission.objects.filter(contest=contest, student=part.student, status="Accepted").count()
            acc = f"{round(correct/total_s*100,1)}%" if total_s else "-"
            eff = f"{round(part.problems_solved/total_s*100,1)}%" if total_s else "-"
            row = [str(rank), part.student.name[:22], part.student.register_number or "-",
                   f"{norm}/100", f"{part.problems_solved}/{n_problems}", acc, eff,
                   f"{t//60}m {t%60}s" if t else "-"]
            for prob in disp:
                if is_apt:
                    b = AptitudeContestSubmission.objects.filter(contest=contest, student=part.student, question=prob).first()
                    row.append("v" if (b and b.is_correct) else ("x" if b else "-"))
                else:
                    b = ContestSubmission.objects.filter(contest=contest, student=part.student, problem=prob).order_by("-score").first()
                    row.append("v" if (b and b.status == "Accepted") else (str(b.score) if b else "-"))
            if extra:
                row.append("...")
            rows.append(row)
        tbl = Table(rows, colWidths=cw, repeatRows=1)
        nr = len(rows)
        cmds = [
            ("BACKGROUND", (0,0), (-1,0), _hx(_INDIGO)), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
            ("FONTSIZE", (0,0), (-1,-1), 7), ("ALIGN", (0,0), (-1,-1), "CENTER"),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("GRID", (0,0), (-1,-1), 0.3, _hx(_BORDER)),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [_hx(_WHITE), _hx(_LIGHT)]),
        ]
        if nr >= 2: cmds.append(("BACKGROUND", (0,1), (-1,1), _hx("#fff9c4")))
        if nr >= 3: cmds.append(("BACKGROUND", (0,2), (-1,2), _hx("#f5f5f5")))
        if nr >= 4: cmds.append(("BACKGROUND", (0,3), (-1,3), _hx("#ffe0b2")))
        tbl.setStyle(TableStyle(cmds))
        story.append(tbl)
        story.append(Spacer(1, 10))
        return story

    # ------------------------------------------------------------------
    # 6. Student Performance Analysis
    # ------------------------------------------------------------------
    def _student_performance_section(self, contest, participations, problems, is_apt, n_problems):
        from .models import AptitudeContestSubmission
        story = [_section_header("STUDENT PERFORMANCE ANALYSIS", _SLATE)]
        name_s = ParagraphStyle("sn", fontName="Helvetica-Bold", fontSize=9,
                                textColor=colors.white, backColor=_hx(_DARK),
                                borderPadding=(5, 8, 5, 8), spaceAfter=3)
        cell_s = ParagraphStyle("sc", fontName="Helvetica", fontSize=8, textColor=_hx(_DARK), leading=12)
        for rank, part in enumerate(participations, 1):
            student = part.student
            norm = self._normalise_score(part.total_score, n_problems, contest.contest_type)
            t = part.total_time_taken or part.time_spent_seconds or 0
            time_str = f"{t//60}m {t%60}s" if t else "-"
            story.append(Paragraph(
                f"#{rank}  {student.name}  ({student.register_number or '-'})  "
                f"Score: {norm}/100  |  Solved: {part.problems_solved}/{n_problems}  |  Time: {time_str}",
                name_s))
            if is_apt:
                subs = (AptitudeContestSubmission.objects.filter(contest=contest, student=student)
                        .select_related("question").order_by("question__id"))
                total_s = subs.count()
                correct = subs.filter(is_correct=True).count()
                wrong = total_s - correct
                acc = round(correct / total_s * 100, 1) if total_s else 0
                strengths = "Good accuracy" if acc >= 70 else "Needs improvement"
                weakness = "Low accuracy" if acc < 50 else ("Moderate accuracy" if acc < 70 else "None identified")
                meta = Table([[
                    Paragraph(f"<b>Answered:</b> {total_s}/{n_problems}", cell_s),
                    Paragraph(f"<b>Correct:</b> {correct}", cell_s),
                    Paragraph(f"<b>Wrong:</b> {wrong}", cell_s),
                    Paragraph(f"<b>Accuracy:</b> {acc}%", cell_s),
                    Paragraph(f"<b>Strength:</b> {strengths}", cell_s),
                    Paragraph(f"<b>Weakness:</b> {weakness}", cell_s),
                ]], colWidths=[1.1*inch]*6)
                meta.setStyle(TableStyle([
                    ("BACKGROUND",(0,0),(-1,-1),_hx(_LIGHT)), ("GRID",(0,0),(-1,-1),0.3,_hx(_BORDER)),
                    ("TOPPADDING",(0,0),(-1,-1),3), ("BOTTOMPADDING",(0,0),(-1,-1),3),
                    ("LEFTPADDING",(0,0),(-1,-1),4),
                ]))
                story.append(meta)
                if subs.exists():
                    sub_data = [["Question", "Selected", "Correct?", "Score", "Time"]]
                    for sub in subs:
                        qt = sub.question.question_text[:38] + "..." if len(sub.question.question_text) > 38 else sub.question.question_text
                        sub_data.append([qt, sub.selected_option or "-",
                                         "Yes" if sub.is_correct else "No",
                                         str(sub.score),
                                         f"{sub.time_taken_seconds}s" if sub.time_taken_seconds else "-"])
                    st = Table(sub_data, colWidths=[3.3*inch, 0.65*inch, 0.75*inch, 0.55*inch, 0.7*inch], repeatRows=1)
                    st.setStyle(TableStyle([
                        ("BACKGROUND",(0,0),(-1,0),_hx(_TEAL)), ("TEXTCOLOR",(0,0),(-1,0),colors.white),
                        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"), ("FONTNAME",(0,1),(-1,-1),"Helvetica"),
                        ("FONTSIZE",(0,0),(-1,-1),7), ("ALIGN",(0,0),(-1,-1),"CENTER"),
                        ("ALIGN",(0,1),(0,-1),"LEFT"), ("GRID",(0,0),(-1,-1),0.3,_hx(_BORDER)),
                        ("ROWBACKGROUNDS",(0,1),(-1,-1),[_hx(_WHITE),_hx(_LIGHT)]),
                    ]))
                    for ri, sub in enumerate(subs, 1):
                        if sub.is_correct:
                            st.setStyle(TableStyle([("BACKGROUND",(0,ri),(-1,ri),_hx("#d1fae5"))]))
                    story.append(st)
            else:
                subs = (ContestSubmission.objects.filter(contest=contest, student=student)
                        .select_related("problem").order_by("problem__id", "-score", "-submitted_at"))
                total_s = subs.count()
                correct = subs.filter(status="Accepted").values("problem").distinct().count()
                wrong = total_s - subs.filter(status="Accepted").count()
                acc = round(correct / n_problems * 100, 1) if n_problems else 0
                langs = list(subs.values_list("language", flat=True).distinct())
                strengths = ", ".join(langs[:3]) if langs else "N/A"
                weakness = "Multiple wrong submissions" if wrong > total_s * 0.5 else "Good submission quality"
                meta = Table([[
                    Paragraph(f"<b>Attempts:</b> {total_s}", cell_s),
                    Paragraph(f"<b>Solved:</b> {correct}/{n_problems}", cell_s),
                    Paragraph(f"<b>Wrong Subs:</b> {wrong}", cell_s),
                    Paragraph(f"<b>Accuracy:</b> {acc}%", cell_s),
                    Paragraph(f"<b>Languages:</b> {strengths}", cell_s),
                    Paragraph(f"<b>Note:</b> {weakness}", cell_s),
                ]], colWidths=[1.1*inch]*6)
                meta.setStyle(TableStyle([
                    ("BACKGROUND",(0,0),(-1,-1),_hx(_LIGHT)), ("GRID",(0,0),(-1,-1),0.3,_hx(_BORDER)),
                    ("TOPPADDING",(0,0),(-1,-1),3), ("BOTTOMPADDING",(0,0),(-1,-1),3),
                    ("LEFTPADDING",(0,0),(-1,-1),4),
                ]))
                story.append(meta)
                if subs.exists():
                    prob_rows = []
                    for prob in problems:
                        ps_list = [s for s in subs if s.problem_id == prob.id]
                        if not ps_list:
                            continue
                        best = ps_list[0]
                        ps = ProblemSolution.objects.filter(student=student, problem=prob).order_by("-submitted_at").first()
                        cases = f"{ps.passed_cases}/{ps.total_cases}" if ps else "-"
                        per_max = round(100 / n_problems, 1) if n_problems else 100
                        p_score = round((best.score / 100) * per_max, 1) if best.score else 0
                        prob_rows.append([
                            (prob.title[:26]+"...") if len(prob.title) > 26 else prob.title,
                            best.language or "-", best.status or "-",
                            f"{p_score}/{per_max}", cases,
                            f"{len(ps_list)} att.",
                            best.submitted_at.strftime("%H:%M:%S") if best.submitted_at else "-",
                        ])
                    if prob_rows:
                        hdr2 = [["Problem","Lang","Best Status","Score","Test Cases","Attempts","Time"]]
                        st = Table(hdr2 + prob_rows,
                                   colWidths=[2.0*inch,0.6*inch,1.0*inch,0.65*inch,0.8*inch,0.65*inch,0.7*inch],
                                   repeatRows=1)
                        st.setStyle(TableStyle([
                            ("BACKGROUND",(0,0),(-1,0),_hx(_INDIGO)), ("TEXTCOLOR",(0,0),(-1,0),colors.white),
                            ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"), ("FONTNAME",(0,1),(-1,-1),"Helvetica"),
                            ("FONTSIZE",(0,0),(-1,-1),7), ("ALIGN",(0,0),(-1,-1),"CENTER"),
                            ("ALIGN",(0,1),(0,-1),"LEFT"), ("GRID",(0,0),(-1,-1),0.3,_hx(_BORDER)),
                            ("ROWBACKGROUNDS",(0,1),(-1,-1),[_hx(_WHITE),_hx(_LIGHT)]),
                        ]))
                        for ri, row in enumerate(prob_rows, 1):
                            if "Accepted" in row[2]:
                                st.setStyle(TableStyle([("BACKGROUND",(0,ri),(-1,ri),_hx("#d1fae5"))]))
                        story.append(st)
                cum_s = ParagraphStyle("cum", fontName="Helvetica-Bold", fontSize=9,
                                       textColor=_hx(_INDIGO), backColor=_hx("#dbeafe"),
                                       borderPadding=(4,8,4,8), spaceAfter=2)
                story.append(Paragraph(
                    f"Cumulative Score: {norm}/100  |  Problems Solved: {part.problems_solved}/{n_problems}  |  Time: {time_str}",
                    cum_s))
            story.append(Spacer(1, 10))
        return story

    # ------------------------------------------------------------------
    # 7. Problem-wise Analysis + AI Insights
    # ------------------------------------------------------------------
    def _problem_analysis_section(self, contest, problems, is_apt):
        from .models import AptitudeContestSubmission
        from django.db.models import Avg as DAvg, Count as DC
        story = [_section_header("PROBLEM-WISE ANALYSIS", "#7c3aed")]
        if not problems:
            story.append(Paragraph("No problems assigned.", ParagraphStyle("np", fontSize=9)))
            return story
        if is_apt:
            hdr = [["#", "Question (truncated)", "Difficulty", "Attempts", "Correct", "Success Rate", "Avg Time"]]
            rows = []
            for i, q in enumerate(problems, 1):
                subs = AptitudeContestSubmission.objects.filter(contest=contest, question=q)
                tot = subs.count()
                corr = subs.filter(is_correct=True).count()
                rate = f"{round(corr/tot*100,1)}%" if tot else "0%"
                avg_t_val = subs.aggregate(a=DAvg("time_taken_seconds"))["a"] or 0
                qt = q.question_text[:40] + "..." if len(q.question_text) > 40 else q.question_text
                rows.append([str(i), qt, q.difficulty, str(tot), str(corr), rate, f"{round(avg_t_val)}s"])
        else:
            hdr = [["#", "Problem", "Difficulty", "Attempts", "Accepted", "Success Rate", "Common Issue"]]
            rows = []
            for i, p in enumerate(problems, 1):
                subs = ContestSubmission.objects.filter(contest=contest, problem=p)
                tot = subs.count()
                acc = subs.filter(status="Accepted").count()
                rate = f"{round(acc/tot*100,1)}%" if tot else "0%"
                common = (subs.exclude(status="Accepted").values("status").annotate(c=DC("id")).order_by("-c").first())
                issue = common["status"] if common else "N/A"
                rows.append([str(i), (p.title[:28]+"...") if len(p.title)>28 else p.title,
                              p.difficulty, str(tot), str(acc), rate, issue])
        tbl = Table(hdr + rows,
                    colWidths=[0.3*inch, 2.6*inch, 0.75*inch, 0.7*inch, 0.7*inch, 0.8*inch, 0.9*inch],
                    repeatRows=1)
        diff_colors = {"Easy": "#d1fae5", "Medium": "#fef3c7", "Hard": "#fee2e2"}
        cmds = [
            ("BACKGROUND",(0,0),(-1,0),_hx("#7c3aed")), ("TEXTCOLOR",(0,0),(-1,0),colors.white),
            ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"), ("FONTNAME",(0,1),(-1,-1),"Helvetica"),
            ("FONTSIZE",(0,0),(-1,-1),8), ("ALIGN",(0,0),(-1,-1),"CENTER"),
            ("ALIGN",(0,1),(1,-1),"LEFT"), ("GRID",(0,0),(-1,-1),0.3,_hx(_BORDER)),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[_hx(_WHITE),_hx(_LIGHT)]),
        ]
        for ri, row in enumerate(rows, 1):
            bg = diff_colors.get(row[2], _WHITE)
            cmds.append(("BACKGROUND",(2,ri),(2,ri),_hx(bg)))
        tbl.setStyle(TableStyle(cmds))
        story.append(tbl)
        story.append(Spacer(1, 14))
        story.append(_section_header("AI INSIGHTS & RECOMMENDATIONS", _TEAL))
        insights = _generate_insights(contest,
                                      ContestParticipation.objects.filter(contest=contest),
                                      problems, contest.contest_type)
        ins_s = ParagraphStyle("ins", fontName="Helvetica", fontSize=8,
                               textColor=_hx(_DARK), leading=13, leftIndent=10, spaceAfter=4)
        for i, txt in enumerate(insights, 1):
            story.append(Paragraph(f"<b>{i}.</b>  {txt}", ins_s))
        story.append(Spacer(1, 10))
        return story

    # ------------------------------------------------------------------
    # 8. Footer
    # ------------------------------------------------------------------
    def _footer_section(self, contest):
        story = []
        d = Drawing(480, 2)
        d.add(Rect(0, 0, 480, 2, fillColor=_hx(_INDIGO), strokeColor=None))
        story.append(d)
        story.append(Spacer(1, 6))
        fs = ParagraphStyle("ft", fontName="Helvetica", fontSize=7, alignment=1, textColor=_hx(_GRAY))
        story.append(Paragraph(
            f"Contest Analytics Report  -  {contest.title}  -  "
            f"Generated {datetime.now().strftime('%d %b %Y %I:%M %p')}  -  CONFIDENTIAL", fs))
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