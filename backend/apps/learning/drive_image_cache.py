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


def fetch_and_cache_drive_image(drive_id, timeout=15):
    """Download drive_id from Drive's public thumbnail endpoint and save it
    to the local cache. Returns the local file path. Raises
    DriveImageFetchError if the file can't be fetched or isn't an image
    (e.g. a private/deleted file serving Drive's HTML error page instead)."""
    try:
        upstream = requests.get(
            f"https://drive.google.com/thumbnail?id={drive_id}&sz=w2000",
            timeout=timeout,
        )
        upstream.raise_for_status()
    except requests.exceptions.RequestException as exc:
        raise DriveImageFetchError(f"Could not reach Drive: {exc}") from exc

    content_type = upstream.headers.get("Content-Type", "image/png").split(";")[0].strip()
    if not content_type.startswith("image/"):
        raise DriveImageFetchError("File is not accessible or is not an image.")
    ext = mimetypes.guess_extension(content_type) or ".png"

    os.makedirs(DRIVE_IMAGE_CACHE_DIR, exist_ok=True)
    cached_path = os.path.join(DRIVE_IMAGE_CACHE_DIR, f"{drive_id}{ext}")
    with open(cached_path, "wb") as f:
        f.write(upstream.content)
    return cached_path
