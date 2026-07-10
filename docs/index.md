# Django Camera Kit

**Document scanning and KYC face verification for Django.**

Two problems come up constantly in Django apps that deal with real-world documents and identity: camera-based document capture (edge detection, multi-page flow, PDF export) and face verification (selfie vs. ID photo, liveness). Neither has a solid, drop-in Django package. Django Camera Kit is both, as two independent modules.

## Document scanning

`DocumentScannerWidget` replaces a plain `<input type="file">` in any existing form:

```python
from django import forms
from django_camera_kit.widgets import DocumentScannerWidget

class ContractForm(forms.ModelForm):
    class Meta:
        model = Contract
        fields = ["signed_document"]
        widgets = {"signed_document": DocumentScannerWidget()}
```

It opens the camera, detects the document's edges live (OpenCV.js, fully client-side), lets the user drag the corners when auto-detection misses, chains multiple pages, and assembles a single PDF — written back into the same file input. No new models, no endpoints, no migrations. See [Document Scanning](guides/scan.md).

## KYC & identity verification

`KYCVerificationWidget` drives a live selfie + ID capture flow with a head-movement liveness challenge, then posts to a server-side endpoint that extracts face embeddings (YuNet + insightface) and compares them — matching only ever happens server-side.

```python
from django import forms
from django_camera_kit.kyc.widgets import KYCVerificationWidget

class SignupForm(forms.Form):
    kyc_verification_id = forms.IntegerField(
        widget=KYCVerificationWidget(verify_url="/kyc/verify/")
    )
```

Requires `pip install django-camera-kit[kyc]`, PostgreSQL with the `pgvector` extension, and `django_camera_kit.kyc` in `INSTALLED_APPS`. See [KYC & Identity Verification](guides/kyc.md).

## Why not Haar cascades?

The face detector is YuNet (`cv.FaceDetectorYN`), not the classical Haar-cascade approach most tutorials use. Haar cascades detect faces from brightness-contrast patterns and are well documented to have significantly higher miss rates on darker skin tones and in low-contrast lighting — a bias traced back to the demographic composition of their historical training sets (see Buolamwini & Gebru, ["Gender Shades"](https://proceedings.mlr.press/v81/buolamwini18a.html), 2018). YuNet is a small CNN trained on [WIDER FACE](http://shuoyang1213.me/WIDERFACE/), a much larger and more diverse dataset, and doesn't carry that specific failure mode.

## Installation

```bash
pip install django-camera-kit          # scan module only
pip install django-camera-kit[kyc]     # scan + KYC
```

See [Installation](getting-started/install.md) for the full setup, including the vendor files the scan module needs.
