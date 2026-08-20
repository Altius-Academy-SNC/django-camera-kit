# Changelog

All notable changes to django-camera-kit are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-08-20

The release that makes the scanner usable on a real pile of documents, and the
liveness check worth its name.

### Added

- **Document formats.** A scan is locked to a physical format — A3, A4, A5, A6,
  Letter, Legal, ID-1 card, passport page, photo, receipt, or "keep original
  proportions". The format drives three things at once: the guide drawn over
  the video, the rejection of candidates whose proportions do not fit, and the
  aspect ratio the page is flattened to. Two A4 sheets scanned one after the
  other now come out the same size, and the PDF page carries the format's real
  millimetre dimensions instead of a stretched A4.
- **Project-defined formats** through `DJANGO_CAMERA_KIT["EXTRA_FORMATS"]`, for
  the notebook, register or delivery slip that no standard covers.
- **Orientation**, per widget or per project: `"auto"` follows the format's own
  habit — paper portrait, ID card landscape.
- **Series mode** (`batch=True`): the camera stays open and chains pages on its
  own, with a flash, a thumbnail and a cooldown between two captures. Scanning
  twenty pages no longer means twenty confirmations.
- **Automatic capture**: the shutter fires once the shape has been steady for
  four detections and the frame is sharp, after a short visible countdown.
  Sharpness is measured as the variance of the Laplacian.
- **A format/orientation/mode setup step** when the scanner opens, which the
  developer can turn off with `allow_format_change=False`.
- **Page management**: thumbnail strip during capture, a review grid, and
  per-page deletion before the export.
- **`output="images"`** to get one JPEG per page instead of a PDF.
- **Face framing in the KYC flow**: an oval guide, live feedback (*move
  closer*, *move back*, *centre your face*), and a guide that turns green when
  the face sits inside it at a usable size.
- **A real head-pose challenge**: look at the camera, turn left, turn right —
  the two turns shuffled so a recording cannot match a fixed order — each held
  for four consecutive frames.
- **`django_camera_kit.kyc.liveness`**, the pure geometry behind it: yaw as the
  nose's offset from the eye midpoint in eye-distance units, scale-invariant
  and independent of lighting or skin tone.
- **Named exceptions** — `CameraKitError`, `ConfigurationError`,
  `UnknownFormatError` — and settings validated when they are read, with a
  message that says what to fix.
- **Translations**: every string the browser shows now comes from the widget as
  a JSON block, translated server-side through the usual `.po` catalogues — and
  the package **ships its own French catalogue**, so `pip install` gives a
  French scanner and a French KYC flow without writing a single `.po` entry.
- **Tests for the browser code**: the geometry of the scanner and of the
  liveness challenge runs in a VM context under `node --test`, with no browser,
  no camera and no OpenCV. ESLint holds the JavaScript to the same complexity,
  depth and 60-line limits as the Python.

### Changed

- **Liveness is verified server-side.** The `liveness_passed` flag the browser
  used to send is gone — the submission has no field to carry it. The client
  now posts the challenge frames, and `KYCVerifyView` re-measures the head pose
  on each one and checks that all three frames show the same face. A page that
  claims to have passed the challenge no longer passes it. **Breaking for any
  client that posted `liveness_passed`.**
- **Live detection runs on a downscaled frame** (480 px by default, configurable)
  about eight times a second, instead of a full-resolution OpenCV pass on every
  animation frame. That is the difference between a usable phone and a hot one.
- **Candidates are scored, not just measured**: coverage times how well the
  proportions match the expected format, so a table edge stops winning against
  the sheet of paper on it.
- **The ID document is flattened** when its edges are found, instead of storing
  the whole frame.
- **The scanner's CSS ships its own button styling**, so the overlay looks
  deliberate on a page with no CSS framework. Bootstrap class names are kept,
  so a Bootstrap project inherits its own styling instead.
- **`KYCVerification`** gains `liveness_score` and `liveness_reason` (migration
  `0002_server_side_liveness`), so a rejection says why.
- The package is checked with `ruff`, `ruff format`, `mypy`, `pytest` with
  warnings promoted to errors, ESLint and `node --test` — all six with zero
  output. `tests/test_code_rules.py` walks the syntax tree and fails the build
  if a function grows past 60 lines, a `global` appears, an exception handler
  goes silent, or French text creeps back into the browser code.

### Fixed

- Corner handles were positioned in the canvas' coordinate system but placed in
  the wrapper's, so they drifted away from the corners they were meant to
  follow whenever the canvas was letterboxed.
- The live detection loop called itself through `requestAnimationFrame`, which
  kept a 60 Hz loop alive for an overlay that changes eight times a second.
- The PDF stretched every page to the width of a default A4 page, overflowing
  it for anything taller than A4.
- `cv.Mat.ones()` allocated a kernel that was never freed on each detection.
- The scanner's "Finish" button in the page-review step was never wired up.
- Importing the KYC module no longer keeps a `global` model handle.

## [0.1.0] - 2026-07

- First release: `DocumentScannerWidget` with live edge detection, manual
  corner adjustment and multi-page PDF export; `KYCVerificationWidget` with
  selfie/ID capture and a head-movement challenge; `KYCVerifyView` with
  server-side embedding comparison, authentication, throttling and upload
  limits.
