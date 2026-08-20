"""Exceptions raised by django-camera-kit.

Every failure surfaces as one of these, so a consuming project can recover
explicitly instead of catching a bare ``Exception``.
"""


class CameraKitError(Exception):
    """Base class for every error raised by django-camera-kit."""


class ConfigurationError(CameraKitError):
    """A setting or a widget option is missing, unknown, or invalid."""


class UnknownFormatError(ConfigurationError):
    """A document format key does not exist in the registry."""
