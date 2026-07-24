"""
Renders a student's lab record (Exp No / Date / Exp Name / Aim / Algorithm /
Program / Output / Result / Signature) to PDF — a plain, box-free header
followed by bordered content sections. Boxes size to their content rather
than a fixed height, so a long algorithm, program, or test-case table just
continues onto as many pages as it needs instead of clipping. Watermarked
with the student's register number.
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Table, TableStyle, Paragraph, Spacer, Preformatted,
)
from reportlab.graphics.shapes import Drawing, Rect

_STYLES = getSampleStyleSheet()
_ACCENT = colors.HexColor("#005696")   # Ramco blue
_GRAY = colors.HexColor("#64748b")
_DARK = colors.HexColor("#1e293b")
_BORDER = colors.HexColor("#e2e8f0")

_TITLE_STYLE = ParagraphStyle(
    "LabRecordTitle", parent=_STYLES["Normal"], fontSize=15, leading=19,
    alignment=TA_CENTER, fontName="Helvetica-Bold", textColor=_DARK, spaceAfter=4,
)
_INSTITUTION_STYLE = ParagraphStyle(
    "LabRecordInstitution", parent=_STYLES["Normal"], fontSize=14, leading=17,
    alignment=TA_CENTER, fontName="Helvetica-Bold", textColor=_ACCENT, spaceAfter=1,
)
_DEPARTMENT_STYLE = ParagraphStyle(
    "LabRecordDepartment", parent=_STYLES["Normal"], fontSize=10, leading=13,
    alignment=TA_CENTER, fontName="Helvetica-Bold", textColor=_GRAY, spaceAfter=8,
)
_CORNER_STYLE = ParagraphStyle("LabRecordCorner", parent=_STYLES["Normal"], fontSize=9.5, leading=12, textColor=_GRAY)
_HEADING_STYLE = ParagraphStyle(
    "LabRecordHeading", parent=_STYLES["Normal"], fontSize=11, leading=14,
    fontName="Helvetica-Bold", textColor=_ACCENT, spaceBefore=14, spaceAfter=5,
)
_BODY_STYLE = ParagraphStyle("LabRecordBody", parent=_STYLES["Normal"], fontSize=10.5, leading=15, alignment=TA_LEFT, textColor=_DARK)
_NOTE_STYLE = ParagraphStyle("LabRecordNote", parent=_BODY_STYLE, fontName="Helvetica-Oblique", textColor=_GRAY)
_CODE_STYLE = ParagraphStyle("LabRecordCode", parent=_STYLES["Normal"], fontSize=8.5, leading=11, fontName="Courier", textColor=_DARK)
_SIG_CAPTION_STYLE = ParagraphStyle("LabRecordSigCaption", parent=_BODY_STYLE, fontSize=9, alignment=TA_CENTER, textColor=_GRAY, spaceBefore=4)


def _escape(text):
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _pre(text):
    """Preformatted text for a Paragraph: escape, then turn newlines into <br/>."""
    return _escape(text).replace("\r\n", "\n").replace("\n", "<br/>")


def _truncate(text, n):
    text = (text or "").strip()
    return text if len(text) <= n else text[:n - 1] + "…"


def _heading(text):
    """A plain section heading with a thin rule underneath it — used only
    for the Exp No/Date/Title block, which stays box-free."""
    rule = Drawing(6.6 * inch, 2)
    rule.add(Rect(0, 0, 6.6 * inch, 1.2, fillColor=_ACCENT, strokeColor=None))
    return [Paragraph(text, _HEADING_STYLE), rule, Spacer(1, 6)]


def _boxed_section(title, flowable, avail_width, avail_height):
    """A titled, bordered content section — boxed only when the content
    provably fits on a single page. reportlab can't split a single Table
    row across a page break (a too-tall boxed row is a hard LayoutError,
    not a graceful split), so a section that runs long — a big algorithm,
    a long program, a wide test-case table — falls back to the plain
    heading style instead, so it can flow across pages rather than
    crashing report generation."""
    label = Paragraph(title, ParagraphStyle(f"boxlbl-{title}", parent=_STYLES["Normal"], fontSize=9,
                                             fontName="Helvetica-Bold", textColor=_ACCENT, spaceAfter=4))
    t = Table([[[label, flowable]]], colWidths=[avail_width])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, _BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    _, height = t.wrap(avail_width, avail_height)
    if height <= avail_height:
        return [t]
    return _heading(title) + [flowable]


class RegisterWatermarkDocTemplate(BaseDocTemplate):
    """Draws the student's register number diagonally across every page,
    low-opacity, behind the content."""

    def __init__(self, filename, register_number="", **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
        self.register_number = register_number
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=self._add_watermark)])

    def _add_watermark(self, canvas, doc):
        if not self.register_number:
            return
        page_width, page_height = A4
        canvas.saveState()
        canvas.translate(page_width / 2, page_height / 2)
        canvas.rotate(45)
        canvas.setFont("Helvetica-Bold", 40)
        canvas.setFillColor(colors.Color(0, 0, 0, alpha=0.08))
        canvas.drawCentredString(0, 0, self.register_number)
        canvas.restoreState()


def reexecute_test_cases(exercise, code, language):
    """Best-effort: re-run `code` against this exercise's LabExerciseTestCase
    rows to build a real Input/Expected/Received/Status table — the same
    verification method used for Problems in the per-student contest report
    (see pdf_reports.StudentContestReportPDFView._reexecute_test_cases),
    applied to lab exercises the same way.

    Returns (rows, all_passed, note):
      - rows: list of (stdin, expected, received, "Passed"/"Failed") tuples
      - all_passed: True/False, or None if rows is empty (no cases run)
      - note: explanation for why rows is empty/partial, else ""
    """
    import logging
    from .executor import execute_submission, get_language_id, ExecutorError

    logger = logging.getLogger(__name__)

    test_cases = list(exercise.test_cases.all().order_by("order"))
    if not test_cases:
        return [], None, "No test cases are configured for this exercise."
    try:
        language_id = get_language_id(language)
    except Exception:
        return [], None, f"Re-verification isn't available for language '{language}'."

    rows = []
    for tc in test_cases:
        try:
            result = execute_submission(code, language_id, stdin=tc.stdin, timeout=10)
        except ExecutorError as exc:
            # Log the real (possibly infra-revealing) error server-side only —
            # the note below ends up in a student-facing PDF, so it stays generic.
            logger.warning("Lab test-case re-execution failed: %s", exc)
            note = ("Stopped re-running test cases after an execution error." if rows
                    else "Could not automatically verify this program's output — "
                         "the code execution service was unavailable when this report was generated.")
            return rows, (all(r[3] == "Passed" for r in rows) if rows else None), note
        received = (result.get("stdout") or "").strip()
        expected = (tc.expected_output or "").strip()
        passed = received == expected and result.get("status") == "Accepted"
        # On a failing case with no stdout at all (a crash, timeout, or
        # compile error), show the real reason instead of a blank cell —
        # executor._normalize_result's unified `output` field now includes
        # a plain-English explanation for common crash signals (e.g. a
        # SIGSEGV null-pointer dereference) rather than leaving this column
        # empty with no indication anything went wrong.
        display_received = received
        if not passed and not display_received:
            display_received = result.get("output") or result.get("stderr") or result.get("compile_output") or ""
        rows.append((tc.stdin, expected, display_received, "Passed" if passed else "Failed"))
    return rows, all(r[3] == "Passed" for r in rows), ""


def _test_case_table(rows):
    hdr = [["Input", "Expected Output", "Received Output", "Status"]]
    body = [[_truncate(r[0], 40), _truncate(r[1], 30), _truncate(r[2], 30), r[3]] for r in rows]
    tbl = Table(hdr + body, colWidths=[2.2 * inch, 1.7 * inch, 1.7 * inch, 1.0 * inch], repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), _ACCENT), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTNAME", (0, 1), (-1, -1), "Courier"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), 0.3, _BORDER),
    ]
    for i, r in enumerate(rows, 1):
        bg = "#d1fae5" if r[3] == "Passed" else "#fee2e2"
        cmds.append(("BACKGROUND", (3, i), (3, i), colors.HexColor(bg)))
    tbl.setStyle(TableStyle(cmds))
    return tbl


def _details_table(details):
    """A compact Language/Status/Score/Percentage/Submitted-At summary for
    this one experiment — the lab-record analogue of the Percentage/Score/
    Time Taken block a typical assessment-vendor report shows per question,
    scoped down to the single exercise this record covers rather than a
    whole test's worth of questions."""
    submitted_at = details.get("submitted_at")
    rows = [
        ["Language", details.get("language") or "—"],
        ["Status", details.get("status") or "—"],
        ["Score", details.get("score") or "—"],
        ["Percentage", details.get("percentage") or "—"],
        ["Submitted At", submitted_at.strftime("%d %b %Y, %I:%M %p") if submitted_at else "—"],
    ]
    tbl = Table(rows, colWidths=[1.6 * inch, 3.0 * inch])
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5), ("TEXTCOLOR", (0, 0), (0, -1), _ACCENT),
        ("TEXTCOLOR", (1, 0), (1, -1), _DARK), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def _sig_block(label, width):
    line = Drawing(width, 1)
    line.add(Rect(0, 0, width, 0.6, fillColor=colors.HexColor("#94a3b8"), strokeColor=None))
    return [Spacer(1, 34), line, Paragraph(label, _SIG_CAPTION_STYLE)]


