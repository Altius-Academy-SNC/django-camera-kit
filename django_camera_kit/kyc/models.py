from django.conf import settings
from django.db import models
from pgvector.django import HnswIndex, VectorField

# Matches buffalo_sc's w600k_mbf recognition output (see embeddings.py).
# Changing the embedding model to one with a different output size requires
# a new migration.
EMBEDDING_DIMENSIONS = 512


class KYCVerification(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "En attente"
        VERIFIED = "verified", "Vérifié"
        REJECTED = "rejected", "Rejeté"

    # Every verification is bound to the authenticated user who submitted
    # it (KYCVerifyView requires authentication) — a verification result
    # is meaningless without knowing whose identity it claims to confirm.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="kyc_verifications",
    )

    # selfie/id_document contain biometric + government-ID imagery. The
    # consuming project MUST point Django's storage backend at a private,
    # access-controlled location for these — never a publicly readable
    # MEDIA_URL. django-camera-kit doesn't enforce this itself since
    # storage config is the consuming project's responsibility, but the
    # API response (KYCVerificationSerializer) deliberately never exposes
    # these files' URLs.
    selfie = models.ImageField(upload_to="camera_kit/kyc/selfies/")
    id_document = models.ImageField(upload_to="camera_kit/kyc/id_documents/")

    selfie_embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS, null=True, blank=True)
    id_face_embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS, null=True, blank=True)
    match_score = models.FloatField(null=True, blank=True)

    # Result of the head-pose challenge, recomputed server-side from the
    # frames the browser sent (see liveness.py). The browser's own opinion is
    # never read: it has no field to send it in.
    #
    # This defeats a still photo and a replayed clip of the wrong sequence.
    # It does not defeat a determined attacker holding a phone that plays a
    # matching video, nor a rendered deepfake — passive texture and depth
    # analysis is a later phase.
    liveness_passed = models.BooleanField(default=False)
    liveness_score = models.FloatField(null=True, blank=True)
    liveness_reason = models.CharField(max_length=32, blank=True, default="")

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            HnswIndex(
                name="camera_kit_kyc_selfie_hnsw",
                fields=["selfie_embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self):
        return f"KYCVerification #{self.pk} ({self.status})"
