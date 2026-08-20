# API reference

## Scanning

::: django_camera_kit.widgets.DocumentScannerWidget

::: django_camera_kit.widgets.scanner_labels

::: django_camera_kit.formats

    options:
      members:
        - DocumentFormat
        - get_format
        - iter_formats
        - custom_format

::: django_camera_kit.conf

    options:
      members:
        - get_setting
        - get_extra_formats

## KYC

::: django_camera_kit.kyc.widgets.KYCVerificationWidget

::: django_camera_kit.kyc.models.KYCVerification

::: django_camera_kit.kyc.views.KYCVerifyView

::: django_camera_kit.kyc.liveness

    options:
      members:
        - LivenessResult
        - yaw_from_points
        - yaw_from_landmarks
        - verify_pose_sequence

::: django_camera_kit.kyc.embeddings

    options:
      members:
        - FaceReading
        - analyse_face
        - compare_embeddings

::: django_camera_kit.kyc.throttling.KYCVerifyThrottle

## Exceptions

::: django_camera_kit.exceptions
