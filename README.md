# Django Camera Kit

Document scanning and identity verification widgets for Django.

Drop a real scanner into any existing `FileField` — live edge detection, a
guide at the **format you chose** (A4, A3, ID card, or your own), automatic
capture, and a series mode that chains a whole stack of pages without
stopping. Add a KYC flow whose liveness challenge is **verified on the
server**, not asserted by the browser.

[![Tests](https://img.shields.io/github/actions/workflow/status/Altius-Academy-SNC/django-camera-kit/tests.yml?branch=main&label=tests)](https://github.com/Altius-Academy-SNC/django-camera-kit/actions/workflows/tests.yml)
[![PyPI version](https://img.shields.io/pypi/v/django-camera-kit.svg)](https://pypi.org/project/django-camera-kit/)
[![License](https://img.shields.io/github/license/Altius-Academy-SNC/django-camera-kit.svg)](LICENSE)

**[Documentation](https://altius-academy-snc.github.io/django-camera-kit)** | **[PyPI](https://pypi.org/project/django-camera-kit/)** | **[Source](https://github.com/Altius-Academy-SNC/django-camera-kit)** | **[Changelog](CHANGELOG.md)**

## Install

```bash
pip install django-camera-kit          # scanning
pip install django-camera-kit[kyc]     # scanning + identity verification
```

```python
INSTALLED_APPS = [..., "django_camera_kit"]
```

OpenCV.js and jsPDF are vendored in the package: no CDN, no network at
runtime.

## Scan a document

```python
from django import forms
from django_camera_kit.widgets import DocumentScannerWidget

from .models import Contract


class ContractForm(forms.ModelForm):
    class Meta:
        model = Contract
        fields = ["signed_document"]
        widgets = {"signed_document": DocumentScannerWidget(document_format="a4")}
```

```html
{{ form.media }}
<form method="post" enctype="multipart/form-data">
  {% csrf_token %}
  {{ form }}
  <button type="submit">Save</button>
</form>
```

The plain file input becomes a scan button. The camera opens, a guide with the
format's proportions is drawn over the video, the edges are detected live, the
page is flattened to exactly that format, and the PDF is written back into the
same input through the `DataTransfer` API. To the form, it is still an ordinary
file upload — no model, no endpoint, no migration.

## Pick a format

```python
DocumentScannerWidget(document_format="a4")        # 210 × 297 mm
DocumentScannerWidget(document_format="a3")        # 297 × 420 mm
DocumentScannerWidget(document_format="id_card")   # ISO/IEC 7810 ID-1
DocumentScannerWidget(document_format="original")  # keep what was measured
```

Anything the standards do not cover — a notebook, a register, a delivery slip —
is declared once:

```python
# settings.py
DJANGO_CAMERA_KIT = {
    "EXTRA_FORMATS": [
        {"key": "register", "label": "Cooperative register", "width_mm": 210, "height_mm": 330},
    ],
}
```

By default the user picks the format when the scanner opens; pass
`allow_format_change=False` when the format is not their decision.

## Scan a stack, without stopping

```python
DocumentScannerWidget(document_format="a4", batch=True, auto_capture=True)
```

The camera stays open: each page is captured as soon as it is framed and
steady, flattened, stacked, and the scanner waits for the next one. Flash,
thumbnail, short cooldown, next page. Pages can be deleted from the strip
before the export.

## Verify an identity

```python
from django_camera_kit.kyc.widgets import KYCVerificationWidget


class SignupForm(forms.Form):
    kyc_verification_id = forms.IntegerField(widget=KYCVerificationWidget())
```

The user photographs their ID inside an ID-1 guide, then fits their face in an
oval and holds three poses: look at the camera, turn left, turn right — the two
turns in a random order. The frames go to `KYCVerifyView`, which extracts the
face embeddings, compares the selfie to the ID, **re-measures the head pose on
every frame**, and checks that all three show the same person.

The browser has no way to claim the challenge passed: the submission carries no
such field. Needs PostgreSQL with `pgvector`, and
`django_camera_kit.kyc` in `INSTALLED_APPS`.

Face detection uses YuNet, not a Haar cascade — cascades miss far more often on
darker skin tones, which in a KYC flow means locking people out. See the
[KYC guide](https://altius-academy-snc.github.io/django-camera-kit/guides/kyc/)
for the full security model, including what the liveness check does *not*
defeat.

## Configure it once

```python
# settings.py
DJANGO_CAMERA_KIT = {
    "DEFAULT_FORMAT": "a4",
    "BATCH": True,
    "OUTPUT": "pdf",       # or "images"
    "MAX_PAGES": 50,
}
```

Every key is also a widget argument. Unknown keys and impossible values raise
`ConfigurationError` when they are read, instead of producing a silently wrong
guide. See the
[settings reference](https://altius-academy-snc.github.io/django-camera-kit/reference/settings/).

## Development

```bash
pip install -e ".[dev]"
ruff check . && ruff format --check . && mypy && pytest
npm ci && npm run lint && npm test
```

The browser code is held to the same rules as the Python: no recursion, no
function over 60 lines, no silent exception handler, bounded loops, and no
user-facing text (every string comes from the widget, translated server-side).
`tests/test_code_rules.py` fails the build when that stops being true.

`tests_kyc/` needs PostgreSQL with pgvector and the insightface model pack, so
it runs on demand rather than in the default suite.

## License

MIT — Altius Academy SNC.
