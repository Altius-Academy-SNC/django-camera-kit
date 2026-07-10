from django.urls import include, path

urlpatterns = [
    path("kyc/", include("django_camera_kit.kyc.urls")),
]
