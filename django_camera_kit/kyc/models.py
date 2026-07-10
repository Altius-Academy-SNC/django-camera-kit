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

    selfie = models.ImageField(upload_to="camera_kit/kyc/selfies/")
    id_document = models.ImageField(upload_to="camera_kit/kyc/id_documents/")

    selfie_embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS, null=True, blank=True)
    id_face_embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS, null=True, blank=True)
    match_score = models.FloatField(null=True, blank=True)

    # MVP liveness only: client-asserted result of the in-browser
    # head-movement challenge. Not a server-verified anti-spoofing signal —
    # a malicious client could send True without ever performing it. Real
    # server-side liveness verification is a later phase.
    liveness_passed = models.BooleanField(default=False)

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
