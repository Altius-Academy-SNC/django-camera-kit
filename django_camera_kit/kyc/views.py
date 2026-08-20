"""The KYC verification endpoint.

Everything that decides the outcome runs here: face embeddings, the identity
comparison, and the head-pose challenge. The browser only ever sends images.
"""

from __future__ import annotations

import logging

import cv2
import numpy as np
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import conf
from .embeddings import FaceReading, analyse_face, compare_embeddings
from .liveness import verify_pose_sequence
from .models import KYCVerification
from .serializers import KYCSubmissionSerializer, KYCVerificationSerializer
from .throttling import KYCVerifyThrottle

logger = logging.getLogger(__name__)


def read_image_bgr(uploaded_file):
    """Decode an uploaded image, or None when the bytes are not an image."""
    data = np.frombuffer(uploaded_file.read(), dtype=np.uint8)
    uploaded_file.seek(0)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def read_face(uploaded_file) -> FaceReading | None:
    """Analyse the face of an uploaded image, or None when there is none."""
    if uploaded_file is None:
        return None
    return analyse_face(read_image_bgr(uploaded_file))


def _same_person(reference: FaceReading, other: FaceReading | None) -> bool:
    """True when a challenge frame shows the same face as the selfie."""
    if other is None:
        return False
    return compare_embeddings(reference.embedding, other.embedding) >= conf.get_threshold(
        "SAME_PERSON_THRESHOLD"
    )


def check_liveness(selfie: FaceReading, data: dict):
    """Re-run the head-pose challenge on the frames the browser sent.

    Args:
        selfie: Reading of the frontal capture.
        data: Validated submission, holding the optional challenge frames.

    Returns:
        LivenessResult: passed/score/reason, with ``"wrong_person"`` when a
        challenge frame does not show the same face as the selfie.
    """
    if not conf.get_setting("REQUIRE_LIVENESS"):
        return verify_pose_sequence(0.0, 1.0, -1.0)

    left = read_face(data.get("frame_left"))
    right = read_face(data.get("frame_right"))
    result = verify_pose_sequence(
        selfie.yaw,
        left.yaw if left else None,
        right.yaw if right else None,
        threshold=conf.get_threshold("LIVENESS_YAW_THRESHOLD"),
    )
    if not result.passed:
        return result
    if not _same_person(selfie, left) or not _same_person(selfie, right):
        return result.__class__(False, 0.0, "wrong_person")
    return result


class KYCVerifyView(APIView):
    """Accept an ID photo, a selfie and the head-turn frames, and decide.

    Face matching and liveness only ever happen here — no client-supplied
    embedding, score or "challenge passed" flag is trusted, because any of
    them can be forged by a modified page.

    Authentication is required: a verification means nothing without knowing
    whose identity it claims to confirm. Each call runs several inference
    passes, so it is throttled too (:class:`KYCVerifyThrottle`).
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [KYCVerifyThrottle]

    def post(self, request: Request) -> Response:
        submission = KYCSubmissionSerializer(data=request.data)
        submission.is_valid(raise_exception=True)
        data = submission.validated_data

        verification = KYCVerification.objects.create(
            user=request.user,
            selfie=data["selfie"],
            id_document=data["id_document"],
        )
        selfie = read_face(verification.selfie)
        id_face = read_face(verification.id_document)
        if selfie is None or id_face is None:
            return self._reject(verification, "no_face")

        liveness = check_liveness(selfie, data)
        verification.liveness_passed = liveness.passed
        verification.liveness_score = liveness.score
        verification.liveness_reason = liveness.reason
        verification.selfie_embedding = selfie.embedding
        verification.id_face_embedding = id_face.embedding
        verification.match_score = compare_embeddings(selfie.embedding, id_face.embedding)
        verification.status = (
            KYCVerification.Status.VERIFIED
            if self._passes(verification)
            else KYCVerification.Status.REJECTED
        )
        verification.save()
        return Response(KYCVerificationSerializer(verification).data)

    def _passes(self, verification: KYCVerification) -> bool:
        """A verification needs both a face match and a live person."""
        matched = verification.match_score >= conf.get_threshold("MATCH_THRESHOLD")
        return bool(matched and verification.liveness_passed)

    def _reject(self, verification: KYCVerification, reason: str) -> Response:
        logger.info("KYC verification %s rejected: %s", verification.pk, reason)
        verification.status = KYCVerification.Status.REJECTED
        verification.liveness_reason = reason
        verification.save(update_fields=["status", "liveness_reason"])
        return Response(KYCVerificationSerializer(verification).data)
