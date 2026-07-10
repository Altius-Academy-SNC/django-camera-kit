import cv2
import numpy as np
from rest_framework.response import Response
from rest_framework.views import APIView

from . import conf
from .embeddings import compare_embeddings, extract_face_embedding
from .models import KYCVerification
from .serializers import KYCSubmissionSerializer, KYCVerificationSerializer


def _read_image_bgr(django_file):
    data = np.frombuffer(django_file.read(), dtype=np.uint8)
    django_file.seek(0)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


class KYCVerifyView(APIView):
    """Accepts a selfie and an ID document photo, extracts a face embedding
    from each server-side, and compares them. Matching only ever happens
    here — no client-supplied embedding or score is ever trusted.
    """

    def post(self, request):
        submission = KYCSubmissionSerializer(data=request.data)
        submission.is_valid(raise_exception=True)

        verification = KYCVerification.objects.create(
            selfie=submission.validated_data["selfie"],
            id_document=submission.validated_data["id_document"],
            liveness_passed=submission.validated_data["liveness_passed"],
        )

        selfie_embedding = extract_face_embedding(_read_image_bgr(verification.selfie))
        id_embedding = extract_face_embedding(_read_image_bgr(verification.id_document))

        if selfie_embedding is None or id_embedding is None:
            verification.status = KYCVerification.Status.REJECTED
            verification.save(update_fields=["status"])
            return Response(KYCVerificationSerializer(verification).data)

        score = compare_embeddings(selfie_embedding, id_embedding)
        verification.selfie_embedding = selfie_embedding
        verification.id_face_embedding = id_embedding
        verification.match_score = score
        verification.status = (
            KYCVerification.Status.VERIFIED
            if score >= conf.get_setting("MATCH_THRESHOLD") and verification.liveness_passed
            else KYCVerification.Status.REJECTED
        )
        verification.save()

        return Response(KYCVerificationSerializer(verification).data)
