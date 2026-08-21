"""
ImageKit client helper for uploading user profile pictures.

Configure in project .env:

    IMAGEKIT_PRIVATE_KEY=private_xxx

Optional:

    IMAGEKIT_PUBLIC_KEY=public_xxx
    IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id

Install:

    python -m pip install -U imagekitio
"""

import os
from pathlib import Path

from dotenv import load_dotenv


# ---------------------------------------------------------
# Environment
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE)


IMAGEKIT_PUBLIC_KEY = os.getenv(
    "IMAGEKIT_PUBLIC_KEY",
    "",
).strip()

IMAGEKIT_PRIVATE_KEY = os.getenv(
    "IMAGEKIT_PRIVATE_KEY",
    "",
).strip()

IMAGEKIT_URL_ENDPOINT = os.getenv(
    "IMAGEKIT_URL_ENDPOINT",
    "",
).strip()


# ---------------------------------------------------------
# ImageKit client
# ---------------------------------------------------------

_client = None


def _get_client():
    """
    Lazily create and return the ImageKit client.
    """

    global _client

    if _client is not None:
        return _client

    if not IMAGEKIT_PRIVATE_KEY:
        raise RuntimeError(
            "ImageKit is not configured. "
            "Set IMAGEKIT_PRIVATE_KEY in the project .env file."
        )

    try:
        from imagekitio import ImageKit
    except ImportError as exc:
        raise RuntimeError(
            "The 'imagekitio' package is not installed. "
            "Run: python -m pip install -U imagekitio"
        ) from exc

    _client = ImageKit(
        private_key=IMAGEKIT_PRIVATE_KEY,
    )

    return _client


# ---------------------------------------------------------
# Configuration check
# ---------------------------------------------------------

def is_configured() -> bool:
    """
    Return True when ImageKit is configured.
    """

    return bool(IMAGEKIT_PRIVATE_KEY)


# ---------------------------------------------------------
# Filename helper
# ---------------------------------------------------------

def _safe_filename(filename: str) -> str:
    """
    Sanitize uploaded filename.
    """

    filename = filename or "profile.jpg"

    safe_name = "".join(
        character
        for character in filename
        if character.isalnum() or character in "._-"
    )

    if not safe_name:
        return "profile.jpg"

    return safe_name


# ---------------------------------------------------------
# Profile picture upload
# ---------------------------------------------------------

def upload_profile_picture(
    file_bytes: bytes,
    filename: str,
    user_id: int,
) -> str:
    """
    Upload a profile picture to ImageKit.

    Returns:
        str: Public ImageKit URL.

    Raises:
        RuntimeError: If upload fails.
    """

    if not file_bytes:
        raise RuntimeError(
            "Cannot upload an empty profile picture."
        )

    client = _get_client()

    safe_name = _safe_filename(filename)

    upload_filename = (
        f"user-{user_id}-{safe_name}"
    )

    try:
        result = client.files.upload(
            file=file_bytes,
            file_name=upload_filename,
            folder="/quizv2/profile-pictures/",
            use_unique_file_name=True,
        )

    except Exception as exc:
        raise RuntimeError(
            f"ImageKit upload failed: {exc}"
        ) from exc

    url = getattr(result, "url", None)

    if not url:
        raise RuntimeError(
            "ImageKit upload succeeded, "
            "but no URL was returned."
        )

    return str(url)