"""
One-time data fix: rewrite AptitudeQuestion image fields that point straight
at a Google Drive URL — the thumbnail endpoint, a raw "uc?...id=" download
link, an "open?id=" link, or a full "/file/d/<id>/view" share link pasted
straight from Drive's own Share dialog — to instead point at our own
caching image proxy (/api/aptitude/drive-image/<id>/). Anything imported
before _resolve_drive_image() recognized all of these shapes (see
views.py) is still hitting Drive directly on every page load (slower than
serving from local disk once cached), or — for the share-link shapes,
which are HTML viewer pages, not image bytes — not loading as an image at
all, which is the actual student-facing bug this command exists to repair.

New uploads already get proxy URLs from _resolve_drive_image() in views.py —
this command only needs to run once to catch data imported before that
existed, or before it recognized every URL shape. Not wired into
`migrate`; run it manually. Defaults to a dry run.

Usage:
    python manage.py backfill_drive_image_proxy                # dry run (default)
    python manage.py backfill_drive_image_proxy --apply         # actually writes
"""

import re

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from apps.learning.models import AptitudeQuestion

# Keep in sync with _DRIVE_SHARE_LINK_ID_RE in views.py — same 4 URL
# shapes, so anything views.py would now correctly resolve on a fresh
# upload is also recognized here for existing rows.
DRIVE_URL_ID_RE = re.compile(
    r"^https?://drive\.google\.com/(?:file/d/|thumbnail\?id=|uc\?(?:export=\w+&)?id=|open\?id=)([A-Za-z0-9_-]{20,})"
)
IMAGE_FIELDS = ["question_image", "option_a_image", "option_b_image", "option_c_image", "option_d_image"]


class Command(BaseCommand):
    help = "Rewrite AptitudeQuestion image fields from direct/share-link Drive URLs to our caching proxy URLs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write the changes. Without this flag, only a preview is printed.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]

        # Broad DB-level filter first (any field that even mentions a Drive
        # URL) — the precise per-shape regex below decides the real rewrite,
        # since Django's ORM can't express "matches one of N prefixes" as
        # cleanly as a plain contains-filter narrowing the candidate set.
        filters = None
        for field in IMAGE_FIELDS:
            cond = Q(**{f"{field}__icontains": "drive.google.com/"})
            filters = filters | cond if filters is not None else cond

        questions = AptitudeQuestion.objects.filter(filters).order_by("id")
        total = questions.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No questions with Drive URLs found — nothing to do."))
            return

        self.stdout.write(f"{'APPLYING' if apply_changes else 'DRY RUN'} — {total} question(s) to check.\n")

        updated_questions = 0
        updated_fields = 0

        with transaction.atomic():
            for q in questions.iterator():
                changed_fields = []
                for field in IMAGE_FIELDS:
                    value = getattr(q, field)
                    m = DRIVE_URL_ID_RE.match(value or "")
                    if m:
                        new_value = f"/api/aptitude/drive-image/{m.group(1)}/"
                        setattr(q, field, new_value)
                        changed_fields.append(field)

                if changed_fields:
                    updated_questions += 1
                    updated_fields += len(changed_fields)
                    if updated_questions <= 20:
                        self.stdout.write(f"  Question {q.id}: {', '.join(changed_fields)}")
                    if apply_changes:
                        q.save(update_fields=changed_fields)

            if not apply_changes:
                transaction.set_rollback(True)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Rewrote' if apply_changes else 'Would rewrite'}: "
            f"{updated_fields} image field(s) across {updated_questions} question(s)."
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run — re-run with --apply to write these changes."))
