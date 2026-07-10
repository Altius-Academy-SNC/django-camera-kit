# Django Camera Kit

Document scanning and KYC face verification widgets for Django. Drop a real document scanner (live edge detection, manual corner adjustment, multi-page → PDF) into any existing `FileField`, no new models or endpoints required.

[![Tests](https://img.shields.io/github/actions/workflow/status/Altius-Academy-SNC/django-camera-kit/tests.yml?branch=main&label=tests)](https://github.com/Altius-Academy-SNC/django-camera-kit/actions/workflows/tests.yml)
[![License](https://img.shields.io/github/license/Altius-Academy-SNC/django-camera-kit.svg)](LICENSE)

## Status

Phase 1 (document scan) is scaffolded and under active development. KYC (face verification, liveness, anti-deepfake) is planned for a later phase and will ship as the `kyc` optional extra.

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

## Setup

Two vendor JS files are required and not committed to this repo (binary build artifacts, pinned separately) — see [`django_camera_kit/static/django_camera_kit/vendor/README.md`](django_camera_kit/static/django_camera_kit/vendor/README.md) for exact files and versions to download before the widget works in a browser.

Requires Bootstrap (or Bootstrap Native) CSS/JS to already be loaded on the host page for button styling — `django-camera-kit` only ships the structural/positioning CSS for the scanner overlay itself.

## Roadmap

1. ~~Scan MVP~~ — single page, manual corner adjustment, perspective warp (current)
2. Auto contour detection refinements
3. Multi-page flow polish
4. KYC MVP — selfie + ID capture, embedding comparison
5. Anti-deepfake hardening — passive liveness scoring, multiple challenge types
6. Docs site + PyPI release

## License

MIT
