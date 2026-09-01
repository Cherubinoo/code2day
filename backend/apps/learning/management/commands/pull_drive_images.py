"""
Eagerly download every Google-Drive-hosted aptitude question/option image
referenced anywhere in the database and cache it to local disk, so the
site never has to reach out to Drive at request time — aptitude_drive_
image_proxy already checks this same local cache first and only falls
back to a live Drive fetch for anything not yet pulled.

Run this once after a bulk upload of Drive-ID-based questions (e.g. a
Figure Series import) to warm the cache ahead of time instead of letting
it fill in lazily as students happen to view each image.

Usage:
    python manage.py pull_drive_images                # pull everything not yet cached
    python manage.py pull_drive_images --recheck       # also re-verify already-cached files
"""

import re
import time

from django.core.management.base import BaseCommand

from apps.learning.models import AptitudeQuestion
from apps.learning.drive_image_cache import cached_image_path, fetch_and_cache_drive_image, DriveImageFetchError

IMAGE_FIELDS = ["question_image", "option_a_image", "option_b_image", "option_c_image", "option_d_image"]
# Matches both our own proxy URL (/api/aptitude/drive-image/<id>/) and a
# direct Drive thumbnail URL, in case this runs before backfill_drive_
# image_proxy has rewritten older rows.
DRIVE_ID_RE = re.compile(
    r"(?:/api/aptitude/drive-image/|drive\.google\.com/thumbnail\?id=)([A-Za-z0-9_-]{20,})"
)


class Command(BaseCommand):
    help = "Download every Drive-hosted aptitude image to local disk so the site never depends on Drive at request time."

    def add_arguments(self, parser):
        parser.add_argument(
            "--recheck", action="store_true",
            help="Re-fetch images that already have a cached file too (default: skip anything already cached).",
        )

    def handle(self, *args, **options):
        recheck = options["recheck"]

        drive_ids = set()
        for field in IMAGE_FIELDS:
            values = AptitudeQuestion.objects.exclude(**{field: ""}).values_list(field, flat=True).distinct()
            for value in values:
                m = DRIVE_ID_RE.search(value or "")
                if m:
                    drive_ids.add(m.group(1))

        if not drive_ids:
            self.stdout.write(self.style.WARNING("No Drive-hosted images found — nothing to pull."))
            return

        to_fetch = drive_ids if recheck else {d for d in drive_ids if not cached_image_path(d)}
        already_cached = len(drive_ids) - len(to_fetch)

        self.stdout.write(
            f"{len(drive_ids)} unique image(s) referenced. "
            f"{already_cached} already cached, {len(to_fetch)} to pull.\n"
        )

        fetched = 0
        failed = []
        for i, drive_id in enumerate(sorted(to_fetch), start=1):
            try:
                fetch_and_cache_drive_image(drive_id)
                fetched += 1
            except DriveImageFetchError as exc:
                failed.append((drive_id, str(exc)))
            if i % 25 == 0 or i == len(to_fetch):
                self.stdout.write(f"  {i}/{len(to_fetch)} processed...")
            time.sleep(0.05)  # light pacing — be a polite Drive citizen over hundreds of requests

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Pulled {fetched} image(s) to local cache. Already had {already_cached}. Failed: {len(failed)}."
        ))
        if failed:
            self.stdout.write(self.style.WARNING(f"Failed ids (first 20 of {len(failed)}):"))
            for drive_id, reason in failed[:20]:
                self.stdout.write(f"  {drive_id}: {reason}")
