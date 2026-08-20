# Quick Start

## Scan a document into any existing FileField

```python
# forms.py
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
  <button type="submit">Save</button>
</form>
```

That's it. The widget replaces the plain file input with a "Scan a document"
button. The camera opens behind an A4-shaped guide, the page is flattened to
that exact ratio, and `Contract.signed_document` receives the assembled PDF as
if the user had picked a file by hand.

Scanning a stack of pages? One argument:

```python
DocumentScannerWidget(document_format="a4", batch=True)
```

The camera then stays open and chains the pages on its own — see
[Document scanning](../guides/scan.md).

Listen for `camerakit:scan-complete` on the widget's container if you want a JS hook (e.g. to enable a submit button or show a thumbnail):

```js
document.addEventListener("camerakit:scan-complete", (event) => {
  console.log(`Scanned ${event.detail.pageCount} page(s)`, event.detail.files);
});
```

## Verify identity before letting a form submit

```python
# forms.py
from django import forms
from django_camera_kit.kyc.widgets import KYCVerificationWidget

class SignupForm(forms.Form):
    email = forms.EmailField()
    kyc_verification_id = forms.IntegerField(widget=KYCVerificationWidget())
```

The widget renders a "Verify my identity" button next to a hidden field.
Clicking it opens the camera, captures the ID document, then asks for three
head poses — look at the camera, turn left, turn right — and posts every frame
to the verification endpoint (`reverse("camera_kit_kyc:verify")` by default;
pass `verify_url=` to override it).

The server compares the faces *and* re-measures the head pose on each frame. On
success the hidden field receives the `KYCVerification` id, and your own
validation decides what "verified" means for that submission.

```python
def clean_kyc_verification_id(self):
    verification_id = self.cleaned_data["kyc_verification_id"]
    verification = KYCVerification.objects.filter(
        id=verification_id, user=self.request.user, status="verified"
    ).first()
    if not verification:
        raise forms.ValidationError("Identity verification failed or is missing.")
    return verification_id
```

See [KYC & Identity Verification](../guides/kyc.md) for the full flow, settings, and the security model.
