import os

import cv2
import insightface
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

pytestmark = pytest.mark.django_db

INSIGHTFACE_IMAGES = os.path.join(os.path.dirname(insightface.__file__), "data", "images")


def _load_bytes(filename):
    with open(os.path.join(INSIGHTFACE_IMAGES, filename), "rb") as f:
        return f.read()


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(username="alice", password="x")


@pytest.fixture
def auth_client(client, user):
    client.force_login(user)
    return client


def test_unauthenticated_request_is_rejected(client):
    photo = _load_bytes("Tom_Hanks_54745.png")

    response = client.post(
        "/kyc/verify/",
        {
            "selfie": SimpleUploadedFile("selfie.png", photo, content_type="image/png"),
            "id_document": SimpleUploadedFile("id.png", photo, content_type="image/png"),
            "liveness_passed": "true",
        },
    )

    assert response.status_code == 403


def test_matching_selfie_and_id_are_verified(auth_client, user):
    photo = _load_bytes("Tom_Hanks_54745.png")

    response = auth_client.post(
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

    from django_camera_kit.kyc.models import KYCVerification

    verification = KYCVerification.objects.get(id=data["id"])
    assert verification.user_id == user.id


def test_mismatched_faces_are_rejected(auth_client):
    selfie = _load_bytes("Tom_Hanks_54745.png")

    group_photo = cv2.imread(os.path.join(INSIGHTFACE_IMAGES, "t1.jpg"))
    ok, buf = cv2.imencode(".jpg", group_photo)
    assert ok
    other_face = buf.tobytes()

    response = auth_client.post(
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


def test_missing_liveness_rejects_even_a_perfect_match(auth_client):
    photo = _load_bytes("Tom_Hanks_54745.png")

    response = auth_client.post(
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


def test_oversized_upload_is_rejected(auth_client, settings):
    settings.DJANGO_CAMERA_KIT_KYC = {"MAX_UPLOAD_SIZE_MB": 0.001}  # ~1KB cap for this test
    photo = _load_bytes("Tom_Hanks_54745.png")

    response = auth_client.post(
        "/kyc/verify/",
        {
            "selfie": SimpleUploadedFile("selfie.png", photo, content_type="image/png"),
            "id_document": SimpleUploadedFile("id.png", photo, content_type="image/png"),
            "liveness_passed": "true",
        },
    )

    assert response.status_code == 400


def test_throttle_blocks_after_configured_rate(auth_client, settings):
    settings.DJANGO_CAMERA_KIT_KYC = {"THROTTLE_RATE": "1/hour"}
    photo = _load_bytes("Tom_Hanks_54745.png")

    def submit():
        return auth_client.post(
            "/kyc/verify/",
            {
                "selfie": SimpleUploadedFile("selfie.png", photo, content_type="image/png"),
                "id_document": SimpleUploadedFile("id.png", photo, content_type="image/png"),
                "liveness_passed": "true",
            },
        )

    first = submit()
    second = submit()

    assert first.status_code == 200
    assert second.status_code == 429