def build_lab_report_pdf(buffer: BytesIO, *, report, test_case_rows=None, test_case_note="", details=None):
    """report: a LabExerciseReport instance (already saved, with
    exp_no/exp_name/aim/algorithm/program/result populated). test_case_rows
    / test_case_note: the output of reexecute_test_cases(), computed once by
    the caller at generation time and rendered here as the Output section.
    details: optional {language, status, score, percentage, submitted_at}
    dict rendered as a Details section right before Result — the single-
    experiment analogue of the score/percentage summary a typical
    assessment-vendor report shows per question."""
    student = report.submission.student
    doc = RegisterWatermarkDocTemplate(
        buffer,
        register_number=student.register_number or "",
        pagesize=A4,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
    )

    story = []

    # ── Institution / Department header ─────────────────────────────────
    institution = student.institution
    department = student.department
    if institution is not None:
        inst_name = getattr(institution, "display_name", "") or getattr(institution, "name", "")
        if inst_name:
            story.append(Paragraph(_escape(inst_name), _INSTITUTION_STYLE))
    if department is not None:
        dept_name = department.get_full_name()
        if dept_name:
            story.append(Paragraph(_escape(dept_name), _DEPARTMENT_STYLE))
    if institution is not None or department is not None:
        rule = Drawing(6.6 * inch, 2)
        rule.add(Rect(0, 0, 6.6 * inch, 1, fillColor=_ACCENT, strokeColor=None))
        story.append(rule)
        story.append(Spacer(1, 10))

    # ── Exp No / Date / Title ───────────────────────────────────────────
    date_str = report.generated_at.strftime("%d-%m-%Y") if report.generated_at else ""
    top_row = Table(
        [[
            Paragraph(f"Exp No: {report.exp_no}", _CORNER_STYLE),
            Paragraph(f"Date: {date_str}", ParagraphStyle("r", parent=_CORNER_STYLE, alignment=TA_RIGHT)),
        ]],
        colWidths=[3.3 * inch, 3.3 * inch],
    )
    top_row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(top_row)
    story.append(Paragraph(_escape(report.exp_name), _TITLE_STYLE))
    story.append(Spacer(1, 12))

    avail_width, avail_height = doc.width, doc.height

    # ── Aim ──────────────────────────────────────────────────────────────
    story += _boxed_section("Aim", Paragraph(_pre(report.aim) or "—", _BODY_STYLE), avail_width, avail_height)
    story.append(Spacer(1, 10))

    # ── Algorithm ────────────────────────────────────────────────────────
    story += _boxed_section("Algorithm", Paragraph(_pre(report.algorithm) or "—", _BODY_STYLE), avail_width, avail_height)
    story.append(Spacer(1, 10))

    # ── Program ──────────────────────────────────────────────────────────
    story += _boxed_section(
        "Program", Preformatted(report.program or "—", _CODE_STYLE, maxLineLength=95), avail_width, avail_height,
    )
    story.append(Spacer(1, 10))

    # ── Output (verified against the exercise's test cases) ────────────
    output_content = _test_case_table(test_case_rows) if test_case_rows else Paragraph(test_case_note or "—", _NOTE_STYLE)
    story += _boxed_section("Output", output_content, avail_width, avail_height)
    story.append(Spacer(1, 10))

    # ── Details (language, status, score, percentage, submitted at) ────
    if details:
        story += _boxed_section("Details", _details_table(details), avail_width, avail_height)
        story.append(Spacer(1, 10))

    # ── Result ───────────────────────────────────────────────────────────
    story += _boxed_section("Result", Paragraph(_pre(report.result) or "—", _BODY_STYLE), avail_width, avail_height)

    # ── Signature ────────────────────────────────────────────────────────
    sig = _sig_block("Signature", 2.6 * inch)
    footer = Table([["", sig]], colWidths=[3.8 * inch, 2.8 * inch])
    footer.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
    ]))
    story.append(Spacer(1, 24))
    story.append(footer)

    doc.build(story)


