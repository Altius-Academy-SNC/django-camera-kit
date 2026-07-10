import os

import cv2
import insightface
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

pytestmark = pytest.mark.django_db

INSIGHTFACE_IMAGES = os.path.join(os.path.dirname(insightface.__file__), "data", "images")


def _load_bytes(filename):
    with open(os.path.join(INSIGHTFACE_IMAGES, filename), "rb") as f:
        return f.read()


def test_matching_selfie_and_id_are_verified(client):
    photo = _load_bytes("Tom_Hanks_54745.png")

    response = client.post(
        "/kyc/verify/",
        {
            "selfie": SimpleUploadedFile("selfie.png", photo, content_type="image/png"),
            "id_document": SimpleUploadedFile("id.png", photo, content_type="image/png"),
            "liveness_passed": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "verified"
    assert data["match_score"] > 0.9


def test_mismatched_faces_are_rejected(client):
    selfie = _load_bytes("Tom_Hanks_54745.png")

    group_photo = cv2.imread(os.path.join(INSIGHTFACE_IMAGES, "t1.jpg"))
    ok, buf = cv2.imencode(".jpg", group_photo)
    assert ok
    other_face = buf.tobytes()

    response = client.post(
        "/kyc/verify/",
        {
            "selfie": SimpleUploadedFile("selfie.png", selfie, content_type="image/png"),
            "id_document": SimpleUploadedFile("id.jpg", other_face, content_type="image/jpeg"),
            "liveness_passed": "true",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["match_score"] < 0.45


def test_missing_liveness_rejects_even_a_perfect_match(client):
    photo = _load_bytes("Tom_Hanks_54745.png")

    response = client.post(
        "/kyc/verify/",
        {
            "selfie": SimpleUploadedFile("selfie.png", photo, content_type="image/png"),
            "id_document": SimpleUploadedFile("id.png", photo, content_type="image/png"),
            "liveness_passed": "false",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["match_score"] > 0.9
