from django.conf import settings

DEFAULTS = {
    # insightface model pack — see embeddings.py. Changing this to a model
    # with a different embedding size requires a migration (see models.py).
    "EMBEDDING_MODEL": "buffalo_sc",
    # Cosine similarity threshold above which a selfie/ID pair is considered
    # a match. This default is a starting point, not a calibrated value —
    # tune it against real data before relying on it in production.
    "MATCH_THRESHOLD": 0.45,
}


def get_setting(name):
    user_settings = getattr(settings, "DJANGO_CAMERA_KIT_KYC", {})
    return user_settings.get(name, DEFAULTS[name])
