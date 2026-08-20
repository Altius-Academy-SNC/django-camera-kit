"""Form widget for the KYC capture flow."""

from __future__ import annotations

from django import forms
from django.urls import NoReverseMatch, reverse
from django.utils.translation import gettext as _

from . import conf


def kyc_labels() -> dict[str, str]:
    """Every string the KYC UI shows, translated for the current request."""
    return {
        "trigger": _("Verify my identity"),
        "cancel": _("Cancel"),
        "close": _("Close"),
        "capture": _("Capture the ID document"),
        "send": _("Send"),
        "restart": _("Start over"),
        "retakeFace": _("Redo the face step"),
        "idTitle": _("Place your ID document inside the frame"),
        "faceTitle": _("Fit your face inside the oval"),
        "progress": _("{done}/{total}"),
        "verifying": _("Verifying…"),
        "verified": _("Identity verified."),
        "rejected": _("Verification refused — please try again."),
        "badgeVerified": _("Verified"),
        "badgeRejected": _("Not verified"),
        "hintNoFace": _("No face detected — look at the camera"),
        "hintCloser": _("Move closer"),
        "hintFarther": _("Move back a little"),
        "hintCenter": _("Centre your face in the oval"),
        "hintFrontal": _("Look straight at the camera"),
        "hintTurnLeft": _("Slowly turn your head to the left"),
        "hintTurnRight": _("Slowly turn your head to the right"),
        "errorCamera": _("Cannot access the camera: {error}"),
        "errorEngine": _("The face engine did not load; verification is unavailable."),
        "errorNetwork": _("Network error: {error}"),
        "errorServer": _("The verification could not be processed."),
    }


class KYCVerificationWidget(forms.HiddenInput):
    """Hidden field filled with a ``KYCVerification`` id once the flow passes.

    The user photographs their ID, then holds a short head-pose sequence in
    front of the camera. There is deliberately no file-upload fallback:
    accepting a picture would defeat the whole point of the challenge.

    Args:
        attrs: Standard widget attributes.
        verify_url: Endpoint the captures are posted to. Defaults to
            ``reverse("camera_kit_kyc:verify")``.
    """

    template_name = "django_camera_kit/kyc/widgets/kyc_verification.html"

    class Media:
        # The overlay layout itself lives in camera_kit.css: a form that shows
        # only the KYC widget still needs it, so it is declared here too.
        css = {
            "all": (
                "django_camera_kit/css/camera_kit.css",
                "django_camera_kit/kyc/css/kyc_capture.css",
            )
        }
        js = (
            "django_camera_kit/vendor/opencv.js",
            "django_camera_kit/js/camera_kit.js",
            "django_camera_kit/kyc/js/face_kit.js",
            "django_camera_kit/kyc/js/kyc_capture.js",
        )

    def __init__(self, attrs: dict | None = None, verify_url: str | None = None) -> None:
        super().__init__(attrs)
        self.verify_url = verify_url

    def build_config(self) -> dict[str, object]:
        """Build the JSON configuration handed to the browser."""
        return {
            "verifyUrl": self.verify_url or self._default_verify_url(),
            "quality": conf.get_setting("CAPTURE_QUALITY"),
            "labels": kyc_labels(),
        }

    def get_context(self, name: str, value, attrs) -> dict:
        context = super().get_context(name, value, attrs)
        widget = context["widget"]
        element_id = (widget.get("attrs") or {}).get("id") or f"id_{name}"
        widget["config"] = self.build_config()
        widget["config_id"] = f"{element_id}-camera-kit-kyc-config"
        widget["trigger_label"] = widget["config"]["labels"]["trigger"]
        widget["verify_url"] = widget["config"]["verifyUrl"]
        return context

    def _default_verify_url(self) -> str | None:
        try:
            return reverse("camera_kit_kyc:verify")
        except NoReverseMatch:
            return None
