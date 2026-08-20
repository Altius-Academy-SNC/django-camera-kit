"""The physical formats a scan can be locked to.

Scanning without a target format gives a page whose size is whatever the
detected quadrilateral happened to be: two A4 sheets captured one after the
other come out at two different sizes, and an ID card comes out as a random
rectangle. Locking a format does three things:

* the live view draws a guide with the right proportions, so the user frames
  the document instead of guessing;
* a candidate quadrilateral whose proportions are far from the format is
  rejected, which kills most false detections (a table edge, a laptop);
* the flattened page is rendered at exactly the format's aspect ratio, and the
  PDF page is created at its real millimetre size.

Sizes are stored in millimetres, in portrait orientation. Orientation is a
capture-time choice, not a property of the format.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType

from django.utils.translation import gettext_lazy as _

from .exceptions import ConfigurationError, UnknownFormatError

#: Key of the format that keeps whatever proportions were detected.
FREE_FORMAT_KEY = "original"

#: A dimension below this is a typo, not a document (a stamp is 20 mm).
MIN_SIDE_MM = 10.0

#: A dimension above this is a typo too: A0 is 1189 mm tall.
MAX_SIDE_MM = 2000.0

#: How a document may be held in front of the camera.
ORIENTATIONS = ("portrait", "landscape")


@dataclass(frozen=True)
class DocumentFormat:
    """One physical format, in portrait orientation.

    Attributes:
        key: Stable identifier used in settings, widget options and JSON.
        label: Human-readable name, translated.
        width_mm: Width in millimetres, or 0 for the free format.
        height_mm: Height in millimetres, or 0 for the free format.
        natural_orientation: How this format is usually held. A sheet of
            paper is portrait, an ID card is landscape. Used when the widget
            asks for ``orientation="auto"``.
    """

    key: str
    label: str
    width_mm: float
    height_mm: float
    natural_orientation: str = "portrait"

    @property
    def is_free(self) -> bool:
        """True when this format imposes no proportions."""
        return self.width_mm <= 0 or self.height_mm <= 0

    @property
    def aspect_ratio(self) -> float:
        """Width divided by height, in portrait orientation. 0 when free."""
        if self.is_free:
            return 0.0
        return self.width_mm / self.height_mm

    def as_dict(self) -> dict[str, object]:
        """JSON-serialisable form, as handed to the browser."""
        return {
            "key": self.key,
            "label": str(self.label),
            "widthMm": self.width_mm,
            "heightMm": self.height_mm,
            "aspectRatio": round(self.aspect_ratio, 6),
            "naturalOrientation": self.natural_orientation,
        }


def _build_registry() -> dict[str, DocumentFormat]:
    # The labels use a real multiplication sign: they are shown to people.
    entries = (
        DocumentFormat("a3", _("A3 (297 × 420 mm)"), 297.0, 420.0),
        DocumentFormat("a4", _("A4 (210 × 297 mm)"), 210.0, 297.0),
        DocumentFormat("a5", _("A5 (148 × 210 mm)"), 148.0, 210.0),
        DocumentFormat("a6", _("A6 (105 × 148 mm)"), 105.0, 148.0),
        DocumentFormat("letter", _("Letter (216 × 279 mm)"), 215.9, 279.4),
        DocumentFormat("legal", _("Legal (216 × 356 mm)"), 215.9, 355.6),
        # ISO/IEC 7810 ID-1: national ID cards, driving licences, bank cards.
        DocumentFormat("id_card", _("ID card (85.6 × 54 mm)"), 53.98, 85.6, "landscape"),
        # ICAO 9303 TD3: passport data page.
        DocumentFormat("passport", _("Passport page (125 × 88 mm)"), 88.0, 125.0, "landscape"),
        DocumentFormat("photo", _("Photo (10 × 15 cm)"), 100.0, 150.0),
        DocumentFormat("receipt", _("Receipt (80 × 200 mm)"), 80.0, 200.0),
        DocumentFormat(FREE_FORMAT_KEY, _("Keep original proportions"), 0.0, 0.0),
    )
    return {entry.key: entry for entry in entries}


#: Read-only registry: a consuming project extends it through
#: ``DJANGO_CAMERA_KIT["EXTRA_FORMATS"]``, never by mutating this mapping.
BUILTIN_FORMATS = MappingProxyType(_build_registry())


def custom_format(
    key: str,
    label: str,
    width_mm: float,
    height_mm: float,
    natural_orientation: str = "portrait",
) -> DocumentFormat:
    """Build a format from millimetre dimensions.

    Args:
        key: Identifier, unique among the formats of the project.
        label: Human-readable name, already translated.
        width_mm: Width in millimetres, in portrait orientation.
        height_mm: Height in millimetres, in portrait orientation.
        natural_orientation: ``"portrait"`` or ``"landscape"``.

    Returns:
        DocumentFormat: The validated format.

    Raises:
        ConfigurationError: If the key is empty, a dimension is outside
            :data:`MIN_SIDE_MM`..:data:`MAX_SIDE_MM`, or the orientation is
            not one of :data:`ORIENTATIONS`.
    """
    if not key or not isinstance(key, str):
        raise ConfigurationError(f"A format key must be a non-empty string, got {key!r}")
    if natural_orientation not in ORIENTATIONS:
        raise ConfigurationError(
            f"{key}.natural_orientation must be one of {ORIENTATIONS}, got {natural_orientation!r}"
        )
    for name, value in (("width_mm", width_mm), ("height_mm", height_mm)):
        if not isinstance(value, (int, float)) or not MIN_SIDE_MM <= value <= MAX_SIDE_MM:
            raise ConfigurationError(
                f"{key}.{name} must be between {MIN_SIDE_MM} and {MAX_SIDE_MM} mm, got {value!r}"
            )
    return DocumentFormat(key, label, float(width_mm), float(height_mm), natural_orientation)


def get_format(key: str, extra: dict[str, DocumentFormat] | None = None) -> DocumentFormat:
    """Return the format registered under ``key``.

    Args:
        key: A registry key, e.g. ``"a4"`` or ``"id_card"``.
        extra: Additional formats, checked before the built-in ones.

    Raises:
        UnknownFormatError: If no format carries that key.
    """
    if not key or not isinstance(key, str):
        raise UnknownFormatError(f"A format key must be a non-empty string, got {key!r}")
    if extra and key in extra:
        return extra[key]
    if key not in BUILTIN_FORMATS:
        known = sorted(set(BUILTIN_FORMATS) | set(extra or {}))
        raise UnknownFormatError(f"Unknown document format {key!r}. Known formats: {known}")
    return BUILTIN_FORMATS[key]


def iter_formats(extra: dict[str, DocumentFormat] | None = None) -> list[DocumentFormat]:
    """Return every available format, built-in ones first, free format last."""
    formats = [fmt for key, fmt in BUILTIN_FORMATS.items() if key != FREE_FORMAT_KEY]
    formats.extend((extra or {}).values())
    formats.append(BUILTIN_FORMATS[FREE_FORMAT_KEY])
    return formats
