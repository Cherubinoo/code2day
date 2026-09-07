"""Views extracted from the original monolithic apps/learning/views.py
(module: staff/reports). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class StudentReportPDFView(APIView):
    """Generate a comprehensive, data-driven PDF performance report for a student."""
    permission_classes = [IsAuthenticated]

    # ── Company → topic weight map (used for readiness analysis) ──────────
    COMPANY_TOPIC_WEIGHTS = {
        "Amazon":    {"Arrays": 0.20, "Trees": 0.18, "Graphs": 0.12, "Dynamic Programming": 0.15, "Strings": 0.10, "Hash Table": 0.08, "Sorting": 0.07, "Linked List": 0.05, "Stack": 0.05},
        "Google":    {"Graphs": 0.20, "Dynamic Programming": 0.20, "Trees": 0.12, "Arrays": 0.12, "Strings": 0.10, "Binary Search": 0.08, "Math": 0.08, "Sorting": 0.05, "Stack": 0.05},
        "Microsoft": {"Arrays": 0.18, "Dynamic Programming": 0.15, "Trees": 0.15, "Strings": 0.12, "Linked List": 0.10, "Graphs": 0.10, "Hash Table": 0.08, "Stack": 0.06, "Sorting": 0.06},
        "Meta":      {"Arrays": 0.18, "Graphs": 0.15, "Dynamic Programming": 0.15, "Trees": 0.12, "Strings": 0.12, "Binary Search": 0.08, "Hash Table": 0.08, "Sorting": 0.06, "Stack": 0.06},
        "Apple":     {"Arrays": 0.20, "Trees": 0.15, "Strings": 0.15, "Linked List": 0.12, "Dynamic Programming": 0.10, "Sorting": 0.08, "Hash Table": 0.08, "Graphs": 0.06, "Stack": 0.06},
        "Netflix":   {"Dynamic Programming": 0.20, "Graphs": 0.18, "Trees": 0.15, "Arrays": 0.12, "Strings": 0.10, "Hash Table": 0.08, "Sorting": 0.07, "Binary Search": 0.05, "Stack": 0.05},
        "TCS":       {"Arrays": 0.20, "Strings": 0.18, "Sorting": 0.15, "Math": 0.12, "Linked List": 0.10, "Trees": 0.08, "Dynamic Programming": 0.07, "Hash Table": 0.05, "Stack": 0.05},
        "Infosys":   {"Arrays": 0.22, "Strings": 0.18, "Sorting": 0.15, "Math": 0.12, "Linked List": 0.10, "Trees": 0.08, "Hash Table": 0.05, "Dynamic Programming": 0.05, "Stack": 0.05},
        "Wipro":     {"Arrays": 0.22, "Strings": 0.20, "Sorting": 0.15, "Math": 0.12, "Linked List": 0.10, "Trees": 0.08, "Hash Table": 0.05, "Dynamic Programming": 0.04, "Stack": 0.04},
        "Cognizant": {"Arrays": 0.22, "Strings": 0.20, "Sorting": 0.15, "Math": 0.12, "Linked List": 0.10, "Trees": 0.08, "Hash Table": 0.05, "Dynamic Programming": 0.04, "Stack": 0.04},
        "Zoho":      {"Arrays": 0.18, "Strings": 0.15, "Linked List": 0.12, "Trees": 0.12, "Dynamic Programming": 0.12, "Hash Table": 0.10, "Sorting": 0.08, "Graphs": 0.07, "Stack": 0.06},
        "Accenture": {"Arrays": 0.22, "Strings": 0.20, "Sorting": 0.15, "Math": 0.12, "Linked List": 0.10, "Trees": 0.08, "Hash Table": 0.05, "Dynamic Programming": 0.04, "Stack": 0.04},
    }
    TOPIC_THRESHOLD = 5  # problems needed per topic for 100% in that topic

    def get(self, request, register_number):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=403)

        staff_profile = request.user.staff_profile
        student = get_object_or_404(StudentProfile, register_number=register_number)

        # Access control
        if student.institution != staff_profile.institution:
            return Response({"detail": "Access denied."}, status=403)
        if staff_profile.role in ('hod', 'academics') and student.department != staff_profile.department:
            return Response({"detail": "Access denied (Department mismatch)."}, status=403)

        report_type = request.GET.get('type', 'overall')
        topic_filter = request.GET.get('topic', '')
        date_from = request.GET.get('date_from', '')
        date_to = request.GET.get('date_to', '')

        # ── Gather all data ──────────────────────────────────────────────
        rd = self._get_comprehensive_data(student, report_type, topic_filter, date_from, date_to)

        # ── Build PDF ────────────────────────────────────────────────────
        from ...pdf_reports import (
            create_watermarked_pdf_contest, _bar_chart, _pie_chart,
            _spider_chart, _bell_curve_chart,
        )
        buffer = BytesIO()
        doc = create_watermarked_pdf_contest(
            buffer,
            institution=student.institution,
            department=student.department,
            pagesize=A4,
            topMargin=2.1 * inch,
            bottomMargin=0.6 * inch,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('RPTitle', parent=styles['Heading1'], fontSize=18, spaceAfter=24, alignment=1, textColor=colors.HexColor('#2d5016'))
        header_style = ParagraphStyle('RPHeader', parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=10, textColor=colors.HexColor('#39482a'))
        sub_style = ParagraphStyle('RPSub', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#555555'), spaceAfter=6)
        body_style = ParagraphStyle('RPBody', parent=styles['Normal'], fontSize=9, leading=13, textColor=colors.HexColor('#333333'), spaceAfter=4)
        bullet_style = ParagraphStyle('RPBullet', parent=styles['Normal'], fontSize=9, leading=13, textColor=colors.HexColor('#333333'), spaceAfter=3, leftIndent=18, bulletIndent=6, bulletFontName='Helvetica', bulletFontSize=9)
        note_style = ParagraphStyle('RPNote', parent=styles['Normal'], fontSize=8, leading=11, textColor=colors.HexColor('#92400e'), spaceAfter=2)
        footer_style = ParagraphStyle('RPFooter', parent=styles['Normal'], fontSize=8, textColor=colors.grey, alignment=1)

        GREEN = '#2d5016'
        GREEN_BG = '#e6ebdd'
        GREEN_HDR = '#39482a'
        BORDER = '#d0d9c2'
        ALT_ROW = '#f8f9f7'

        def _styled_table(data, col_widths, has_header=True):
            cell_style = ParagraphStyle(
                'RPTableCell',
                parent=styles['Normal'],
                fontSize=8,
                leading=10,
                textColor=colors.HexColor('#333333')
            )
            cell_header_style = ParagraphStyle(
                'RPTableHeaderCell',
                parent=styles['Normal'],
                fontName='Helvetica-Bold',
                fontSize=8,
                leading=10,
                textColor=colors.HexColor(GREEN_HDR)
            )

            wrapped_data = []
            for row_idx, row in enumerate(data):
                wrapped_row = []
                for col_idx, cell in enumerate(row):
                    if isinstance(cell, str):
                        if '█' in cell or '░' in cell:
                            wrapped_row.append(cell)
                        else:
                            escaped_cell = cell.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                            if has_header and row_idx == 0:
                                wrapped_row.append(Paragraph(escaped_cell, cell_header_style))
                            else:
                                wrapped_row.append(Paragraph(escaped_cell, cell_style))
                    else:
                        wrapped_row.append(cell)
                wrapped_data.append(wrapped_row)

            t = Table(wrapped_data, colWidths=col_widths)
            style_cmds = [
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor(BORDER)),
            ]
            if has_header:
                style_cmds += [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(GREEN_BG)),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(ALT_ROW)]),
                ]
            t.setStyle(TableStyle(style_cmds))
            return t

        els = []  # elements list

        # ── Contact info ─────────────────────────────────────────────────
        institution = student.institution
        contact_parts = []
        if institution.contact_email:
            contact_parts.append(f"Email: {institution.contact_email}")
        if institution.contact_phone:
            contact_parts.append(f"Phone: {institution.contact_phone}")
        if institution.website:
            contact_parts.append(f"Website: {institution.website}")
        if contact_parts:
            els.append(Paragraph(" | ".join(contact_parts), styles['Normal']))
        els.append(Spacer(1, 0.25 * inch))

        # ── Section 1: Report Title ──────────────────────────────────────
        report_titles = {
            'overall': 'Comprehensive Student Performance Report',
            'aptitude': 'Aptitude Assessment Performance Report',
            'programming': 'Programming Performance Report',
            'contests': 'Contest Participation Report',
        }
        els.append(Paragraph(report_titles.get(report_type, 'Student Performance Report'), title_style))

        # ── Section 1: Student Info Card ─────────────────────────────────
        els.append(Paragraph("Student Information", header_style))
        info_rows = [
            ["Name:", student.name],
            ["Register Number:", student.register_number],
            ["Department:", student.department.get_full_name() if student.department else 'N/A'],
            ["Batch:", student.batch or 'N/A'],
            ["Report Period:", f"{date_from or 'All time'} to {date_to or 'Present'}"],
        ]
        if topic_filter:
            info_rows.append(["Topic Filter:", topic_filter])
        info_t = Table(info_rows, colWidths=[2 * inch, 4 * inch])
        info_t.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        els.append(info_t)
        els.append(Spacer(1, 0.25 * inch))

        # ── Section 2: Data Consistency Notes ────────────────────────────
        if rd['consistency_notes']:
            els.append(Paragraph("Data Consistency Notes", header_style))
            for note in rd['consistency_notes']:
                els.append(Paragraph(f"⚠ {note}", note_style))
            els.append(Spacer(1, 0.15 * inch))

        # ── Section 3: Performance Snapshot ──────────────────────────────
        els.append(Paragraph("Performance Snapshot", header_style))
        rank_display = f"#{rd['campus_rank']}" if rd['total_solved'] >= 3 else "Not enough data yet"
        success_display = f"{rd['success_rate']:.1f}%" if rd['total_attempts'] >= 3 else "Not enough data yet"

        snap_data = [
            ["Metric", "Value", "Details"],
            ["Problems Solved", str(rd['total_solved']), f"Easy: {rd['easy']}  |  Medium: {rd['medium']}  |  Hard: {rd['hard']}"],
            ["Current Streak", f"{rd['current_streak']} days", f"Login Days: {student.login_days}"],
            ["Campus Rank", rank_display, f"Among {rd['total_students']} students"],
            ["Success Rate", success_display, f"Based on {rd['total_attempts']} attempts"],
        ]
        if report_type in ('aptitude', 'overall'):
            apt_display = f"{rd['aptitude_percentage']:.1f}%" if rd['aptitude_solved'] >= 2 else "Not enough data yet"
            snap_data.append(["Aptitude Progress", f"{rd['aptitude_solved']} solved", f"{apt_display} of {rd['total_aptitude']} total"])
        if report_type in ('contests', 'overall'):
            snap_data.append(["Contests", str(rd['contests_participated']), f"{rd['contest_submissions']} submissions"])

        els.append(_styled_table(snap_data, [1.8 * inch, 1.5 * inch, 3.2 * inch]))
        els.append(Spacer(1, 0.25 * inch))

        # ── Section 4: Difficulty Breakdown Chart ────────────────────────
        if rd['total_solved'] > 0:
            els.append(Paragraph("Difficulty Breakdown", header_style))
            diff_values = [rd['easy'], rd['medium'], rd['hard']]
            diff_labels = ['Easy', 'Medium', 'Hard']
            diff_colors = ['#22c55e', '#f59e0b', '#ef4444']
            els.append(_pie_chart(diff_values, diff_labels, diff_colors, size=140))
            els.append(Spacer(1, 0.2 * inch))

        # ── Section 5: Topic-by-Topic Breakdown ──────────────────────────
        if rd['topic_breakdown']:
            els.append(Paragraph("Topic-by-Topic Breakdown", header_style))
            els.append(Paragraph("Proficiency: Not Started (0) → Beginner (1-4) → Intermediate (5-9) → Advanced (10+)", sub_style))
            topic_data = [["Topic", "Solved", "Proficiency", "Progress"]]
            for tb in rd['topic_breakdown']:
                bar_len = min(tb['count'], 15)
                bar = '█' * bar_len + '░' * (15 - bar_len)
                topic_data.append([tb['topic'], str(tb['count']), tb['level'], bar])
            els.append(_styled_table(topic_data, [2 * inch, 0.8 * inch, 1.3 * inch, 2.4 * inch]))
            els.append(Spacer(1, 0.25 * inch))

        # ── Section 6: 12-Week Trend ─────────────────────────────────────
        if rd['weekly_trend']:
            els.append(Paragraph("Weekly Performance Trend (Last 12 Weeks)", header_style))
            week_labels = [w['label'] for w in rd['weekly_trend']]
            week_solved = [w['solved'] for w in rd['weekly_trend']]
            els.append(_bar_chart(week_solved, week_labels, bar_color='#0f766e', w=480, h=150))

            # Accuracy trend table
            acc_data = [["Week", "Solved", "Attempts", "Accuracy"]]
            for w in rd['weekly_trend']:
                acc = f"{w['accuracy']:.0f}%" if w['attempts'] > 0 else "—"
                acc_data.append([w['label'], str(w['solved']), str(w['attempts']), acc])
            els.append(Spacer(1, 0.1 * inch))
            els.append(_styled_table(acc_data, [1.6 * inch, 1.1 * inch, 1.1 * inch, 2.7 * inch]))
            els.append(Spacer(1, 0.25 * inch))

        # ── Section 7: Company Readiness ─────────────────────────────────
        if rd['company_readiness']:
            els.append(Paragraph("Company Readiness Analysis", header_style))
            els.append(Paragraph("Readiness is based on how well your solved topics match each company's typical interview distribution.", sub_style))
            comp_data = [["Company", "Readiness", "Matched Topics", "Key Gaps"]]
            for cr in rd['company_readiness']:
                readiness_str = f"{cr['readiness_pct']}%"
                matched = ", ".join(cr['matched'][:3]) if cr['matched'] else "None"
                gaps = ", ".join(cr['gaps'][:3]) if cr['gaps'] else "All covered"
                comp_data.append([cr['company'], readiness_str, matched, gaps])
            els.append(_styled_table(comp_data, [1.3 * inch, 0.9 * inch, 2 * inch, 2.3 * inch]))
            els.append(Spacer(1, 0.25 * inch))

        # ── Section 8: Performance Charts ────────────────────────────────
        chart_data = rd.get('performance_charts', {})

        # Overall pie + daily trend bar
        els.append(Paragraph("Performance Charts", header_style))
        overall_rows = chart_data.get('overall_performance', [])
        overall_values = [row.get('value', 0) for row in overall_rows]
        overall_labels = [row.get('label', '') for row in overall_rows]
        if not sum(overall_values):
            overall_values = [1]
            overall_labels = ["No data"]

        trend_rows = chart_data.get('daily_solved_trend', [])[-14:]
        trend_values = [row.get('daily_total', 0) for row in trend_rows]
        trend_labels = [row.get('date', '')[5:] for row in trend_rows]

        overall_pie = _pie_chart(overall_values, overall_labels, ['#22c55e', '#3b82f6', '#f59e0b'], size=130)
        trend_bar = _bar_chart(trend_values, trend_labels, bar_color='#0f766e', w=295, h=140)
        charts_table = Table([[overall_pie, trend_bar]], colWidths=[2.2 * inch, 4.2 * inch])
        charts_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor(BORDER)),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(ALT_ROW)),
        ]))
        els.append(charts_table)
        chart_labels_t = Table([
            [Paragraph("Overall Performance", styles['Normal']), Paragraph("Daily Problems Solved (14 days)", styles['Normal'])],
        ], colWidths=[2.2 * inch, 4.2 * inch])
        chart_labels_t.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('FONTSIZE', (0, 0), (-1, -1), 8)]))
        els.append(chart_labels_t)
        els.append(Spacer(1, 0.2 * inch))

        # Radar + Bell curve
        radar_data = chart_data.get('profile_radar', {})
        radar_labels = radar_data.get('labels', ['Programming', 'Aptitude', 'Contest', 'Daily', 'Overall'])
        radar_values = radar_data.get('overall', [0, 0, 0, 0, 0])
        radar_chart = _spider_chart(radar_values, radar_labels, max_val=100, size=150)

        percentile = 0
        rank = rd.get('campus_rank', 0)
        total_students = rd.get('total_students', 1)
        if total_students > 0 and rank > 0 and rd['total_solved'] >= 3:
            percentile = round((1 - (rank - 1) / total_students) * 100, 1)
        bell_curve = _bell_curve_chart(percentile, rank, w=300, h=140)

        adv_table = Table([[radar_chart, bell_curve]], colWidths=[2.2 * inch, 4.2 * inch])
        adv_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        els.append(adv_table)
        adv_labels = Table([
            [Paragraph("Strength Analysis", styles['Normal']), Paragraph("Platform Standing (Percentile)", styles['Normal'])],
        ], colWidths=[2.2 * inch, 4.2 * inch])
        adv_labels.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('FONTSIZE', (0, 0), (-1, -1), 8)]))
        els.append(adv_labels)
        els.append(Spacer(1, 0.2 * inch))

        # ── Section 9: Knowledge Distribution ────────────────────────────
        knowledge = chart_data.get('knowledge_distribution') or {}
        knowledge_labels = knowledge.get('labels', [])[:10]
        knowledge_values = [
            (knowledge.get('programming', [0] * len(knowledge_labels))[idx] if idx < len(knowledge.get('programming', [])) else 0)
            + (knowledge.get('aptitude', [0] * len(knowledge_labels))[idx] if idx < len(knowledge.get('aptitude', [])) else 0)
            for idx, _ in enumerate(knowledge_labels)
        ]
        if knowledge_labels:
            els.append(Paragraph("Knowledge Distribution", header_style))
            els.append(_bar_chart(knowledge_values, [label[:12] for label in knowledge_labels], bar_color='#4f46e5', w=480, h=150))
            els.append(Spacer(1, 0.25 * inch))

        # ── Section 10: Insights ─────────────────────────────────────────
        if rd['insights']:
            els.append(Paragraph("Key Insights", header_style))
            for insight in rd['insights']:
                els.append(Paragraph(f"• {insight}", bullet_style))
            els.append(Spacer(1, 0.25 * inch))

        # ── Section 11: 2-Week Action Plan ───────────────────────────────
        if rd['action_plan']:
            els.append(Paragraph("Recommended 2-Week Action Plan", header_style))
            for idx, action in enumerate(rd['action_plan'], 1):
                els.append(Paragraph(f"{idx}. {action}", body_style))
            els.append(Spacer(1, 0.25 * inch))

        # ── Section 12: Recent Activity ──────────────────────────────────
        if rd['recent_activities']:
            els.append(Paragraph("Recent Activity (Last 30 Days)", header_style))
            activity_data = [["Date", "Activity", "Problem/Contest", "Result"]]
            for act in rd['recent_activities'][:15]:
                activity_data.append([act['date'], act['type'], act['subject'][:35], act['result']])
            els.append(_styled_table(activity_data, [1.2 * inch, 1.4 * inch, 2.2 * inch, 1.7 * inch]))

        # ── Section 13: Footer ───────────────────────────────────────────
        els.append(Spacer(1, 0.4 * inch))
        local_now = timezone.localtime(timezone.now())
        els.append(Paragraph(f"Report generated on {local_now.strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        els.append(Paragraph(f"Generated by: {staff_profile.name} ({staff_profile.faculty_id})", footer_style))
        els.append(Paragraph("This report is auto-generated. Metrics reflect data available at generation time.", footer_style))

        doc.build(els)
        buffer.seek(0)

        filename_parts = [f"Student_Report_{student.register_number}"]
        if report_type != 'overall':
            filename_parts.append(report_type.title())
        if topic_filter:
            filename_parts.append(topic_filter.replace(' ', '_'))
        filename_parts.append(local_now.strftime('%Y%m%d'))
        filename = "_".join(filename_parts) + ".pdf"

        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    # ══════════════════════════════════════════════════════════════════════
    #  Data Collection
    # ══════════════════════════════════════════════════════════════════════

    def _get_comprehensive_data(self, student, report_type, topic_filter, date_from, date_to):
        """Collect all data needed for the comprehensive report."""
        from datetime import datetime, timedelta
        from django.db.models import Q, Count
        from collections import defaultdict

        consistency_notes = []

        # ── Date filters ─────────────────────────────────────────────────
        def _parse_date(val):
            try:
                return datetime.strptime(val, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                return None

        date_from_obj = _parse_date(date_from)
        date_to_obj = _parse_date(date_to)

        date_filter = Q()
        if date_from_obj:
            date_filter &= Q(solved_at__date__gte=date_from_obj)
        if date_to_obj:
            date_filter &= Q(solved_at__date__lte=date_to_obj)

        # ── Solved problems ──────────────────────────────────────────────
        solved_qs = SolvedProblem.objects.filter(student=student).select_related('problem')
        if date_filter:
            solved_qs = solved_qs.filter(date_filter)
        if topic_filter:
            solved_qs = solved_qs.filter(problem__tags__icontains=topic_filter)

        total_solved = solved_qs.count()
        difficulty_counts = {'Easy': 0, 'Medium': 0, 'Hard': 0}
        company_counts = defaultdict(int)
        skill_counts = defaultdict(int)

        for sp in solved_qs:
            d = sp.problem.difficulty or 'Medium'
            difficulty_counts[d] = difficulty_counts.get(d, 0) + 1

            comps = sp.problem.companies or ""
            for c in [c.strip() for c in comps.replace(',', ' ').split() if c.strip()]:
                company_counts[c] += 1

            tags = sp.problem.tags or []
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(',') if t.strip()]
            for t in tags:
                skill_counts[t.strip().title()] += 1

        # ── Attempts & success rate (with consistency check) ─────────────
        attempt_filter = Q()
        if date_from_obj:
            attempt_filter &= Q(created_at__date__gte=date_from_obj)
        if date_to_obj:
            attempt_filter &= Q(created_at__date__lte=date_to_obj)

        attempt_qs = ExecutionRecord.objects.filter(student=student)
        if attempt_filter:
            attempt_qs = attempt_qs.filter(attempt_filter)
        total_attempts = attempt_qs.count()

        # Data consistency: if solved > 0 but attempts == 0, correct it
        if total_attempts == 0 and total_solved > 0:
            total_attempts = total_solved
            consistency_notes.append(
                f"Execution records show 0 attempts but {total_solved} problems are solved. "
                f"Attempts corrected to {total_solved}. Success rate set to 100%."
            )
            success_rate = 100.0
        elif total_attempts > 0:
            success_rate = round(total_solved / total_attempts * 100, 1)
        else:
            success_rate = 0.0

        # If success rate > 100% (shouldn't happen but guard)
        if success_rate > 100:
            consistency_notes.append(
                f"Calculated success rate ({success_rate:.1f}%) exceeds 100%. "
                f"This may indicate duplicate solve records. Capped at 100%."
            )
            success_rate = 100.0

        # ── Aptitude ─────────────────────────────────────────────────────
        apt_filter = Q()
        if date_from_obj:
            apt_filter &= Q(solved_at__date__gte=date_from_obj)
        if date_to_obj:
            apt_filter &= Q(solved_at__date__lte=date_to_obj)

        apt_qs = SolvedAptitude.objects.filter(student=student)
        if apt_filter:
            apt_qs = apt_qs.filter(apt_filter)
        aptitude_solved = apt_qs.count()
        total_aptitude = AptitudeQuestion.objects.count()
        aptitude_pct = round(aptitude_solved / total_aptitude * 100, 1) if total_aptitude > 0 else 0

        # ── Contests ─────────────────────────────────────────────────────
        cp_filter = Q()
        if date_from_obj:
            cp_filter &= Q(started_at__date__gte=date_from_obj)
        if date_to_obj:
            cp_filter &= Q(started_at__date__lte=date_to_obj)

        cp_qs = ContestParticipation.objects.filter(student=student)
        if cp_filter:
            cp_qs = cp_qs.filter(cp_filter)
        contests_participated = cp_qs.count()

        cs_filter = Q()
        if date_from_obj:
            cs_filter &= Q(submitted_at__date__gte=date_from_obj)
        if date_to_obj:
            cs_filter &= Q(submitted_at__date__lte=date_to_obj)
        cs_qs = ContestSubmission.objects.filter(student=student)
        if cs_filter:
            cs_qs = cs_qs.filter(cs_filter)
        contest_submissions = cs_qs.count()

        # ── Campus rank & total students ─────────────────────────────────
        campus_rank = calculate_campus_rank_helper(student)
        total_students = StudentProfile.objects.filter(institution=student.institution).count()

        # ── Topic-by-topic breakdown ─────────────────────────────────────
        # Combine programming tags + aptitude topics
        all_topics = dict(skill_counts)  # already has programming tags

        # Add aptitude topic counts
        apt_topic_qs = SolvedAptitude.objects.filter(student=student).values(
            'question__topic__title'
        ).annotate(count=Count('id')).order_by('-count')
        for row in apt_topic_qs:
            topic = row['question__topic__title']
            if topic:
                key = topic.strip().title()
                all_topics[key] = all_topics.get(key, 0) + row['count']

        # Build proficiency list
        topic_breakdown = []
        for topic, count in sorted(all_topics.items(), key=lambda x: x[1], reverse=True):
            if count == 0:
                level = "Not Started"
            elif count <= 4:
                level = "Beginner"
            elif count <= 9:
                level = "Intermediate"
            else:
                level = "Advanced"
            topic_breakdown.append({'topic': topic, 'count': count, 'level': level})

        # ── 12-Week Trend ────────────────────────────────────────────────
        today = timezone.localdate()
        weekly_trend = []
        for week_offset in range(11, -1, -1):
            week_start = today - timedelta(days=today.weekday()) - timedelta(weeks=week_offset)
            week_end = week_start + timedelta(days=6)

            week_solved = SolvedProblem.objects.filter(
                student=student,
                solved_at__date__gte=week_start,
                solved_at__date__lte=week_end,
            ).count()

            week_attempts = ExecutionRecord.objects.filter(
                student=student,
                created_at__date__gte=week_start,
                created_at__date__lte=week_end,
            ).count()

            week_accuracy = round(week_solved / week_attempts * 100, 1) if week_attempts > 0 else 0

            weekly_trend.append({
                'label': f"{week_start.strftime('%b %d')}",
                'solved': week_solved,
                'attempts': week_attempts,
                'accuracy': week_accuracy,
            })

        # ── Company Readiness ────────────────────────────────────────────
        # Determine which companies to analyze: tracked_companies + companies from solved problems
        target_companies = set()
        if student.tracked_companies:
            for c in student.tracked_companies:
                if isinstance(c, str):
                    target_companies.add(c.strip())
                elif isinstance(c, dict) and c.get('name'):
                    target_companies.add(c['name'].strip())

        # Add top companies from solved problems
        for comp, count in sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
            target_companies.add(comp)

        # If no companies at all, add some defaults
        if not target_companies:
            target_companies = {"TCS", "Infosys", "Zoho"}

        company_readiness = []
        for comp_name in sorted(target_companies):
            weights = None
            # Try exact match first, then case-insensitive
            for key, w in self.COMPANY_TOPIC_WEIGHTS.items():
                if key.lower() == comp_name.lower():
                    weights = w
                    break
            if not weights:
                # Use a generic weight distribution
                weights = {"Arrays": 0.20, "Strings": 0.15, "Trees": 0.12, "Dynamic Programming": 0.12,
                           "Graphs": 0.10, "Sorting": 0.08, "Hash Table": 0.08, "Linked List": 0.08, "Stack": 0.07}

            readiness = 0
            matched = []
            gaps = []
            for topic, weight in weights.items():
                student_count = skill_counts.get(topic, 0)
                topic_score = min(1.0, student_count / self.TOPIC_THRESHOLD)
                readiness += topic_score * weight
                if student_count > 0:
                    matched.append(f"{topic} ({student_count})")
                else:
                    gaps.append(topic)

            readiness_pct = round(readiness * 100)
            company_readiness.append({
                'company': comp_name,
                'readiness_pct': readiness_pct,
                'matched': matched,
                'gaps': gaps,
            })

        company_readiness.sort(key=lambda x: x['readiness_pct'], reverse=True)

        # ── Insights ─────────────────────────────────────────────────────
        insights = self._generate_insights(
            student, rd_total_solved=total_solved, rd_easy=difficulty_counts['Easy'],
            rd_medium=difficulty_counts['Medium'], rd_hard=difficulty_counts['Hard'],
            rd_aptitude_solved=aptitude_solved, rd_aptitude_pct=aptitude_pct,
            rd_contests=contests_participated, rd_streak=student.current_streak,
            rd_weekly_trend=weekly_trend, rd_topic_breakdown=topic_breakdown,
            rd_company_readiness=company_readiness, rd_success_rate=success_rate,
        )

        # ── Action Plan ──────────────────────────────────────────────────
        action_plan = self._generate_action_plan(
            topic_breakdown, company_readiness, difficulty_counts,
            contests_participated, weekly_trend, total_solved,
        )

        # ── Recent activities ────────────────────────────────────────────
        recent_activities = []
        recent_solved = solved_qs.filter(
            solved_at__gte=timezone.now() - timedelta(days=30)
        ).order_by('-solved_at')[:20]
        for sp in recent_solved:
            recent_activities.append({
                'date': sp.solved_at.strftime('%m/%d'),
                'type': 'Problem Solved',
                'subject': sp.problem.title[:30],
                'result': sp.problem.difficulty or 'Solved',
            })

        # ── Topic accuracy (for chart builder) ───────────────────────────
        try:
            topic_acc_qs = AptitudeContestSubmission.objects.filter(
                student=student
            ).select_related('question__topic__parent').values(
                'question__topic__title', 'question__topic__parent__title'
            ).annotate(
                total=Count('id'),
                correct=Count('id', filter=Q(is_correct=True))
            ).order_by('-total')[:20]

            topic_accuracy = [
                {
                    'topic': t['question__topic__title'],
                    'category': t['question__topic__parent__title'] or t['question__topic__title'],
                    'accuracy': round(t['correct'] / t['total'] * 100, 1) if t['total'] else 0,
                    'total': t['total'],
                    'correct': t['correct'],
                }
                for t in topic_acc_qs if t['question__topic__title']
            ]
        except Exception:
            topic_accuracy = []

        # ── Top skills / companies (legacy compat) ───────────────────────
        top_skills = [{'skill': s.title(), 'count': c} for s, c in sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)]
        top_companies = [{'company': c, 'count': n} for c, n in sorted(company_counts.items(), key=lambda x: x[1], reverse=True)]

        return {
            'total_solved': total_solved,
            'easy': difficulty_counts['Easy'],
            'medium': difficulty_counts['Medium'],
            'hard': difficulty_counts['Hard'],
            'current_streak': student.current_streak,
            'campus_rank': campus_rank,
            'total_students': total_students,
            'success_rate': success_rate,
            'total_attempts': total_attempts,
            'aptitude_solved': aptitude_solved,
            'total_aptitude': total_aptitude,
            'aptitude_percentage': aptitude_pct,
            'contests_participated': contests_participated,
            'contest_submissions': contest_submissions,
            'consistency_notes': consistency_notes,
            'topic_breakdown': topic_breakdown,
            'weekly_trend': weekly_trend,
            'company_readiness': company_readiness,
            'insights': insights,
            'action_plan': action_plan,
            'top_skills': top_skills,
            'top_companies': top_companies,
            'recent_activities': recent_activities,
            'performance_charts': _build_student_performance_charts(student, solved_qs, topic_accuracy),
        }

    # ── Insights Generator ───────────────────────────────────────────────

    def _generate_insights(self, student, **d):
        """Generate 3–5 factual, data-driven insight bullets."""
        insights = []

        total = d['rd_total_solved']
        hard = d['rd_hard']
        easy = d['rd_easy']
        medium = d['rd_medium']

        # 1. Difficulty balance
        if total > 0 and hard == 0:
            insights.append(
                f"You have solved {total} problems but none are Hard difficulty. "
                f"Attempting Hard problems is essential for interview readiness."
            )
        elif total > 0 and hard > 0:
            hard_pct = round(hard / total * 100)
            if hard_pct < 10:
                insights.append(
                    f"Only {hard_pct}% of your solved problems ({hard}/{total}) are Hard. "
                    f"Aim for at least 15-20% Hard problems to build depth."
                )

        # 2. Easy-heavy check
        if total > 5 and easy > 0:
            easy_pct = round(easy / total * 100)
            if easy_pct > 60:
                insights.append(
                    f"{easy_pct}% of problems solved are Easy ({easy}/{total}). "
                    f"Consider shifting focus to Medium and Hard problems."
                )

        # 3. Streak
        if d['rd_streak'] == 0:
            insights.append(
                "Your current streak is 0 days — you haven't solved anything recently. "
                "Even 1 problem a day helps maintain momentum."
            )
        elif d['rd_streak'] >= 7:
            insights.append(
                f"Excellent streak of {d['rd_streak']} consecutive days. Keep it going."
            )

        # 4. Weakest topics from topic breakdown
        weak_topics = [tb for tb in d['rd_topic_breakdown'] if tb['level'] == 'Beginner']
        if weak_topics:
            names = ", ".join([t['topic'] for t in weak_topics[:3]])
            insights.append(
                f"Topics at Beginner level: {names}. "
                f"These need more practice to reach interview readiness."
            )

        # 5. Contest participation
        if d['rd_contests'] == 0:
            insights.append(
                "No contest participation yet. Contests build speed and pressure handling — "
                "try participating in at least one this week."
            )
        elif d['rd_contests'] < 3:
            insights.append(
                f"Only {d['rd_contests']} contest(s) attended. Consistent contest practice "
                f"significantly improves timed problem-solving skills."
            )

        # 6. Success rate
        if d['rd_success_rate'] > 0 and d['rd_success_rate'] < 30:
            insights.append(
                f"Success rate is {d['rd_success_rate']:.0f}%. This suggests many failed attempts. "
                f"Consider studying solutions/editorials before attempting new problems."
            )

        # 7. Weekly activity gaps
        inactive_weeks = sum(1 for w in d['rd_weekly_trend'] if w['solved'] == 0)
        if inactive_weeks >= 4:
            insights.append(
                f"{inactive_weeks} of the last 12 weeks had zero problems solved. "
                f"Consistency matters more than intensity — aim for at least a few problems every week."
            )

        return insights[:5]  # Cap at 5

    # ── Action Plan Generator ────────────────────────────────────────────

    def _generate_action_plan(self, topic_breakdown, company_readiness, difficulty, contests, weekly_trend, total_solved):
        """Generate a personalized 2-week action plan."""
        plan = []

        # 1. Identify weakest topics from company gaps
        all_gaps = set()
        for cr in company_readiness[:3]:  # top 3 target companies
            for g in cr.get('gaps', [])[:2]:
                all_gaps.add(g)

        if all_gaps:
            gap_list = list(all_gaps)[:3]
            counts = ", ".join([f"5 {g} problems" for g in gap_list])
            plan.append(
                f"Focus on your company-readiness gaps: solve {counts} over the next 2 weeks."
            )

        # 2. Difficulty progression
        if difficulty.get('Hard', 0) == 0:
            plan.append(
                "Start attempting Hard problems: aim for 2 Hard problems this week and 3 next week. "
                "Pick topics you're already Intermediate in."
            )
        elif difficulty.get('Hard', 0) < 5:
            plan.append(
                f"You've solved {difficulty['Hard']} Hard problems. Target 3 more Hard problems "
                f"in the next 2 weeks to build depth."
            )

        # 3. Weakest topics from breakdown
        beginner_topics = [t for t in topic_breakdown if t['level'] == 'Beginner']
        if beginner_topics and not all_gaps:
            weak = beginner_topics[:2]
            for t in weak:
                plan.append(
                    f"Practice {t['topic']}: solve {5 - t['count']} more problems to reach Intermediate level."
                )

        # 4. Contest recommendation
        if contests < 2:
            plan.append(
                "Participate in at least 1 contest this week and 1 next week. "
                "Timed problem-solving is a distinct skill that needs separate practice."
            )

        # 5. Daily target
        recent_avg = sum(w['solved'] for w in weekly_trend[-4:]) / 4 if weekly_trend else 0
        if recent_avg < 3:
            plan.append(
                "Set a daily target: solve at least 1 problem per day (any difficulty) to build consistency."
            )
        elif recent_avg < 7:
            plan.append(
                f"Your recent average is ~{recent_avg:.0f} problems/week. "
                f"Push to 10+/week by adding 1-2 problems daily."
            )

        return plan[:5]  # Cap at 5

class TrackedCompaniesReportPDFView(APIView):
    """Generate PDF report for student's company readiness."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'student_profile'):
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)
        student = request.user.student_profile

        from ...pdf_reports import create_watermarked_pdf_contest
        buffer = BytesIO()
        doc = create_watermarked_pdf_contest(
            buffer,
            institution=student.institution,
            department=student.department,
            pagesize=A4,
            topMargin=2.1 * inch,
            bottomMargin=0.6 * inch,
        )
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('CTitle', parent=styles['Heading1'], fontSize=16, spaceAfter=12, alignment=1, textColor=colors.HexColor('#2d5016'))
        header_style = ParagraphStyle('CHeader', parent=styles['Heading2'], fontSize=11, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor('#39482a'))

        elements = []
        elements.append(Paragraph(f"Company Readiness Report: {student.name}", title_style))
        elements.append(Paragraph(f"Register Number: {student.register_number}", header_style))
        elements.append(Spacer(1, 0.2 * inch))

        solved_qs = SolvedProblem.objects.filter(student=student)
        total_solved = solved_qs.count()

        data = [
            ["Category", "Details"],
            ["Total Problems Solved", str(total_solved)],
            ["Current Streak", f"{student.current_streak} days"],
            ["Department", student.department.get_full_name() if student.department else 'N/A'],
        ]
        t = Table(data, colWidths=[2.5*inch, 4*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d9c2')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)

        doc.build(elements)
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="company_readiness_report_{student.register_number}.pdf"'
        return response

class StaffReportPDFView(APIView):
    """Generate a comprehensive PDF performance report with filtering options."""
    permission_classes = [IsAuthenticated]

    def get(self, request, faculty_id):
        # Check if user is staff (HOD or self)
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=403)

        user_profile = request.user.staff_profile
        target_staff = get_object_or_404(StaffProfile, faculty_id=faculty_id)

        # Access control
        if user_profile.role in ('hod', 'academics') and target_staff.department != user_profile.department:
            return Response({"detail": "Access denied."}, status=403)
        if target_staff.institution != user_profile.institution:
            return Response({"detail": "Access denied."}, status=403)

        # Get filter parameters
        batch_filter = request.GET.get('batch', '')
        report_type = request.GET.get('type', 'overall')  # overall, aptitude, programming, contests
        topic_filter = request.GET.get('topic', '')
        date_from = request.GET.get('date_from', '')
        date_to = request.GET.get('date_to', '')

        # Create PDF with the shared branded header (logo + name + subheading +
        # address + department, drawn once on page 1 only) instead of the
        # plain-text-only title block this view used to build by hand.
        from ...pdf_reports import create_watermarked_pdf_contest, _bar_chart, _pie_chart
        buffer = BytesIO()
        doc = create_watermarked_pdf_contest(
            buffer,
            institution=target_staff.institution,
            department=target_staff.department,
            pagesize=A4,
            topMargin=2.1*inch,
            bottomMargin=0.6*inch
        )

        # Custom styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=30,
            alignment=1,  # Center
            textColor=colors.HexColor('#2d5016')
        )

        header_style = ParagraphStyle(
            'CustomHeader',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            textColor=colors.HexColor('#39482a')
        )

        elements = []
        institution = target_staff.institution

        contact_info = []
        if institution.contact_email:
            contact_info.append(f"Email: {institution.contact_email}")
        if institution.contact_phone:
            contact_info.append(f"Phone: {institution.contact_phone}")
        if institution.website:
            contact_info.append(f"Website: {institution.website}")
        
        if contact_info:
            elements.append(Paragraph(" | ".join(contact_info), styles['Normal']))
        
        elements.append(Spacer(1, 0.3 * inch))
        
        # Report Title
        report_titles = {
            'overall': 'Comprehensive Faculty Performance Report',
            'aptitude': 'Aptitude Assessment Performance Report',
            'programming': 'Programming Contest Performance Report',
            'contests': 'Contest Management Report'
        }
        elements.append(Paragraph(report_titles.get(report_type, 'Faculty Performance Report'), title_style))
        elements.append(Spacer(1, 0.2 * inch))
        
        # Faculty Information
        elements.append(Paragraph("Faculty Information", header_style))
        faculty_data = [
            ["Name:", target_staff.name],
            ["Faculty ID:", target_staff.faculty_id],
            ["Department:", target_staff.department.get_full_name() if target_staff.department else 'N/A'],
            ["Role:", target_staff.get_role_display() if hasattr(target_staff, 'get_role_display') else target_staff.role],
            ["Report Period:", f"{date_from or 'All time'} to {date_to or 'Present'}"],
        ]
        
        if batch_filter:
            faculty_data.append(["Batch Filter:", batch_filter])
        if topic_filter:
            faculty_data.append(["Topic Filter:", topic_filter])
            
        faculty_table = Table(faculty_data, colWidths=[2*inch, 4*inch])
        faculty_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(faculty_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Get filtered data based on report type and filters
        report_data = self._get_filtered_report_data(target_staff, report_type, batch_filter, topic_filter, date_from, date_to)
        
        # Performance Metrics
        elements.append(Paragraph("Performance Metrics", header_style))
        metrics_data = [
            ["Metric", "Value", "Details"],
            ["Total Students Managed", str(report_data['student_count']), f"Across {report_data['batch_count']} batches"],
            ["Contests Created", str(report_data['total_contests']), f"{report_data['active_contests']} active"],
            ["Student Submissions", str(report_data['total_submissions']), f"Avg: {report_data['avg_submissions_per_student']:.1f} per student"],
            ["Problems Solved", str(report_data['total_problems_solved']), f"Success rate: {report_data['success_rate']:.1f}%"],
        ]
        
        if report_type in ['aptitude', 'overall']:
            metrics_data.extend([
                ["Aptitude Tests Conducted", str(report_data['aptitude_tests']), f"{report_data['aptitude_participants']} participants"],
                ["Avg Aptitude Score", f"{report_data['avg_aptitude_score']:.1f}%", f"Best: {report_data['best_aptitude_score']:.1f}%"],
            ])
            
        metrics_table = Table(metrics_data, colWidths=[2.5*inch, 1.5*inch, 2.5*inch])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(metrics_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Aggregate Performance Graphs
        chart_data = report_data.get('performance_charts', {})
        if chart_data:
            elements.append(Paragraph("Performance Graphs", header_style))
            overall = chart_data.get('overall', {})
            overall_values = [
                overall.get('programming', 0),
                overall.get('aptitude', 0),
                overall.get('contest', 0),
            ]
            if not sum(overall_values):
                overall_values = [1]
                overall_labels = ["No data"]
            else:
                overall_labels = ["Programming", "Aptitude", "Contest"]

            daily = chart_data.get('daily_solved', [])[-14:]
            daily_values = [row.get('count', 0) for row in daily]
            daily_labels = [row.get('date', '')[5:] for row in daily]

            pie = _pie_chart(overall_values, overall_labels, ['#22c55e', '#3b82f6', '#f59e0b'], size=130)
            daily_bar = _bar_chart(daily_values, daily_labels, bar_color='#0f766e', w=295, h=140)
            chart_table = Table([[pie, daily_bar]], colWidths=[2.2*inch, 4.2*inch])
            chart_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d9c2')),
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8f9f7')),
            ]))
            elements.append(chart_table)
            elements.append(Spacer(1, 0.25 * inch))

            topics = chart_data.get('topics', [])[:10]
            if topics:
                elements.append(Paragraph("Solving Topics", header_style))
                elements.append(_bar_chart(
                    [row.get('count', 0) for row in topics],
                    [row.get('label', '')[:10] for row in topics],
                    bar_color='#4f46e5',
                    w=475,
                    h=150,
                ))
                elements.append(Spacer(1, 0.3 * inch))

        # Batch-wise Performance (if applicable)
        if report_data['batch_performance']:
            elements.append(Paragraph("Batch-wise Performance", header_style))
            batch_data = [["Batch", "Students", "Avg Score", "Top Performer", "Completion Rate"]]
            for batch_info in report_data['batch_performance']:
                batch_data.append([
                    batch_info['batch'],
                    str(batch_info['student_count']),
                    f"{batch_info['avg_score']:.1f}%",
                    batch_info['top_performer'],
                    f"{batch_info['completion_rate']:.1f}%"
                ])
            
            batch_table = Table(batch_data, colWidths=[1.2*inch, 1*inch, 1.2*inch, 1.8*inch, 1.3*inch])
            batch_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(batch_table)
            elements.append(Spacer(1, 0.3 * inch))

        # Recent Activity Summary
        if report_data['recent_activities']:
            elements.append(Paragraph("Recent Activity (Last 30 Days)", header_style))
            activity_data = [["Date", "Activity", "Student/Contest", "Result"]]
            for activity in report_data['recent_activities'][:10]:  # Show top 10
                activity_data.append([
                    activity['date'],
                    activity['type'],
                    activity['subject'],
                    activity['result']
                ])
            
            activity_table = Table(activity_data, colWidths=[1.2*inch, 1.5*inch, 2*inch, 1.8*inch])
            activity_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(activity_table)

        # Footer
        elements.append(Spacer(1, 0.5 * inch))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=1
        )
        local_now = timezone.localtime(timezone.now())
        elements.append(Paragraph(f"Report generated on {local_now.strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        elements.append(Paragraph(f"Generated by: {user_profile.name} ({user_profile.faculty_id})", footer_style))

        doc.build(elements)
        buffer.seek(0)
        
        # Generate filename based on filters
        filename_parts = [f"Report_{target_staff.faculty_id}"]
        if batch_filter:
            filename_parts.append(f"Batch_{batch_filter}")
        if report_type != 'overall':
            filename_parts.append(report_type.title())
        filename_parts.append(local_now.strftime('%Y%m%d'))
        
        filename = "_".join(filename_parts) + ".pdf"
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _get_filtered_report_data(self, staff, report_type, batch_filter, topic_filter, date_from, date_to):
        """Get comprehensive report data based on filters."""
        from datetime import datetime, timedelta
        from django.db.models import Q, Avg, Count, Sum, Max
        from collections import defaultdict
        
        # Base queryset for students
        students_qs = StudentProfile.objects.filter(
            department=staff.department if staff.department else None
        )
        
        if batch_filter:
            students_qs = students_qs.filter(batch=batch_filter)
            
        # Date filtering
        date_filter = Q()
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                date_filter &= Q(created_at__date__gte=date_from_obj)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                date_filter &= Q(created_at__date__lte=date_to_obj)
            except ValueError:
                pass

        # Get contests created by this staff
        contests_qs = staff.contests.all()
        if date_filter:
            contests_qs = contests_qs.filter(date_filter)

        # Calculate metrics
        student_count = students_qs.count()
        batch_count = students_qs.values('batch').distinct().count()
        total_contests = contests_qs.count()
        active_contests = contests_qs.filter(status='published').count()

        # Submission metrics
        submissions = ExecutionRecord.objects.filter(
            student__in=students_qs
        )
        if date_filter:
            submissions = submissions.filter(date_filter)
            
        total_submissions = submissions.count()
        # Use SolvedProblem for successful submissions instead
        successful_problems = SolvedProblem.objects.filter(student__in=students_qs)
        if date_filter:
            # Use solved_at field for SolvedProblem
            date_filter_solved = Q()
            if date_from:
                try:
                    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                    date_filter_solved &= Q(solved_at__date__gte=date_from_obj)
                except ValueError:
                    pass
            if date_to:
                try:
                    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                    date_filter_solved &= Q(solved_at__date__lte=date_to_obj)
                except ValueError:
                    pass
            if date_filter_solved:
                successful_problems = successful_problems.filter(date_filter_solved)
        successful_submissions = successful_problems.count()
        avg_submissions_per_student = total_submissions / student_count if student_count > 0 else 0
        success_rate = (successful_submissions / total_submissions * 100) if total_submissions > 0 else 0

        # Problem solving metrics
        solved_problems = SolvedProblem.objects.filter(student__in=students_qs)
        if date_filter:
            # Use solved_at field for SolvedProblem
            if date_filter_solved:
                solved_problems = solved_problems.filter(date_filter_solved)
        total_problems_solved = solved_problems.count()

        # Aptitude metrics
        aptitude_data = {'aptitude_tests': 0, 'aptitude_participants': 0, 'avg_aptitude_score': 0, 'best_aptitude_score': 0}
        if report_type in ['aptitude', 'overall']:
            aptitude_contests = contests_qs.filter(contest_type='aptitude')
            aptitude_submissions = AptitudeContestSubmission.objects.filter(
                contest__in=aptitude_contests,
                student__in=students_qs
            )
            if date_filter:
                # Use submitted_at field for contest submissions
                date_filter_aptitude_submissions = Q()
                if date_from:
                    try:
                        date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                        date_filter_aptitude_submissions &= Q(submitted_at__date__gte=date_from_obj)
                    except ValueError:
                        pass
                if date_to:
                    try:
                        date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                        date_filter_aptitude_submissions &= Q(submitted_at__date__lte=date_to_obj)
                    except ValueError:
                        pass
                if date_filter_aptitude_submissions:
                    aptitude_submissions = aptitude_submissions.filter(date_filter_aptitude_submissions)
                
            aptitude_data.update({
                'aptitude_tests': aptitude_contests.count(),
                'aptitude_participants': aptitude_submissions.values('student').distinct().count(),
                'avg_aptitude_score': aptitude_submissions.aggregate(avg=Avg('score'))['avg'] or 0,
                'best_aptitude_score': aptitude_submissions.aggregate(max=Max('score'))['max'] or 0,
            })

        # Aggregate chart data for staff/HOD report generation.
        start_day = timezone.localdate() - timedelta(days=29)
        daily_rows = (
            SolvedProblem.objects
            .filter(student__in=students_qs, solved_at__date__gte=start_day)
            .values('solved_at__date')
            .annotate(count=Count('id'))
            .order_by('solved_at__date')
        )
        topic_counts = defaultdict(int)
        for tags in solved_problems.select_related('problem').values_list('problem__tags', flat=True):
            if isinstance(tags, list):
                for tag in tags[:4]:
                    topic_counts[str(tag).strip().title()] += 1
        aptitude_solved_count = SolvedAptitude.objects.filter(student__in=students_qs).count()
        contest_solved_count = (
            ContestSubmission.objects
            .filter(student__in=students_qs, status='Accepted')
            .values('contest_id', 'problem_id', 'student_id')
            .distinct()
            .count()
            + AptitudeContestSubmission.objects.filter(student__in=students_qs, is_correct=True).count()
        )
        performance_charts = {
            'overall': {
                'programming': total_problems_solved,
                'aptitude': aptitude_solved_count,
                'contest': contest_solved_count,
            },
            'daily_solved': [
                {'date': row['solved_at__date'].isoformat(), 'count': row['count']}
                for row in daily_rows
            ],
            'topics': [
                {'label': label, 'count': count}
                for label, count in sorted(topic_counts.items(), key=lambda item: item[1], reverse=True)[:10]
            ],
        }

        # Batch-wise performance
        batch_performance = []
        for batch in students_qs.values('batch').distinct():
            batch_name = batch['batch']
            batch_students = students_qs.filter(batch=batch_name)
            batch_submissions = submissions.filter(student__in=batch_students)
            
            # Calculate success rate based on solved problems vs total submissions
            batch_solved = successful_problems.filter(student__in=batch_students)
            batch_success_rate = 0
            if batch_submissions.exists():
                batch_success_rate = (batch_solved.count() / batch_submissions.count() * 100)
            
            # Find top performer in batch
            top_performer = batch_students.annotate(
                solved_count=Count('solved_problems')
            ).order_by('-solved_count').first()
            
            batch_performance.append({
                'batch': batch_name,
                'student_count': batch_students.count(),
                'avg_score': batch_success_rate,
                'top_performer': top_performer.name if top_performer else 'N/A',
                'completion_rate': batch_success_rate
            })

        # Recent activities
        recent_activities = []
        recent_submissions = submissions.filter(
            created_at__gte=timezone.now() - timedelta(days=30)
        ).order_by('-created_at')[:20]
        
        for sub in recent_submissions:
            # Check if this submission resulted in a solved problem
            is_success = successful_problems.filter(
                student=sub.student, 
                problem=sub.problem,
                solved_at__date=sub.created_at.date()
            ).exists()
            
            recent_activities.append({
                'date': sub.created_at.strftime('%m/%d'),
                'type': 'Problem Solved' if is_success else 'Attempt',
                'subject': f"{sub.student.name} - {sub.problem.title[:30] if sub.problem else 'Unknown Problem'}",
                'result': 'Success' if is_success else 'Failed'
            })

        return {
            'student_count': student_count,
            'batch_count': batch_count,
            'total_contests': total_contests,
            'active_contests': active_contests,
            'total_submissions': total_submissions,
            'avg_submissions_per_student': avg_submissions_per_student,
            'success_rate': success_rate,
            'total_problems_solved': total_problems_solved,
            'batch_performance': batch_performance,
            'recent_activities': recent_activities,
            'performance_charts': performance_charts,
            **aptitude_data
        }

