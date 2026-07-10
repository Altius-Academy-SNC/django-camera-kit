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

That's it. The widget replaces the plain file input with a "Scan document" button. It behaves like a normal file input to the rest of the form — `Contract.signed_document` receives the assembled PDF exactly as if the user had picked a file manually.

Listen for `camerakit:scan-complete` on the widget's container if you want a JS hook (e.g. to enable a submit button or show a thumbnail):

```js
document.addEventListener("camerakit:scan-complete", (e) => {
  console.log(`Scanned ${e.detail.pageCount} page(s)`, e.detail.file);
});
```

## Verify identity before letting a form submit

```python
# forms.py
from django import forms
from django_camera_kit.kyc.widgets import KYCVerificationWidget

class SignupForm(forms.Form):
    email = forms.EmailField()
    kyc_verification_id = forms.IntegerField(
        widget=KYCVerificationWidget(verify_url="/kyc/verify/")
    )
```

The widget renders a "Verify my identity" button next to a hidden field. Clicking it opens the camera, captures the ID document, then runs a live head-movement challenge before capturing the selfie, and POSTs both to your `verify_url`. On a successful match, the hidden field is populated with the resulting `KYCVerification` id — your form's own validation (`clean_kyc_verification_id`, a required field, whatever fits your flow) decides what "verified" means for that submission.

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
