"""
PDF Generator for Lab Question Allocation Sheets.

Renders a ReportLab PDF listing the question allocation mapping for all
students enrolled in a Lab practical.
"""

from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Palette
_PRIMARY = colors.HexColor("#1e1b4b")   # Deep Indigo
_ACCENT = colors.HexColor("#4f46e5")    # Indigo Accent
_TEXT_DARK = colors.HexColor("#0f172a") # Slate Dark
_TEXT_MUTED = colors.HexColor("#64748b")# Slate Muted
_BG_LIGHT = colors.HexColor("#f8fafc")  # Light Slate BG
_BORDER_COLOR = colors.HexColor("#cbd5e1")


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas for dynamic 'Page X of Y' footer numbering."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(_TEXT_MUTED)

        # Footer divider line
        self.setStrokeColor(_BORDER_COLOR)
        self.setLineWidth(0.5)
        self.line(0.7 * inch, 0.6 * inch, 7.57 * inch, 0.6 * inch)

        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(7.57 * inch, 0.45 * inch, page_text)
        self.drawString(0.7 * inch, 0.45 * inch, "Confidential — Lab Question Allocation Record")
        self.restoreState()


def build_lab_allocation_pdf(buffer: BytesIO, *, lab, sessions):
    """
    Builds a PDF document mapping students to their randomly allocated questions.
    `lab`: Lab instance.
    `sessions`: QuerySet / list of LabStudentSession instances with pre-fetched `student` and `allocated_exercises`.
    """
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.8 * inch,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "HeaderTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=_PRIMARY,
        alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        "HeaderSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=_ACCENT,
        alignment=TA_CENTER,
    )
    meta_label_style = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=_PRIMARY,
    )
    meta_val_style = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=_TEXT_DARK,
    )
    cell_style = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=_TEXT_DARK,
    )
    cell_bold_style = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=_TEXT_DARK,
    )
    badge_easy = ParagraphStyle(
        "BadgeEasy",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.HexColor("#15803d"),
    )
    badge_medium = ParagraphStyle(
        "BadgeMedium",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.HexColor("#b45309"),
    )
    badge_hard = ParagraphStyle(
        "BadgeHard",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.HexColor("#b91c1c"),
    )

    story = []

    # 1. Institution & Header Block
    inst_name = ""
    dept_name = ""
    if lab.department:
        dept_name = lab.department.get_full_name()
        if getattr(lab.department, "institution", None):
            inst_name = getattr(lab.department.institution, "display_name", "") or getattr(lab.department.institution, "name", "")

    if inst_name:
        story.append(Paragraph(inst_name.upper(), title_style))
        story.append(Spacer(1, 2))
    if dept_name:
        story.append(Paragraph(f"DEPARTMENT OF {dept_name.upper()}", subtitle_style))
        story.append(Spacer(1, 4))

    story.append(Paragraph(f"LAB PRACTICAL QUESTION ALLOCATION SHEET", title_style))
    story.append(Spacer(1, 8))

    # Divider Rule
    story.append(HRFlowable(width="100%", thickness=1.5, color=_ACCENT, spaceBefore=0, spaceAfter=8))

    # 2. Lab Metadata Table
    staff_name = ""
    if lab.staff_in_charge:
        staff_name = getattr(lab.staff_in_charge, "name", "") or str(lab.staff_in_charge)

    meta_data = [
        [
            Paragraph("Lab Name:", meta_label_style), Paragraph(lab.name, meta_val_style),
            Paragraph("Date Generated:", meta_label_style), Paragraph(datetime.now().strftime("%d %b %Y, %I:%M %p"), meta_val_style),
        ],
        [
            Paragraph("Batch / Section:", meta_label_style), Paragraph(f"Batch {lab.batch}" + (f" - Section {lab.section}" if lab.section else ""), meta_val_style),
            Paragraph("Staff In-Charge:", meta_label_style), Paragraph(staff_name or "—", meta_val_style),
        ],
        [
            Paragraph("Lab Type:", meta_label_style), Paragraph(dict(lab.LAB_TYPE_CHOICES).get(lab.lab_type, lab.lab_type), meta_val_style),
            Paragraph("Total Students:", meta_label_style), Paragraph(str(len(sessions)), meta_val_style),
        ],
    ]

    meta_tbl = Table(meta_data, colWidths=[1.2 * inch, 2.3 * inch, 1.3 * inch, 2.07 * inch])
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("BACKGROUND", (0, 0), (-1, -1), _BG_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, _BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, _BORDER_COLOR),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 14))

    # 3. Question Allocation Roster Table
    th_style = ParagraphStyle(
        "TH", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white, alignment=TA_CENTER,
    )

    table_data = [[
        Paragraph("S.No", th_style),
        Paragraph("Register No", th_style),
        Paragraph("Student Name", th_style),
        Paragraph("Sub-Batch", th_style),
        Paragraph("Allocated Question(s)", th_style),
        Paragraph("Difficulty Pair", th_style),
    ]]

    for idx, sess in enumerate(sessions, start=1):
        stud = sess.student
        reg_no = getattr(stud, "register_number", "") or "—"
        stud_name = getattr(stud, "name", "") or f"Student #{stud.id}"
        sub_batch = sess.sub_batch or "Batch 1"

        alloc_exercises = list(sess.allocated_exercises.all().order_by("order", "created_at"))

        if alloc_exercises:
            q_titles = []
            diff_labels = []
            for ex in alloc_exercises:
                order_label = f"Q{ex.order + 1}" if ex.order is not None else "Q"
                diff = (ex.difficulty or "Medium").capitalize()
                q_titles.append(f"<b>{order_label}:</b> {ex.title}")
                diff_labels.append(f"{order_label} ({diff})")

            q_text = "<br/>".join(q_titles)
            diff_text = ", ".join(diff_labels)
        else:
            q_text = "<i>No allocation</i>"
            diff_text = "—"

        table_data.append([
            Paragraph(str(idx), ParagraphStyle("c", parent=cell_style, alignment=TA_CENTER)),
            Paragraph(reg_no, cell_bold_style),
            Paragraph(stud_name, cell_style),
            Paragraph(sub_batch, ParagraphStyle("cb", parent=cell_style, alignment=TA_CENTER)),
            Paragraph(q_text, cell_style),
            Paragraph(diff_text, ParagraphStyle("cd", parent=cell_style, alignment=TA_CENTER)),
        ])

    roster_table = Table(
        table_data,
        colWidths=[0.4 * inch, 1.15 * inch, 1.6 * inch, 0.8 * inch, 2.12 * inch, 0.8 * inch],
        repeatRows=1,
    )

    roster_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _PRIMARY),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, _BORDER_COLOR),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _BG_LIGHT]),
    ]))

    story.append(roster_table)
    story.append(Spacer(1, 20))

    # 4. Signatures Section
    sig_text_style = ParagraphStyle(
        "SigText", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=_PRIMARY, alignment=TA_CENTER,
    )
    sig_table = Table([
        [Paragraph("Staff In-Charge Signature", sig_text_style), Paragraph("Head of Department (HOD) Signature", sig_text_style)]
    ], colWidths=[3.4 * inch, 3.4 * inch])
    sig_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 30),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))

    story.append(KeepTogether(sig_table))

    doc.build(story, canvasmaker=NumberedCanvas)
