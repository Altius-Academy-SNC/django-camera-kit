"""Settings for the scanning side of django-camera-kit.

Everything is namespaced under ``DJANGO_CAMERA_KIT`` in Django settings::

    DJANGO_CAMERA_KIT = {
        "DEFAULT_FORMAT": "a4",
        "ORIENTATION": "auto",        # auto | portrait | landscape
        "OUTPUT": "pdf",              # pdf | images
        "MULTI_PAGE": True,
        "BATCH": False,               # keep capturing without leaving the camera
        "AUTO_CAPTURE": True,
        "ALLOW_FORMAT_CHANGE": True,
        "MAX_PAGES": 50,
        "JPEG_QUALITY": 0.92,
        "DETECTION_WIDTH": 480,
        "EXTRA_FORMATS": [
            {"key": "booklet", "label": "Carnet", "width_mm": 120, "height_mm": 190},
        ],
    }

The KYC module keeps its own namespace, ``DJANGO_CAMERA_KIT_KYC``.
"""

from __future__ import annotations

from django.conf import settings

from .exceptions import ConfigurationError
from .formats import DocumentFormat, custom_format

#: Below this, live detection has nothing left to find an edge in.
MIN_DETECTION_WIDTH = 240

#: Above this, detection costs more than the frame is worth on a phone.
MAX_DETECTION_WIDTH = 1280

#: One session never produces more pages than this, whatever the setting says:
#: every page is a full-resolution canvas held in browser memory.
MAX_PAGES_CEILING = 200

OUTPUTS = ("pdf", "images")

#: Below this, JPEG artefacts eat the text of a scanned page.
MIN_QUALITY = 0.1
MAX_QUALITY = 1.0
ORIENTATION_CHOICES = ("auto", "portrait", "landscape")

DEFAULTS: dict[str, object] = {
    "DEFAULT_FORMAT": "a4",
    "ORIENTATION": "auto",
    "OUTPUT": "pdf",
    "MULTI_PAGE": True,
    "BATCH": False,
    "AUTO_CAPTURE": True,
    "ALLOW_FORMAT_CHANGE": True,
    "MAX_PAGES": 50,
    "JPEG_QUALITY": 0.92,
    "DETECTION_WIDTH": 480,
    "EXTRA_FORMATS": (),
}


def get_setting(name: str):
    """Return a ``DJANGO_CAMERA_KIT`` setting, falling back to :data:`DEFAULTS`.

    Raises:
        ConfigurationError: If ``name`` is not a known setting, or if
            ``DJANGO_CAMERA_KIT`` is not a dict.
    """
    if name not in DEFAULTS:
        raise ConfigurationError(
            f"Unknown DJANGO_CAMERA_KIT setting {name!r}. Known: {sorted(DEFAULTS)}"
        )
    configured = getattr(settings, "DJANGO_CAMERA_KIT", {})
    if not isinstance(configured, dict):
        raise ConfigurationError(
            f"DJANGO_CAMERA_KIT must be a dict, got {type(configured).__name__}"
        )
    return configured.get(name, DEFAULTS[name])


def get_choice(name: str, allowed: tuple[str, ...], value: str | None = None) -> str:
    """Validate a value against a closed set, reading the setting when omitted."""
    resolved = get_setting(name) if value is None else value
    if resolved not in allowed:
        raise ConfigurationError(f"{name} must be one of {allowed}, got {resolved!r}")
    return str(resolved)


def get_bool(name: str, value: bool | None = None) -> bool:
    """Validate a boolean option, reading the setting when omitted."""
    resolved = get_setting(name) if value is None else value
    if not isinstance(resolved, bool):
        raise ConfigurationError(f"{name} must be a boolean, got {resolved!r}")
    return resolved


def get_max_pages(value: int | None = None) -> int:
    """Return the page cap, bounded by :data:`MAX_PAGES_CEILING`."""
    resolved = get_setting("MAX_PAGES") if value is None else value
    if not isinstance(resolved, int) or resolved < 1:
        raise ConfigurationError(f"MAX_PAGES must be a positive integer, got {resolved!r}")
    return min(resolved, MAX_PAGES_CEILING)


def get_quality(value: float | None = None) -> float:
    """Return the JPEG quality used for the captured pages."""
    resolved = get_setting("JPEG_QUALITY") if value is None else value
    if not isinstance(resolved, (int, float)) or not MIN_QUALITY <= float(resolved) <= MAX_QUALITY:
        raise ConfigurationError(
            f"JPEG_QUALITY must be between {MIN_QUALITY} and {MAX_QUALITY}, got {resolved!r}"
        )
    return float(resolved)


def get_detection_width(value: int | None = None) -> int:
    """Return the width live detection downscales frames to, in pixels."""
    resolved = get_setting("DETECTION_WIDTH") if value is None else value
    if not isinstance(resolved, int) or not MIN_DETECTION_WIDTH <= resolved <= MAX_DETECTION_WIDTH:
        raise ConfigurationError(
            f"DETECTION_WIDTH must be between {MIN_DETECTION_WIDTH} and "
            f"{MAX_DETECTION_WIDTH}, got {resolved!r}"
        )
    return resolved


def get_extra_formats() -> dict[str, DocumentFormat]:
    """Build the project-defined formats declared in ``EXTRA_FORMATS``.

    Raises:
        ConfigurationError: If an entry is not a dict or misses a key.
    """
    declared = get_setting("EXTRA_FORMATS")
    if not isinstance(declared, (list, tuple)):
        raise ConfigurationError(f"EXTRA_FORMATS must be a list, got {type(declared).__name__}")

    formats: dict[str, DocumentFormat] = {}
    for entry in declared:
        if not isinstance(entry, dict):
            raise ConfigurationError(f"Each EXTRA_FORMATS entry must be a dict, got {entry!r}")
        missing = {"key", "label", "width_mm", "height_mm"} - set(entry)
        if missing:
            raise ConfigurationError(f"EXTRA_FORMATS entry {entry!r} misses {sorted(missing)}")
        fmt = custom_format(
            key=entry["key"],
            label=str(entry["label"]),
            width_mm=entry["width_mm"],
            height_mm=entry["height_mm"],
            natural_orientation=entry.get("natural_orientation", "portrait"),
        )
        formats[fmt.key] = fmt
    return formats
