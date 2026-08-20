"""The head-pose challenge, checked on the geometry alone."""

import pytest

from django_camera_kit.kyc.liveness import (
    DEFAULT_YAW_THRESHOLD,
    verify_pose_sequence,
    yaw_from_landmarks,
    yaw_from_points,
)


def landmarks(nose_x):
    """Five landmarks: two eyes, the nose, two mouth corners."""
    return [(30, 50), (70, 50), (nose_x, 70), (35, 90), (65, 90)]


class TestYaw:
    def test_a_frontal_face_measures_zero(self):
        assert yaw_from_landmarks(landmarks(50)) == pytest.approx(0.0)

    def test_turning_to_the_user_left_is_positive(self):
        assert yaw_from_landmarks(landmarks(62)) > DEFAULT_YAW_THRESHOLD

    def test_turning_to_the_user_right_is_negative(self):
        assert yaw_from_landmarks(landmarks(38)) < -DEFAULT_YAW_THRESHOLD

    def test_the_measure_is_scale_invariant(self):
        near = yaw_from_points((30, 50), (70, 50), (62, 70))
        far = yaw_from_points((15, 25), (35, 25), (31, 35))
        assert near == pytest.approx(far)

    def test_coinciding_eyes_do_not_divide_by_zero(self):
        assert yaw_from_points((50, 50), (50, 50), (60, 70)) == 0.0

    def test_missing_landmarks_are_refused(self):
        with pytest.raises(ValueError, match="landmarks"):
            yaw_from_landmarks([(1, 2), (3, 4)])

    def test_a_point_must_be_a_pair(self):
        with pytest.raises(ValueError, match="nose"):
            yaw_from_points((30, 50), (70, 50), (60,))


class TestPoseSequence:
    def test_a_full_sequence_passes(self):
        result = verify_pose_sequence(0.0, 0.3, -0.3)
        assert result.passed
        assert 0.5 < result.score <= 1.0
        assert result.reason == "ok"

    def test_the_minimum_passing_spread_scores_half(self):
        threshold = DEFAULT_YAW_THRESHOLD
        result = verify_pose_sequence(0.0, threshold, -threshold)
        assert result.passed
        assert result.score == pytest.approx(0.5)

    def test_a_still_photo_fails(self):
        result = verify_pose_sequence(0.0, 0.0, 0.0)
        assert not result.passed
        assert result.reason == "no_left_turn"

    def test_a_missing_frame_fails(self):
        assert verify_pose_sequence(0.0, 0.3, None).reason == "missing_frames"

    def test_a_turned_reference_frame_fails(self):
        assert verify_pose_sequence(0.5, 0.6, -0.3).reason == "not_frontal"

    def test_turning_only_one_way_fails(self):
        assert verify_pose_sequence(0.0, 0.3, 0.1).reason == "no_right_turn"

    def test_a_small_turn_scores_lower_than_a_wide_one(self):
        small = verify_pose_sequence(0.0, 0.23, -0.23)
        wide = verify_pose_sequence(0.0, 0.5, -0.5)
        assert small.score < wide.score

    def test_the_threshold_must_be_positive(self):
        with pytest.raises(ValueError, match="threshold"):
            verify_pose_sequence(0.0, 0.3, -0.3, threshold=0)
