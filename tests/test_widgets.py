"""The widget hands the browser everything it needs, and nothing hardcoded."""

import json
from pathlib import Path

import pytest
from django import forms
from django.test import override_settings

from django_camera_kit.exceptions import ConfigurationError, UnknownFormatError
from django_camera_kit.kyc.widgets import KYCVerificationWidget
from django_camera_kit.widgets import DocumentScannerWidget
from tests.testapp.forms import DocumentForm
from tests.testapp.models import Document


def render(widget):
    class Form(forms.ModelForm):
        class Meta:
            model = Document
            fields = ["file"]
            widgets = {"file": widget}

    return str(Form())


def config_of(widget):
    return widget.build_config()


class TestRendering:
    def test_renders_the_scanner_container(self):
        html = str(DocumentForm())
        assert 'class="camera-kit-scanner"' in html
        assert 'class="btn btn-outline-primary camera-kit-trigger"' in html
        assert 'type="file"' in html

    def test_embeds_the_configuration_as_json(self):
        html = render(DocumentScannerWidget())
        assert 'data-camera-kit-config="id_file-camera-kit-config"' in html
        assert '<script id="id_file-camera-kit-config" type="application/json">' in html

    def test_the_embedded_json_is_parseable(self):
        html = render(DocumentScannerWidget(document_format="id_card"))
        payload = html.split('type="application/json">')[1].split("</script>")[0]
        config = json.loads(payload)
        assert config["format"] == "id_card"
        assert config["labels"]["capture"]

    def test_declares_its_media(self):
        media_html = str(DocumentForm().media)
        assert "django_camera_kit/js/camera_kit.js" in media_html
        assert "django_camera_kit/js/doc_scan.js" in media_html
        assert "django_camera_kit/css/camera_kit.css" in media_html


class TestConfiguration:
    def test_defaults_to_a4(self):
        assert config_of(DocumentScannerWidget())["format"] == "a4"

    def test_offers_every_format(self):
        keys = [fmt["key"] for fmt in config_of(DocumentScannerWidget())["formats"]]
        assert {"a4", "a3", "id_card", "original"} <= set(keys)

    def test_an_unknown_format_fails_loudly(self):
        with pytest.raises(UnknownFormatError):
            config_of(DocumentScannerWidget(document_format="a4-ish"))

    def test_options_override_the_settings(self):
        config = config_of(
            DocumentScannerWidget(
                document_format="a3",
                orientation="landscape",
                output="images",
                multi_page=False,
                batch=True,
                auto_capture=False,
                max_pages=3,
                quality=0.7,
                detection_width=640,
            )
        )
        assert config["format"] == "a3"
        assert config["orientation"] == "landscape"
        assert config["output"] == "images"
        assert config["multiPage"] is False
        assert config["batch"] is True
        assert config["autoCapture"] is False
        assert config["maxPages"] == 3
        assert config["quality"] == 0.7
        assert config["detectionWidth"] == 640

    def test_an_invalid_option_fails_loudly(self):
        with pytest.raises(ConfigurationError, match="OUTPUT"):
            config_of(DocumentScannerWidget(output="docx"))

    @override_settings(DJANGO_CAMERA_KIT={"DEFAULT_FORMAT": "id_card", "BATCH": True})
    def test_project_settings_apply(self):
        config = config_of(DocumentScannerWidget())
        assert config["format"] == "id_card"
        assert config["batch"] is True

    @override_settings(
        DJANGO_CAMERA_KIT={
            "DEFAULT_FORMAT": "booklet",
            "EXTRA_FORMATS": [
                {"key": "booklet", "label": "Booklet", "width_mm": 120, "height_mm": 190}
            ],
        }
    )
    def test_a_project_format_is_selectable(self):
        config = config_of(DocumentScannerWidget())
        assert config["format"] == "booklet"
        assert config["formats"][-2]["key"] == "booklet"

    def test_every_label_is_a_string(self):
        labels = config_of(DocumentScannerWidget())["labels"]
        assert labels
        assert all(isinstance(value, str) and value for value in labels.values())


class TestBrowserFixtures:
    """The JSON fixtures the browser tests read are generated from these
    widgets. If a key or a label is added here and not regenerated, the
    browser tests would keep passing against a stale contract."""

    FIXTURES = Path(__file__).resolve().parent.parent / "tests_js" / "fixtures"

    def test_the_scanner_fixture_matches_the_widget(self):
        fixture = json.loads((self.FIXTURES / "scanner_config.json").read_text(encoding="utf-8"))
        config = DocumentScannerWidget().build_config()
        assert set(fixture) == set(config)
        assert set(fixture["labels"]) == set(config["labels"])
        assert [fmt["key"] for fmt in fixture["formats"]] == [
            fmt["key"] for fmt in config["formats"]
        ]

    def test_the_kyc_fixture_matches_the_widget(self):
        fixture = json.loads((self.FIXTURES / "kyc_config.json").read_text(encoding="utf-8"))
        config = KYCVerificationWidget(verify_url="/kyc/verify/").build_config()
        assert set(fixture) == set(config)
        assert set(fixture["labels"]) == set(config["labels"])