def build_full_lab_summary_pdf(buffer, *, lab):
    from apps.accounts.models import StudentProfile
    from apps.learning.models import LabExerciseSubmission, LabStudentSession

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.5 * inch, bottomMargin=0.5 * inch,
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal",
        topPadding=0, bottomPadding=0, leftPadding=0, rightPadding=0,
    )
    template = PageTemplate(id="LabSummary", frames=frame)
    doc.addPageTemplates([template])

    story = []
    inst_name = lab.department.institution.name.upper() if (lab.department and getattr(lab.department, "institution", None)) else "RAMCO INSTITUTE OF TECHNOLOGY"
    dept_name = f"DEPARTMENT OF {lab.department.name.upper()}" if lab.department else "DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING"
    story.append(Paragraph(inst_name, _INSTITUTION_STYLE))
    story.append(Paragraph(dept_name, _DEPARTMENT_STYLE))
    lab_type_title = "UNIVERSITY LAB PRACTICAL PERFORMANCE REPORT" if lab.lab_type == "university" else "LAB PRACTICAL RECORD REPORT"
    story.append(Paragraph(f"<b>{lab_type_title}</b>", _TITLE_STYLE))
    story.append(Spacer(1, 10))

    sic_name = lab.staff_in_charge.name if lab.staff_in_charge else "Faculty in Charge"
    meta_data = [
        [Paragraph(f"<b>Lab Name:</b> {lab.name}", _BODY_STYLE), Paragraph(f"<b>Batch:</b> {lab.batch} ({lab.section or 'All Sections'})", _BODY_STYLE)],
        [Paragraph(f"<b>Staff in Charge:</b> {sic_name}", _BODY_STYLE), Paragraph(f"<b>Type:</b> {lab.get_lab_type_display()}", _BODY_STYLE)],
        [Paragraph(f"<b>Start Date:</b> {lab.start_date.strftime('%Y-%m-%d') if lab.start_date else '—'}", _BODY_STYLE),
         Paragraph(f"<b>End Date:</b> {lab.end_date.strftime('%Y-%m-%d') if lab.end_date else '—'}", _BODY_STYLE)],
    ]
    t_meta = Table(meta_data, colWidths=[3.5 * inch, 3.5 * inch])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, _BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, _BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Assigned Lab Exercises</b>", _HEADING_STYLE))
    exercises = list(lab.exercises.all().order_by("order", "created_at"))
    ex_rows = [[Paragraph("<b>Exp No</b>", _BODY_STYLE), Paragraph("<b>Exercise Title</b>", _BODY_STYLE)]]
    for idx, ex in enumerate(exercises, start=1):
        ex_rows.append([Paragraph(str(idx), _BODY_STYLE), Paragraph(ex.title, _BODY_STYLE)])
    t_ex = Table(ex_rows, colWidths=[1.0 * inch, 6.0 * inch])
    t_ex.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e2e8f0')),
        ('BOX', (0,0), (-1,-1), 1, _BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, _BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_ex)
    story.append(Spacer(1, 12))

    header_style = ParagraphStyle("THeader", parent=_BODY_STYLE, fontName="Helvetica-Bold", textColor=colors.white)
    story.append(Paragraph("<b>Student Practical Performance & Progress</b>", _HEADING_STYLE))
    students = StudentProfile.objects.filter(department=lab.department, batch=lab.batch)
    if lab.section:
        students = students.filter(section=lab.section)
    students = students.order_by("register_number")

    total_ex = len(exercises)
    st_rows = [[
        Paragraph("Reg No", header_style),
        Paragraph("Student Name", header_style),
        Paragraph("Sec", header_style),
        Paragraph("Completed", header_style),
        Paragraph("Progress", header_style),
        Paragraph("Status", header_style),
    ]]

    for st in students:
        completed = LabExerciseSubmission.objects.filter(exercise__lab=lab, student=st).values('exercise').distinct().count()
        session = LabStudentSession.objects.filter(lab=lab, student=st).first()
        status_txt = "Locked" if (session and session.is_locked) else ("Completed" if (completed >= total_ex and total_ex > 0) else "In Progress")
        pct = f"{round((completed / total_ex) * 100)}%" if total_ex > 0 else "0%"
        st_rows.append([
            Paragraph(st.register_number, _BODY_STYLE),
            Paragraph(st.name, _BODY_STYLE),
            Paragraph(st.section or "—", _BODY_STYLE),
            Paragraph(f"{completed} / {total_ex}", _BODY_STYLE),
            Paragraph(pct, _BODY_STYLE),
            Paragraph(status_txt, _BODY_STYLE),
        ])

    t_st = Table(st_rows, colWidths=[1.5 * inch, 2.2 * inch, 0.6 * inch, 1.0 * inch, 0.8 * inch, 0.9 * inch])
    t_st.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#005696')),
        ('BOX', (0,0), (-1,-1), 1, _BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, _BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_st)
    doc.build(story)
