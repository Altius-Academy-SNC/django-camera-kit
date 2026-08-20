"""Face embeddings and head pose, extracted server-side.

The model pack is loaded once per process, on first use: it weighs tens of
megabytes and downloads itself into ``~/.insightface`` the very first time.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from . import conf
from .liveness import yaw_from_landmarks


@dataclass(frozen=True)
class FaceReading:
    """What one image tells us about the face it holds.

    Attributes:
        embedding: L2-normalised identity vector.
        yaw: Head rotation, see :mod:`django_camera_kit.kyc.liveness`.
    """

    embedding: np.ndarray
    yaw: float


@lru_cache(maxsize=1)
def get_face_app():
    """Return the shared InsightFace application, loading it on first use."""
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(
        name=conf.get_setting("EMBEDDING_MODEL"),
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(320, 320))
    return app


def _face_area(face) -> float:
    return float((face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1]))


def analyse_face(image_bgr) -> FaceReading | None:
    """Read the largest face of an image, or None when there is none.

    ``image_bgr`` is None for corrupt image data that still passed the
    upload validation — ``cv2.imdecode`` returns None in that case — so that
    is treated as "no face" rather than crashing.
    """
    if image_bgr is None:
        return None
    faces = get_face_app().get(image_bgr)
    if not faces:
        return None
    largest = max(faces, key=_face_area)
    landmarks = getattr(largest, "kps", None)
    yaw = yaw_from_landmarks(landmarks) if landmarks is not None else 0.0
    return FaceReading(largest.normed_embedding, yaw)


def extract_face_embedding(image_bgr):
    """Return the normalised embedding of the largest face, or None."""
    reading = analyse_face(image_bgr)
    return None if reading is None else reading.embedding


def compare_embeddings(embedding_a, embedding_b) -> float:
    """Cosine similarity between two normalised embeddings, in [-1, 1]."""
    return float(np.dot(embedding_a, embedding_b))
