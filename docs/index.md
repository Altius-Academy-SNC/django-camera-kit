# Django Camera Kit

**Scan documents at a known format, and verify an identity with a challenge
the server can check.**

Two problems keep coming back in Django apps that deal with paper and people:
capturing documents with a camera, and confirming that the person in front of
it is the person on the ID. Neither had a solid, drop-in Django package.

## Document scanning

`DocumentScannerWidget` replaces a plain `<input type="file">` in any existing
form:

```python
from django import forms
from django_camera_kit.widgets import DocumentScannerWidget


class ContractForm(forms.ModelForm):
    class Meta:
        model = Contract
        fields = ["signed_document"]
        widgets = {"signed_document": DocumentScannerWidget(document_format="a4")}
```

What that gets you:

- **A format, not a guess.** A guide with the right proportions is drawn over
  the video, candidates that do not match are rejected, and the page is
  flattened to exactly that ratio. Two A4 sheets come out the same size; the
  PDF page carries their real millimetre dimensions.
- **Automatic capture.** The shutter fires once the document is framed, steady
  and sharp, after a visible countdown.
- **Series mode.** The camera stays open and chains a stack of pages on its
  own — flash, thumbnail, next page.
- **A manual override that is always there.** Four draggable corners, and a
  plain file input if the script never loads.

No new model, no endpoint, no migration. See
[Document scanning](guides/scan.md) and [Document formats](guides/formats.md).

## Identity verification

`KYCVerificationWidget` runs an ID capture, then frames the face in an oval and
asks for three poses — look at the camera, turn left, turn right, the two turns
shuffled. The frames go to a server-side endpoint that extracts face embeddings
(YuNet + insightface), compares the selfie to the ID, and **re-measures the
head pose on every frame it received**.

```python
from django_camera_kit.kyc.widgets import KYCVerificationWidget


class SignupForm(forms.Form):
    kyc_verification_id = forms.IntegerField(widget=KYCVerificationWidget())
```

The browser cannot claim the challenge passed: the submission has no field to
say so. See [KYC & identity verification](guides/kyc.md), including an honest
list of what the liveness check does not defeat.

## Why not Haar cascades

The face detector is YuNet (`cv.FaceDetectorYN`), not the classical Haar
cascade most tutorials use. Haar cascades detect faces from brightness-contrast
patterns and are well documented to miss far more often on darker skin tones
and in low-contrast lighting — a bias traced to the composition of their
historical training sets (Buolamwini & Gebru,
["Gender Shades"](https://proceedings.mlr.press/v81/buolamwini18a.html), 2018).
YuNet is a small CNN trained on
[WIDER FACE](http://shuoyang1213.me/WIDERFACE/) and does not carry that failure
mode. In a verification flow the consequence is not academic: a detector that
cannot see someone locks them out of the service.

## Installation

```bash
pip install django-camera-kit          # scanning
pip install django-camera-kit[kyc]     # scanning + identity verification
```

See [Installation](getting-started/install.md) for the full setup.
