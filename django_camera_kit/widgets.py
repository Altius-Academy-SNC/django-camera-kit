"""Form widgets for in-browser document scanning."""

from __future__ import annotations

from django import forms
from django.utils.translation import gettext as _

from . import conf
from .formats import ORIENTATIONS, DocumentFormat, get_format, iter_formats

#: The widget also accepts "auto", which follows the format's own habit.
ORIENTATION_OPTIONS = (*ORIENTATIONS, "auto")


def scanner_labels() -> dict[str, str]:
    """Every string the scanner UI shows, translated for the current request.

    The browser code holds no user-facing text of its own: it reads this
    bundle from the widget's JSON configuration. That keeps the JavaScript
    free of hardcoded French and lets a project translate the scanner
    through its usual ``.po`` catalogues.
    """
    return {
        "trigger": _("Scan a document"),
        "cancel": _("Cancel"),
        "close": _("Close"),
        "start": _("Start scanning"),
        "capture": _("Capture"),
        "retake": _("Retake"),
        "confirmPage": _("Use this page"),
        "addPage": _("Next page"),
        "finish": _("Finish"),
        "deletePage": _("Delete this page"),
        "format": _("Document format"),
        "orientation": _("Orientation"),
        "portrait": _("Portrait"),
        "landscape": _("Landscape"),
        "autoCapture": _("Capture automatically"),
        "batch": _("Series mode: chain the pages without stopping"),
        "adjustTitle": _("Drag the corners if the frame is off"),
        "pagesTitle": _("Captured pages"),
        "pageNumber": _("Page {number}"),
        "pageCount": _("{count} page(s)"),
        "hintSearching": _("Point the camera at the document"),
        "hintTooSmall": _("Move closer to the document"),
        "hintWrongShape": _("This does not match the selected format"),
        "hintBlurry": _("Hold the camera steady, the image is blurry"),
        "hintHoldStill": _("Hold still…"),
        "hintCapturing": _("Capturing…"),
        "hintNextPage": _("Page {count} captured — show the next one"),
        "hintManual": _("No document detected: capture manually"),
        "errorCamera": _("Cannot access the camera: {error}"),
        "errorEngine": _("The scanning engine did not load: manual capture only."),
        "errorMaxPages": _("Page limit reached ({max})."),
        "errorNoPage": _("Capture at least one page first."),
    }


class DocumentScannerWidget(forms.FileInput):
    """FileInput enhanced with in-browser document scanning.

    The whole pipeline runs client-side: edge detection (OpenCV.js WASM),
    manual corner adjustment, flattening to the chosen format, then the
    result is written back into this input through the DataTransfer API. To
    the rest of the form it stays an ordinary file input, so any existing
    ``FileField`` or ``ImageField`` becomes scannable without a new model,
    endpoint or migration.

    Args:
        attrs: Standard widget attributes.
        document_format: Format key the scan is locked to (``"a4"``,
            ``"id_card"``, ``"original"``…). Defaults to the
            ``DEFAULT_FORMAT`` setting.
        orientation: ``"auto"``, ``"portrait"`` or ``"landscape"``. ``"auto"``
            follows the format's natural orientation.
        output: ``"pdf"`` (one PDF, pages at their real millimetre size) or
            ``"images"`` (one JPEG per page, needs a ``multiple`` input to
            carry more than one).
        multi_page: Allow more than one page in a session.
        batch: Series mode — after each page the camera stays open and picks
            up the next document on its own.
        auto_capture: Capture on its own once the document is framed and
            steady, instead of waiting for a button press.
        allow_format_change: Let the user pick the format when the scanner
            opens, instead of imposing ``document_format``.
        max_pages: Hard cap on the pages of one session.
        quality: JPEG quality of the captured pages, 0.1 to 1.0.
        detection_width: Width frames are downscaled to for live detection.
    """

    template_name = "django_camera_kit/widgets/document_scanner.html"

    class Media:
        css = {"all": ("django_camera_kit/css/camera_kit.css",)}
        js = (
            "django_camera_kit/vendor/opencv.js",
            "django_camera_kit/vendor/jspdf.umd.min.js",
            "django_camera_kit/js/camera_kit.js",
            "django_camera_kit/js/doc_scan.js",
        )

    def __init__(  # noqa: PLR0913 - every option is an independent capture choice
        self,
        attrs: dict | None = None,
        *,
        document_format: str | None = None,
        orientation: str | None = None,
        output: str | None = None,
        multi_page: bool | None = None,
        batch: bool | None = None,
        auto_capture: bool | None = None,
        allow_format_change: bool | None = None,
        max_pages: int | None = None,
        quality: float | None = None,
        detection_width: int | None = None,
    ) -> None:
        super().__init__(attrs)
        # Kept raw: settings and translations are resolved at render time, so
        # the widget honours per-request locale and per-test overrides.
        self.document_format = document_format
        self.orientation = orientation
        self.output = output
        self.multi_page = multi_page
        self.batch = batch
        self.auto_capture = auto_capture
        self.allow_format_change = allow_format_change
        self.max_pages = max_pages
        self.quality = quality
        self.detection_width = detection_width

    def resolve_format(self) -> tuple[DocumentFormat, list[DocumentFormat]]:
        """Return the selected format and the list offered to the user."""
        extra = conf.get_extra_formats()
        key = self.document_format or conf.get_setting("DEFAULT_FORMAT")
        return get_format(str(key), extra), iter_formats(extra)

    def build_config(self) -> dict[str, object]:
        """Build the JSON configuration handed to the browser."""
        selected, available = self.resolve_format()
        return {
            "format": selected.key,
            "formats": [fmt.as_dict() for fmt in available],
            "orientation": conf.get_choice("ORIENTATION", ORIENTATION_OPTIONS, self.orientation),
            "output": conf.get_choice("OUTPUT", conf.OUTPUTS, self.output),
            "multiPage": conf.get_bool("MULTI_PAGE", self.multi_page),
            "batch": conf.get_bool("BATCH", self.batch),
            "autoCapture": conf.get_bool("AUTO_CAPTURE", self.auto_capture),
            "allowFormatChange": conf.get_bool("ALLOW_FORMAT_CHANGE", self.allow_format_change),
            "maxPages": conf.get_max_pages(self.max_pages),
            "quality": conf.get_quality(self.quality),
            "detectionWidth": conf.get_detection_width(self.detection_width),
            "labels": scanner_labels(),
        }

    def get_context(self, name: str, value, attrs) -> dict:
        context = super().get_context(name, value, attrs)
        widget = context["widget"]
        element_id = (widget.get("attrs") or {}).get("id") or f"id_{name}"
        widget["config"] = self.build_config()
        widget["config_id"] = f"{element_id}-camera-kit-config"
        widget["trigger_label"] = widget["config"]["labels"]["trigger"]
        return context
