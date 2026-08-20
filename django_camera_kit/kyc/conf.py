"""Settings for the KYC module, namespaced under ``DJANGO_CAMERA_KIT_KYC``."""

from __future__ import annotations

from django.conf import settings

from ..exceptions import ConfigurationError

DEFAULTS: dict[str, object] = {
    # insightface model pack — see embeddings.py. Changing this to a model
    # with a different embedding size requires a migration (see models.py).
    "EMBEDDING_MODEL": "buffalo_sc",
    # Cosine similarity above which a selfie/ID pair is considered a match.
    # A starting point, not a calibrated value — tune it against real data
    # before relying on it in production.
    "MATCH_THRESHOLD": 0.45,
    # Cosine similarity above which two challenge frames are considered to
    # show the same person. Lower than MATCH_THRESHOLD on purpose: these are
    # two frames of the same camera, seconds apart.
    "SAME_PERSON_THRESHOLD": 0.5,
    # Yaw past which a head counts as turned, see liveness.py.
    "LIVENESS_YAW_THRESHOLD": 0.22,
    # Refuse a verification that carries no usable head-pose challenge. Turn
    # it off only for a flow where liveness is established some other way.
    "REQUIRE_LIVENESS": True,
    # Max requests per authenticated user against KYCVerifyView. Each request
    # runs several face-embedding inference passes — without a limit the
    # endpoint is a cheap denial-of-service and probing vector. DRF
    # throttle-rate syntax ("N/period").
    "THROTTLE_RATE": "10/hour",
    # Reject uploads larger than this, before they are saved or processed.
    "MAX_UPLOAD_SIZE_MB": 8,
    # JPEG quality of the frames the browser captures.
    "CAPTURE_QUALITY": 0.92,
}


def get_setting(name: str):
    """Return a ``DJANGO_CAMERA_KIT_KYC`` setting, falling back to defaults.

    Raises:
        ConfigurationError: If ``name`` is unknown, or if the setting is not
            a dict.
    """
    if name not in DEFAULTS:
        raise ConfigurationError(
            f"Unknown DJANGO_CAMERA_KIT_KYC setting {name!r}. Known: {sorted(DEFAULTS)}"
        )
    configured = getattr(settings, "DJANGO_CAMERA_KIT_KYC", {})
    if not isinstance(configured, dict):
        raise ConfigurationError(
            f"DJANGO_CAMERA_KIT_KYC must be a dict, got {type(configured).__name__}"
        )
    return configured.get(name, DEFAULTS[name])


def get_threshold(name: str) -> float:
    """Return a similarity or yaw threshold, validated as a positive float."""
    value = get_setting(name)
    if not isinstance(value, (int, float)) or value <= 0:
        raise ConfigurationError(f"{name} must be a positive number, got {value!r}")
    return float(value)
