"""Head-pose analysis for the liveness challenge.

Pure geometry on five facial landmarks: no OpenCV, no model, no Django. The
browser runs the same computation to guide the user, and the server runs it
again on the frames it receives — because a browser saying "the challenge
passed" proves nothing at all.

The convention, on the raw (never mirrored) camera image: yaw is the nose's
horizontal offset from the eye midpoint, in eye-distance units. It sits near
zero facing the camera and grows positive when the user turns their head to
their own left.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

#: Yaw past which a head counts as turned. Frontal faces measure well under
#: 0.1; a deliberate turn of about 25° reaches 0.25.
DEFAULT_YAW_THRESHOLD = 0.22

#: A face may sit this far from centre and still count as frontal.
FRONTAL_TOLERANCE_RATIO = 1.0

#: Total left-to-right spread, in threshold units, that scores a full 1.0.
#: The minimum passing spread is two thresholds, which scores 0.5: enough,
#: but visibly less convincing than a wide, deliberate turn.
FULL_TURN_SPREAD_RATIO = 4

#: Index of each landmark in the five-point sets both YuNet and InsightFace
#: return: two eyes, nose tip, two mouth corners. Which eye comes first does
#: not matter here — the midpoint is symmetric.
EYE_A_INDEX = 0
EYE_B_INDEX = 1
NOSE_INDEX = 2
LANDMARK_COUNT = 5

#: A landmark is an (x, y) pair.
POINT_LENGTH = 2


@dataclass(frozen=True)
class LivenessResult:
    """Outcome of the head-pose sequence.

    Attributes:
        passed: True when every required pose was held.
        score: 0..1, how far the turns went past the threshold.
        reason: Machine-readable cause when it did not pass.
    """

    passed: bool
    score: float
    reason: str


def yaw_from_points(eye_a: Sequence[float], eye_b: Sequence[float], nose: Sequence[float]) -> float:
    """Nose offset from the eye midpoint, in eye-distance units.

    Args:
        eye_a: ``(x, y)`` of one eye.
        eye_b: ``(x, y)`` of the other eye.
        nose: ``(x, y)`` of the nose tip.

    Returns:
        float: The yaw estimate, 0 when the eyes coincide.

    Raises:
        ValueError: If a point is not a pair of numbers.
    """
    for name, point in (("eye_a", eye_a), ("eye_b", eye_b), ("nose", nose)):
        if len(point) < POINT_LENGTH:
            raise ValueError(f"{name} must be an (x, y) pair, got {point!r}")
    spacing = math.dist((eye_a[0], eye_a[1]), (eye_b[0], eye_b[1]))
    if spacing <= 0:
        return 0.0
    return float((nose[0] - (eye_a[0] + eye_b[0]) / 2) / spacing)


def yaw_from_landmarks(landmarks: Sequence[Sequence[float]] | None) -> float:
    """Yaw from a five-point landmark set, as returned by the face models.

    Raises:
        ValueError: If fewer than :data:`LANDMARK_COUNT` points are given.
    """
    if landmarks is None or len(landmarks) < LANDMARK_COUNT:
        raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {landmarks!r}")
    return yaw_from_points(landmarks[EYE_A_INDEX], landmarks[EYE_B_INDEX], landmarks[NOSE_INDEX])


def verify_pose_sequence(
    frontal_yaw: float | None,
    left_yaw: float | None,
    right_yaw: float | None,
    threshold: float = DEFAULT_YAW_THRESHOLD,
) -> LivenessResult:
    """Check a frontal / turn-left / turn-right sequence.

    Args:
        frontal_yaw: Yaw of the frame captured facing the camera.
        left_yaw: Yaw of the frame captured turning to the user's left.
        right_yaw: Yaw of the frame captured turning to their right.
        threshold: Yaw past which a head counts as turned.

    Returns:
        LivenessResult: ``passed`` with a 0..1 score (0.5 at the minimum
        passing spread, 1.0 for a wide turn), or the failing reason
        among ``"missing_frames"``, ``"not_frontal"``, ``"no_left_turn"``,
        ``"no_right_turn"``.

    Raises:
        ValueError: If ``threshold`` is not strictly positive.
    """
    if threshold <= 0:
        raise ValueError(f"threshold must be positive, got {threshold!r}")
    if frontal_yaw is None or left_yaw is None or right_yaw is None:
        return LivenessResult(False, 0.0, "missing_frames")
    if abs(frontal_yaw) > threshold * FRONTAL_TOLERANCE_RATIO:
        return LivenessResult(False, 0.0, "not_frontal")
    if left_yaw < threshold:
        return LivenessResult(False, 0.0, "no_left_turn")
    if right_yaw > -threshold:
        return LivenessResult(False, 0.0, "no_right_turn")

    spread = left_yaw - right_yaw
    score = min(1.0, spread / (FULL_TURN_SPREAD_RATIO * threshold))
    return LivenessResult(True, score, "ok")
