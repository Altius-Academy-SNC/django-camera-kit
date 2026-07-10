from rest_framework.throttling import UserRateThrottle

from . import conf


class KYCVerifyThrottle(UserRateThrottle):
    """Rate-limits KYCVerifyView per authenticated user.

    Each request runs a full face-embedding inference pass — without a
    limit, the endpoint is a cheap resource-exhaustion and brute-force
    probing vector. Reads from DJANGO_CAMERA_KIT_KYC.THROTTLE_RATE
    (see conf.py) instead of DRF's global DEFAULT_THROTTLE_RATES, so this
    reusable app doesn't require the consuming project to configure DRF
    throttle scopes globally.
    """

    scope = "camera_kit_kyc_verify"

    def get_rate(self):
        return conf.get_setting("THROTTLE_RATE")
