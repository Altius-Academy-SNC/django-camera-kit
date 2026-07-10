from django import forms

from django_camera_kit.kyc.widgets import KYCVerificationWidget


class _Form(forms.Form):
    verification_id = forms.IntegerField(
        required=False, widget=KYCVerificationWidget(verify_url="/kyc/verify/")
    )


def test_widget_renders_trigger_and_hidden_input():
    html = str(_Form())
    assert 'class="camera-kit-kyc"' in html
    assert 'data-verify-url="/kyc/verify/"' in html
    assert 'type="hidden"' in html
    assert 'class="btn btn-outline-primary camera-kit-kyc-trigger"' in html


def test_widget_declares_media_assets():
    media_html = str(_Form().media)
    assert "django_camera_kit/vendor/opencv.js" in media_html
    assert "django_camera_kit/kyc/js/face_kit.js" in media_html
    assert "django_camera_kit/kyc/js/kyc_capture.js" in media_html
    assert "django_camera_kit/kyc/css/kyc_capture.css" in media_html


def test_default_verify_url_falls_back_to_reverse():
    widget = KYCVerificationWidget()
    assert widget._default_verify_url() == "/kyc/verify/"
