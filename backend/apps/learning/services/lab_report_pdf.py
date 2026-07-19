"""
Renders a student's lab record (Exp No / Date / Exp Name / Aim / Algorithm /
Program / Output / Result / Seal / Signature) to PDF, boxed to match the
traditional hand-drawn lab-record layout, watermarked with the student's
register number.
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Table, TableStyle, Paragraph, Spacer,
)

_STYLES = getSampleStyleSheet()

_LABEL_STYLE = ParagraphStyle(
    "LabRecordLabel", parent=_STYLES["Normal"], fontSize=9, textColor=colors.HexColor("#555555"),
    spaceAfter=4,
)
_TITLE_STYLE = ParagraphStyle(
    "LabRecordTitle", parent=_STYLES["Normal"], fontSize=13, alignment=TA_CENTER, fontName="Helvetica-Bold",
)
_BODY_STYLE = ParagraphStyle(
    "LabRecordBody", parent=_STYLES["Normal"], fontSize=10.5, leading=15, alignment=TA_LEFT,
)
_CODE_STYLE = ParagraphStyle(
    "LabRecordCode", parent=_STYLES["Normal"], fontSize=8.5, leading=11, fontName="Courier", alignment=TA_LEFT,
)
_CORNER_STYLE = ParagraphStyle("LabRecordCorner", parent=_STYLES["Normal"], fontSize=9.5)


def _escape(text):
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _pre(text):
    """Preformatted text for a Paragraph: escape, then turn newlines into <br/>."""
    return _escape(text).replace("\r\n", "\n").replace("\n", "<br/>")


def _boxed(flowables, *, padding=10, min_height=None):
    style = [
        ("BOX", (0, 0), (-1, -1), 1.4, colors.black),
        ("LEFTPADDING", (0, 0), (-1, -1), padding),
        ("RIGHTPADDING", (0, 0), (-1, -1), padding),
        ("TOPPADDING", (0, 0), (-1, -1), padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    t = Table([[flowables]], colWidths=[6.6 * inch], rowHeights=[min_height] if min_height else None)
    t.setStyle(TableStyle(style))
    return t


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


def build_lab_report_pdf(buffer: BytesIO, *, report):
    """report: a LabExerciseReport instance (already saved, with
    exp_no/exp_name/aim/algorithm/program/output/result populated)."""
    student = report.submission.student
    doc = RegisterWatermarkDocTemplate(
        buffer,
        register_number=student.register_number or "",
        pagesize=A4,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    )

    story = []

    # ── Header box: Exp No / Date (top row) + Exp Name (centered) ──────────
    date_str = report.generated_at.strftime("%d-%m-%Y") if report.generated_at else ""
    top_row = Table(
        [[
            Paragraph(f"Exp No: {report.exp_no}", _CORNER_STYLE),
            Paragraph(f"Date: {date_str}", ParagraphStyle("r", parent=_CORNER_STYLE, alignment=2)),
        ]],
        colWidths=[3.3 * inch, 3.3 * inch],
    )
    top_row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    header_content = [top_row, Spacer(1, 6), Paragraph(_escape(report.exp_name), _TITLE_STYLE)]
    story.append(_boxed(header_content))
    story.append(Spacer(1, 14))

    # ── Aim ──────────────────────────────────────────────────────────────
    story.append(_boxed([
        Paragraph("Aim", _LABEL_STYLE),
        Paragraph(_pre(report.aim), _BODY_STYLE),
    ], min_height=1.0 * inch))
    story.append(Spacer(1, 14))

    # ── Algorithm ────────────────────────────────────────────────────────
    story.append(_boxed([
        Paragraph("Algorithm", _LABEL_STYLE),
        Paragraph(_pre(report.algorithm) or "—", _BODY_STYLE),
    ], min_height=2.2 * inch))
    story.append(Spacer(1, 14))

    # ── Program ──────────────────────────────────────────────────────────
    story.append(_boxed([
        Paragraph("Program", _LABEL_STYLE),
        Paragraph(_pre(report.program) or "—", _CODE_STYLE),
    ], min_height=2.2 * inch))
    story.append(Spacer(1, 14))

    # ── Output + Result ──────────────────────────────────────────────────
    story.append(_boxed([
        Paragraph("Output", _LABEL_STYLE),
        Paragraph(_pre(report.output) or "—", _CODE_STYLE),
        Spacer(1, 10),
        Paragraph("Result", _LABEL_STYLE),
        Paragraph(_pre(report.result) or "—", _BODY_STYLE),
    ], min_height=1.6 * inch))
    story.append(Spacer(1, 20))

    # ── Seal / Signature ────────────────────────────────────────────────
    seal_box = _boxed([Spacer(1, 30), Paragraph("Seal", ParagraphStyle("c", parent=_BODY_STYLE, alignment=TA_CENTER))], min_height=0.9 * inch)
    sig_box = _boxed([Spacer(1, 10), Paragraph("Signature", ParagraphStyle("c", parent=_BODY_STYLE, alignment=TA_CENTER))], min_height=0.5 * inch)
    footer = Table([[seal_box, sig_box]], colWidths=[3.6 * inch, 3.0 * inch])
    footer.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
    ]))
    story.append(footer)

    doc.build(story)
