from django.urls import path

from .views import KYCVerifyView

app_name = "camera_kit_kyc"

urlpatterns = [
    path("verify/", KYCVerifyView.as_view(), name="verify"),
]
