"""
Shared local-disk cache for Google-Drive-hosted aptitude question/option
images — one file per Drive file ID, fetched once and reused by both
aptitude_drive_image_proxy (views.py, serves on demand) and the
pull_drive_images management command (eagerly pre-fetches everything so
the site never has to reach out to Drive at request time at all).
"""

import glob
import mimetypes
import os

import requests
from django.conf import settings

DRIVE_IMAGE_CACHE_DIR = os.path.join(settings.MEDIA_ROOT, "aptitude_drive_cache")


class DriveImageFetchError(Exception):
    """Raised when a Drive file can't be fetched or isn't an image."""


def cached_image_path(drive_id):
    """Return the local path for drive_id if it's already cached, else None."""
    os.makedirs(DRIVE_IMAGE_CACHE_DIR, exist_ok=True)
    existing = glob.glob(os.path.join(DRIVE_IMAGE_CACHE_DIR, f"{drive_id}.*"))
    return existing[0] if existing else None


# A plain requests.get with no User-Agent frequently gets refused (or
# served an HTML "can't preview this file" page instead of the image) by
# Drive's thumbnail endpoint — it's tuned for browser requests, not
# server-to-server ones. A real browser UA fixes most of that.
_DRIVE_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Two different Drive endpoints serve the same file's bytes but behave
# differently under the hood (one is the thumbnail generator, the other is
# the raw-download redirect) — trying both catches cases where one is
# throttled/blocked but the other still works.
def _drive_candidate_urls(drive_id):
    return [
        f"https://drive.google.com/thumbnail?id={drive_id}&sz=w2000",
        f"https://drive.google.com/uc?export=view&id={drive_id}",
    ]


def fetch_and_cache_drive_image(drive_id, timeout=15):
    """Download drive_id from Drive's public endpoints and save it to the
    local cache. Returns the local file path. Raises DriveImageFetchError
    if the file can't be fetched from either endpoint or isn't an image
    (e.g. a private/deleted file serving Drive's HTML error page instead)."""
    last_error = None
    for url in _drive_candidate_urls(drive_id):
        try:
            upstream = requests.get(url, timeout=timeout, headers=_DRIVE_REQUEST_HEADERS)
            upstream.raise_for_status()
        except requests.exceptions.RequestException as exc:
            last_error = exc
            continue

        content_type = upstream.headers.get("Content-Type", "image/png").split(";")[0].strip()
        if not content_type.startswith("image/"):
            last_error = DriveImageFetchError(f"{url} did not return an image (got {content_type or 'unknown content-type'}).")
            continue

        ext = mimetypes.guess_extension(content_type) or ".png"
        os.makedirs(DRIVE_IMAGE_CACHE_DIR, exist_ok=True)
        cached_path = os.path.join(DRIVE_IMAGE_CACHE_DIR, f"{drive_id}{ext}")
        with open(cached_path, "wb") as f:
            f.write(upstream.content)
        return cached_path

    raise DriveImageFetchError(f"Could not reach Drive: {last_error}")
