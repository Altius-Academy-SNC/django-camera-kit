"""The format registry is what makes two scans of the same paper match."""

import pytest

from django_camera_kit.exceptions import ConfigurationError, UnknownFormatError
from django_camera_kit.formats import (
    BUILTIN_FORMATS,
    FREE_FORMAT_KEY,
    MAX_SIDE_MM,
    custom_format,
    get_format,
    iter_formats,
)


class TestRegistry:
    def test_a4_is_iso_216(self):
        a4 = get_format("a4")
        assert (a4.width_mm, a4.height_mm) == (210.0, 297.0)
        assert a4.aspect_ratio == pytest.approx(0.7071, abs=1e-3)

    def test_id_card_is_iso_7810_id1(self):
        card = get_format("id_card")
        assert (card.width_mm, card.height_mm) == (53.98, 85.6)
        assert card.natural_orientation == "landscape"

    def test_the_free_format_imposes_nothing(self):
        free = get_format(FREE_FORMAT_KEY)
        assert free.is_free
        assert free.aspect_ratio == 0.0

    def test_unknown_key_lists_what_exists(self):
        with pytest.raises(UnknownFormatError, match="a4"):
            get_format("a4-ish")

    @pytest.mark.parametrize("key", ["", None, 42])
    def test_a_key_must_be_a_string(self, key):
        with pytest.raises(UnknownFormatError):
            get_format(key)

    def test_iteration_keeps_the_free_format_last(self):
        keys = [fmt.key for fmt in iter_formats()]
        assert keys[-1] == FREE_FORMAT_KEY
        assert len(keys) == len(BUILTIN_FORMATS)

    def test_the_registry_cannot_be_mutated(self):
        with pytest.raises(TypeError):
            BUILTIN_FORMATS["a4"] = None

    def test_every_builtin_serialises(self):
        for fmt in iter_formats():
            data = fmt.as_dict()
            assert set(data) == {
                "key",
                "label",
                "widthMm",
                "heightMm",
                "aspectRatio",
                "naturalOrientation",
            }
            assert isinstance(data["label"], str)


class TestCustomFormat:
    def test_a_project_can_declare_its_own(self):
        booklet = custom_format("booklet", "Booklet", 120, 190)
        assert booklet.aspect_ratio == pytest.approx(120 / 190)
        assert get_format("booklet", {"booklet": booklet}) is booklet

    @pytest.mark.parametrize("width", [0, -5, 1, MAX_SIDE_MM + 1, "wide"])
    def test_dimensions_are_bounded(self, width):
        with pytest.raises(ConfigurationError, match="width_mm"):
            custom_format("booklet", "Booklet", width, 190)

    def test_orientation_is_checked(self):
        with pytest.raises(ConfigurationError, match="natural_orientation"):
            custom_format("booklet", "Booklet", 120, 190, "diagonal")

    def test_key_is_required(self):
        with pytest.raises(ConfigurationError):
            custom_format("", "Booklet", 120, 190)
