from django import forms


class DocumentScannerWidget(forms.FileInput):
    """FileInput enhanced with in-browser document scanning.

    Detects document edges live (OpenCV.js WASM, fully client-side), lets
    the user drag the corners when auto-detection misses, and chains
    multiple pages into a single PDF before writing the result back into
    this input via the DataTransfer API. No server round-trip and no
    extra models are required — drop it into any existing FileField or
    ImageField and it behaves like a regular file input to the rest of
    the form.
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
