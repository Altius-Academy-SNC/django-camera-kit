"""Serializers for the KYC verification endpoint."""

from __future__ import annotations

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from . import conf
from .models import KYCVerification


def validate_upload_size(file) -> None:
    """Refuse an upload larger than ``MAX_UPLOAD_SIZE_MB``."""
    max_mb = conf.get_setting("MAX_UPLOAD_SIZE_MB")
    if file.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(_("File too large (max %(max)s MB).") % {"max": max_mb})


class KYCSubmissionSerializer(serializers.Serializer):
    """One verification attempt: the ID, the selfie, and the challenge frames.

    ``frame_left`` and ``frame_right`` are the head-turn challenge captures.
    They are optional at this level so a missing frame produces a clean
    rejection rather than a 400, but a submission without them fails the
    liveness check when ``REQUIRE_LIVENESS`` is on.

    There is deliberately no ``liveness_passed`` field: the browser does not
    get to tell the server that the challenge succeeded.
    """

    selfie = serializers.ImageField(validators=[validate_upload_size])
    id_document = serializers.ImageField(validators=[validate_upload_size])
    frame_left = serializers.ImageField(required=False, validators=[validate_upload_size])
    frame_right = serializers.ImageField(required=False, validators=[validate_upload_size])


class KYCVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = KYCVerification
        fields = [
            "id",
            "status",
            "match_score",
            "liveness_passed",
            "liveness_score",
            "liveness_reason",
            "created_at",
        ]
        read_only_fields = fields
