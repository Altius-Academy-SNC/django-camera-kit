"""Settings are validated when they are read, not silently ignored."""

import pytest
from django.test import override_settings

from django_camera_kit import conf
from django_camera_kit.exceptions import ConfigurationError


class TestSettings:
    def test_defaults_apply_without_configuration(self):
        assert conf.get_setting("DEFAULT_FORMAT") == "a4"
        assert conf.get_bool("MULTI_PAGE") is True

    def test_unknown_setting_is_refused(self):
        with pytest.raises(ConfigurationError, match="Unknown DJANGO_CAMERA_KIT setting"):
            conf.get_setting("NOPE")

    @override_settings(DJANGO_CAMERA_KIT="not-a-dict")
    def test_the_namespace_must_be_a_dict(self):
        with pytest.raises(ConfigurationError, match="must be a dict"):
            conf.get_setting("DEFAULT_FORMAT")

    @override_settings(DJANGO_CAMERA_KIT={"OUTPUT": "docx"})
    def test_output_choices_are_closed(self):
        with pytest.raises(ConfigurationError, match="OUTPUT"):
            conf.get_choice("OUTPUT", conf.OUTPUTS)

    @override_settings(DJANGO_CAMERA_KIT={"MULTI_PAGE": "yes"})
    def test_booleans_are_booleans(self):
        with pytest.raises(ConfigurationError, match="MULTI_PAGE"):
            conf.get_bool("MULTI_PAGE")

    @override_settings(DJANGO_CAMERA_KIT={"MAX_PAGES": 10_000})
    def test_max_pages_is_capped(self):
        assert conf.get_max_pages() == conf.MAX_PAGES_CEILING

    @pytest.mark.parametrize("value", [0, -1, "many"])
    def test_max_pages_must_be_positive(self, value):
        with pytest.raises(ConfigurationError, match="MAX_PAGES"):
            conf.get_max_pages(value)

    @pytest.mark.parametrize("value", [0, 1.5, "high"])
    def test_quality_is_bounded(self, value):
        with pytest.raises(ConfigurationError, match="JPEG_QUALITY"):
            conf.get_quality(value)

    @pytest.mark.parametrize("value", [100, 4000, "wide"])
    def test_detection_width_is_bounded(self, value):
        with pytest.raises(ConfigurationError, match="DETECTION_WIDTH"):
            conf.get_detection_width(value)


class TestExtraFormats:
    @override_settings(
        DJANGO_CAMERA_KIT={
            "EXTRA_FORMATS": [
                {"key": "booklet", "label": "Booklet", "width_mm": 120, "height_mm": 190}
            ]
        }
    )
    def test_a_project_format_joins_the_registry(self):
        formats = conf.get_extra_formats()
        assert formats["booklet"].height_mm == 190.0

    @override_settings(DJANGO_CAMERA_KIT={"EXTRA_FORMATS": [{"key": "booklet"}]})
    def test_an_incomplete_entry_says_what_is_missing(self):
        with pytest.raises(ConfigurationError, match="height_mm"):
            conf.get_extra_formats()

    @override_settings(DJANGO_CAMERA_KIT={"EXTRA_FORMATS": "booklet"})
    def test_extra_formats_must_be_a_list(self):
        with pytest.raises(ConfigurationError, match="EXTRA_FORMATS"):
            conf.get_extra_formats()
