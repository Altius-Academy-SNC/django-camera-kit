from django.conf import settings

DEFAULTS = {
    # insightface model pack — see embeddings.py. Changing this to a model
    # with a different embedding size requires a migration (see models.py).
    "EMBEDDING_MODEL": "buffalo_sc",
    # Cosine similarity threshold above which a selfie/ID pair is considered
    # a match. This default is a starting point, not a calibrated value —
    # tune it against real data before relying on it in production.
    "MATCH_THRESHOLD": 0.45,
    # Max requests per authenticated user against KYCVerifyView. Each request
    # runs a full face-embedding inference pass — without a limit the
    # endpoint is a cheap DoS/probing vector. DRF throttle-rate syntax
    # ("N/period" — second/minute/hour/day).
    "THROTTLE_RATE": "10/hour",
    # Reject selfie/id_document uploads larger than this, before they're
    # saved or processed.
    "MAX_UPLOAD_SIZE_MB": 8,
}


def get_setting(name):
    user_settings = getattr(settings, "DJANGO_CAMERA_KIT_KYC", {})
    return user_settings.get(name, DEFAULTS[name])
