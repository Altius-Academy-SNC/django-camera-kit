import numpy as np

from . import conf

_face_app = None


def _get_face_app():
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis

        _face_app = FaceAnalysis(
            name=conf.get_setting("EMBEDDING_MODEL"),
            providers=["CPUExecutionProvider"],
        )
        _face_app.prepare(ctx_id=-1, det_size=(320, 320))
    return _face_app


def extract_face_embedding(image_bgr):
    """Return the normalized embedding of the largest face in the image,
    or None if no face was detected — also if `image_bgr` is None, which
    is what cv2.imdecode() returns for corrupt/malformed image data that
    nonetheless passed DRF's ImageField validation."""
    if image_bgr is None:
        return None
    faces = _get_face_app().get(image_bgr)
    if not faces:
        return None
    largest = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return largest.normed_embedding


def compare_embeddings(embedding_a, embedding_b):
    """Cosine similarity between two normalized embeddings, in [-1, 1]."""
    return float(np.dot(embedding_a, embedding_b))
