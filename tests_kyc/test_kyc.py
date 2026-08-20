"""End-to-end tests for the KYC endpoint.

These need PostgreSQL with pgvector and the insightface model pack, so they
are not part of the default suite:

    PGHOST=... pytest tests_kyc/

The head-pose geometry itself is unit-tested in ``tests/test_liveness.py``,
which needs neither. What is covered here is the wiring: authentication,
throttling, upload limits, and the fact that a submission carrying no
challenge frames is refused however well the faces match.
"""

import os
from pathlib import Path

import cv2
import insightface
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from django_camera_kit.kyc.models import KYCVerification

pytestmark = pytest.mark.django_db

INSIGHTFACE_IMAGES = Path(insightface.__file__).parent / "data" / "images"
PORTRAIT = "Tom_Hanks_54745.png"
GROUP = "t1.jpg"

#: Liveness is switched off where the test is about face matching, and left
#: on where the test is about liveness itself.
NO_LIVENESS = {"REQUIRE_LIVENESS": False}


def load_bytes(filename):
    return (INSIGHTFACE_IMAGES / filename).read_bytes()


def upload(name, payload, content_type="image/png"):
    return SimpleUploadedFile(name, payload, content_type=content_type)


def submission(selfie=None, id_document=None):
    photo = load_bytes(PORTRAIT)
    return {
        "selfie": upload("selfie.png", selfie or photo),
        "id_document": upload("id.png", id_document or photo),
    }


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(username="alice", password="x")


@pytest.fixture
def auth_client(client, user):
    client.force_login(user)
    return client


def test_unauthenticated_request_is_rejected(client):
    response = client.post("/kyc/verify/", submission())

    assert response.status_code == 403


def test_matching_faces_are_verified(auth_client, user, settings):
    settings.DJANGO_CAMERA_KIT_KYC = NO_LIVENESS

    response = auth_client.post("/kyc/verify/", submission())

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "verified"
    assert data["match_score"] > 0.9
    assert KYCVerification.objects.get(id=data["id"]).user_id == user.id


def test_mismatched_faces_are_rejected(auth_client, settings):
    settings.DJANGO_CAMERA_KIT_KYC = NO_LIVENESS
    group = cv2.imread(os.fspath(INSIGHTFACE_IMAGES / GROUP))
    ok, buffer = cv2.imencode(".jpg", group)
    assert ok

    response = auth_client.post(
        "/kyc/verify/",
        {
            "selfie": upload("selfie.png", load_bytes(PORTRAIT)),
            "id_document": upload("id.jpg", buffer.tobytes(), "image/jpeg"),
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["match_score"] < 0.45


def test_a_submission_without_challenge_frames_is_rejected(auth_client):
    """A perfect face match still fails: nothing proved a live person."""
    response = auth_client.post("/kyc/verify/", submission())

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["liveness_passed"] is False
    assert data["liveness_reason"] == "missing_frames"
    assert data["match_score"] > 0.9


def test_a_still_photo_replayed_as_every_frame_is_rejected(auth_client):
    """The three frames show the same pose, so no turn ever happened."""
    photo = load_bytes(PORTRAIT)
    payload = submission()
    payload["frame_left"] = upload("left.png", photo)
    payload["frame_right"] = upload("right.png", photo)

    response = auth_client.post("/kyc/verify/", payload)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["liveness_reason"] in ("no_left_turn", "no_right_turn", "not_frontal")


def test_a_client_cannot_claim_liveness(auth_client):
    """The old ``liveness_passed`` flag is not a field any more; it is ignored."""
    payload = submission()
    payload["liveness_passed"] = "true"

    response = auth_client.post("/kyc/verify/", payload)

    assert response.json()["liveness_passed"] is False


def test_oversized_upload_is_rejected(auth_client, settings):
    settings.DJANGO_CAMERA_KIT_KYC = {"MAX_UPLOAD_SIZE_MB": 0.001}  # ~1 KB cap

    response = auth_client.post("/kyc/verify/", submission())

    assert response.status_code == 400


def test_throttle_blocks_after_the_configured_rate(auth_client, settings):
    settings.DJANGO_CAMERA_KIT_KYC = {"THROTTLE_RATE": "1/hour"}

    first = auth_client.post("/kyc/verify/", submission())
    second = auth_client.post("/kyc/verify/", submission())

    assert first.status_code == 200
    assert second.status_code == 429
