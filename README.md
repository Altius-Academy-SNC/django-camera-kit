# Django Camera Kit

Document scanning and KYC face verification widgets for Django. Drop a real document scanner (live edge detection, manual corner adjustment, multi-page → PDF) into any existing `FileField`, no new models or endpoints required. Add live selfie/ID face verification with a server-side matching endpoint.

[![Tests](https://img.shields.io/github/actions/workflow/status/Altius-Academy-SNC/django-camera-kit/tests.yml?branch=main&label=tests)](https://github.com/Altius-Academy-SNC/django-camera-kit/actions/workflows/tests.yml)
[![PyPI version](https://img.shields.io/pypi/v/django-camera-kit.svg)](https://pypi.org/project/django-camera-kit/)
[![License](https://img.shields.io/github/license/Altius-Academy-SNC/django-camera-kit.svg)](LICENSE)

**[Documentation](https://altius-academy-snc.github.io/django-camera-kit)** | **[PyPI](https://pypi.org/project/django-camera-kit/)** | **[Source](https://github.com/Altius-Academy-SNC/django-camera-kit)**

## Status

Document scanning (this package's base install) and KYC identity verification (the `kyc` extra) are both implemented and tested. See the [documentation](https://altius-academy-snc.github.io/django-camera-kit) for the full guide, including the KYC module's security model and known MVP limitations.

## Quick example

```python
# forms.py — any existing ModelForm, any existing FileField/ImageField
from django import forms
from django_camera_kit.widgets import DocumentScannerWidget

from .models import Contract


class ContractForm(forms.ModelForm):
    class Meta:
        model = Contract
        fields = ["signed_document"]
        widgets = {"signed_document": DocumentScannerWidget()}
```

```html
<!-- template -->
{{ form.media }}
<form method="post" enctype="multipart/form-data">
  {% csrf_token %}
  {{ form }}
  <button type="submit">Enregistrer</button>
</form>
```

The widget replaces the plain file input with a "Scanner un document" button. Clicking it opens the camera, detects the document's edges live (OpenCV.js), lets the user drag the corners if detection misses, and supports adding several pages before assembling everything into a single PDF — written back into the same file input via the `DataTransfer` API. From the form's point of view, it's a normal file upload.

## KYC quick example

```bash
pip install django-camera-kit[kyc]
```

```python
# forms.py
from django import forms
from django_camera_kit.kyc.widgets import KYCVerificationWidget

class SignupForm(forms.Form):
    kyc_verification_id = forms.IntegerField(
        widget=KYCVerificationWidget(verify_url="/kyc/verify/")
    )
```

Requires PostgreSQL with the `pgvector` extension. Matching (face embeddings via YuNet + insightface) only ever happens server-side. See [KYC & Identity Verification](https://altius-academy-snc.github.io/django-camera-kit/guides/kyc/) for the full setup and security model.

## Setup

Two vendor JS files are required for the scan widget and not committed to this repo (binary build artifacts, pinned separately) — see [`django_camera_kit/static/django_camera_kit/vendor/README.md`](django_camera_kit/static/django_camera_kit/vendor/README.md) for exact files and versions to download.

Requires Bootstrap (or Bootstrap Native) CSS/JS to already be loaded on the host page for button styling — `django-camera-kit` only ships the structural/positioning CSS for the scanner overlays themselves.

## Roadmap

1. ~~Scan MVP~~ — single page, manual corner adjustment, perspective warp
2. Auto contour detection refinements
3. Multi-page flow polish
4. ~~KYC MVP~~ — selfie + ID capture, embedding comparison, head-movement liveness challenge
5. Anti-deepfake hardening — server-verified liveness, passive scoring, multiple challenge types
6. ~~Docs site~~ + PyPI release

## License

MIT
