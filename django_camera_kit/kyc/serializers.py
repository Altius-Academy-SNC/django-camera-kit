from rest_framework import serializers

from .models import KYCVerification


class KYCSubmissionSerializer(serializers.Serializer):
    selfie = serializers.ImageField()
    id_document = serializers.ImageField()
    liveness_passed = serializers.BooleanField(default=False)


class KYCVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = KYCVerification
        fields = ["id", "status", "match_score", "liveness_passed", "created_at"]
        read_only_fields = fields
