"""The KYC widget carries its endpoint and its labels, and never a fallback."""

import json

from django import forms

from django_camera_kit.kyc.widgets import KYCVerificationWidget


class VerificationForm(forms.Form):
    verification = forms.CharField(widget=KYCVerificationWidget(), required=False)


def render():
    return str(VerificationForm())


class TestKYCWidget:
    def test_renders_the_trigger_and_the_hidden_input(self):
        html = render()
        assert 'class="camera-kit-kyc"' in html
        assert 'type="hidden"' in html
        assert "camera-kit-kyc-trigger" in html

    def test_has_no_file_fallback(self):
        assert 'type="file"' not in render()

    def test_embeds_its_configuration(self):
        html = render()
        payload = html.split('type="application/json">')[1].split("</script>")[0]
        config = json.loads(payload)
        assert config["verifyUrl"].endswith("/kyc/verify/")
        assert config["labels"]["hintTurnLeft"]
        assert 0 < config["quality"] <= 1

    def test_an_explicit_url_wins(self):
        widget = KYCVerificationWidget(verify_url="/custom/verify/")
        assert widget.build_config()["verifyUrl"] == "/custom/verify/"

    def test_declares_its_media(self):
        media_html = str(VerificationForm().media)
        assert "django_camera_kit/kyc/js/face_kit.js" in media_html
        assert "django_camera_kit/kyc/js/kyc_capture.js" in media_html
