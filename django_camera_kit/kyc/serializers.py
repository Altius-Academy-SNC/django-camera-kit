from rest_framework import serializers

from . import conf
from .models import KYCVerification


def validate_upload_size(file):
    max_mb = conf.get_setting("MAX_UPLOAD_SIZE_MB")
    if file.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(f"Fichier trop volumineux (max {max_mb} Mo).")


class KYCSubmissionSerializer(serializers.Serializer):
    selfie = serializers.ImageField(validators=[validate_upload_size])
    id_document = serializers.ImageField(validators=[validate_upload_size])
    liveness_passed = serializers.BooleanField(default=False)


class KYCVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = KYCVerification
        fields = ["id", "status", "match_score", "liveness_passed", "created_at"]
        read_only_fields = fields
