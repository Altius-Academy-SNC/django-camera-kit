from django import forms
from django.urls import NoReverseMatch, reverse


class KYCVerificationWidget(forms.HiddenInput):
    """Hidden field populated with a KYCVerification id once the user
    completes the live capture + server-side verification flow.

    Renders a "Vérifier mon identité" button next to the hidden input —
    unlike DocumentScannerWidget, there is deliberately no file-upload
    fallback: allowing a raw upload here would defeat the whole point of
    the liveness challenge (anyone could submit a stolen photo).
    """

    template_name = "django_camera_kit/kyc/widgets/kyc_verification.html"

    class Media:
        css = {"all": ("django_camera_kit/kyc/css/kyc_capture.css",)}
        js = (
            "django_camera_kit/vendor/opencv.js",
            "django_camera_kit/js/camera_kit.js",
            "django_camera_kit/kyc/js/face_kit.js",
            "django_camera_kit/kyc/js/kyc_capture.js",
        )

    def __init__(self, attrs=None, verify_url=None):
        super().__init__(attrs)
        self.verify_url = verify_url

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        context["widget"]["verify_url"] = self.verify_url or self._default_verify_url()
        return context

    def _default_verify_url(self):
        try:
            return reverse("camera_kit_kyc:verify")
        except NoReverseMatch:
            return None
