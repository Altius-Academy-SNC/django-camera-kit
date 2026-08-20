# Settings

Two namespaces, both optional: any key you omit falls back to its default.
Unknown keys raise `ConfigurationError` the first time they are read, rather
than being silently ignored.

## Scanning — `DJANGO_CAMERA_KIT`

```python
# settings.py
DJANGO_CAMERA_KIT = {
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
    "EXTRA_FORMATS": [],
}
```

| Key | Default | What it does |
|---|---|---|
| `DEFAULT_FORMAT` | `"a4"` | Format a scan is locked to. See [Document formats](../guides/formats.md). |
| `ORIENTATION` | `"auto"` | `"auto"`, `"portrait"` or `"landscape"`. `"auto"` follows the format's natural orientation. |
| `OUTPUT` | `"pdf"` | `"pdf"` (one file, pages at their real millimetre size) or `"images"` (one JPEG per page). |
| `MULTI_PAGE` | `True` | Allow more than one page per session. |
| `BATCH` | `False` | Series mode: after each page the camera stays open and picks up the next document. |
| `AUTO_CAPTURE` | `True` | Capture on its own once the document is framed, steady and sharp. |
| `ALLOW_FORMAT_CHANGE` | `True` | Show the format/orientation step when the scanner opens. |
| `MAX_PAGES` | `50` | Pages per session, capped at 200 whatever the value: every page is a full-resolution canvas held in browser memory. |
| `JPEG_QUALITY` | `0.92` | Quality of the captured pages, 0.1 to 1.0. |
| `DETECTION_WIDTH` | `480` | Width frames are downscaled to for live detection, 240 to 1280. Lower is faster and blinder. |
| `EXTRA_FORMATS` | `[]` | Project-defined formats, as dicts of `key`, `label`, `width_mm`, `height_mm` and optionally `natural_orientation`. |

Every one of them can be overridden per widget:

```python
DocumentScannerWidget(document_format="id_card", batch=True, output="images")
```

## KYC — `DJANGO_CAMERA_KIT_KYC`

```python
DJANGO_CAMERA_KIT_KYC = {
    "EMBEDDING_MODEL": "buffalo_sc",
    "MATCH_THRESHOLD": 0.45,
    "SAME_PERSON_THRESHOLD": 0.5,
    "LIVENESS_YAW_THRESHOLD": 0.22,
    "REQUIRE_LIVENESS": True,
    "THROTTLE_RATE": "10/hour",
    "MAX_UPLOAD_SIZE_MB": 8,
    "CAPTURE_QUALITY": 0.92,
}
```

| Key | Default | What it does |
|---|---|---|
| `EMBEDDING_MODEL` | `"buffalo_sc"` | insightface model pack. A model with a different output dimension needs a migration: `EMBEDDING_DIMENSIONS` in `models.py` is 512, matching `buffalo_sc`'s `w600k_mbf`. |
| `MATCH_THRESHOLD` | `0.45` | Cosine similarity above which a selfie/ID pair counts as a match. A starting point, not a calibrated value — tune it against real data. |
| `SAME_PERSON_THRESHOLD` | `0.5` | Similarity above which two challenge frames are considered to show the same person. Lower than `MATCH_THRESHOLD` on purpose: these are two frames of the same camera, seconds apart. |
| `LIVENESS_YAW_THRESHOLD` | `0.22` | Yaw past which a head counts as turned. Raise it to demand a wider turn, lower it for a gentler challenge. |
| `REQUIRE_LIVENESS` | `True` | Refuse a verification that carries no usable challenge. Turn it off only where liveness is established some other way. |
| `THROTTLE_RATE` | `"10/hour"` | Per-user limit on `KYCVerifyView`, in DRF throttle-rate syntax. |
| `MAX_UPLOAD_SIZE_MB` | `8` | Uploads above this are rejected with a 400 before any processing. |
| `CAPTURE_QUALITY` | `0.92` | JPEG quality of the frames the browser captures. |
