import os

SECRET_KEY = "test-secret-key-for-django-camera-kit-kyc"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("PGDATABASE", "camera_kit_test"),
        "USER": os.environ.get("PGUSER", "camera_kit"),
        "PASSWORD": os.environ.get("PGPASSWORD", "camera_kit_test_pw"),
        "HOST": os.environ.get("PGHOST", "127.0.0.1"),
        "PORT": os.environ.get("PGPORT", "55499"),
    }
}

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_camera_kit",
    "django_camera_kit.kyc",
]

MIDDLEWARE = [
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

STATIC_URL = "/static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = "/tmp/camera_kit_kyc_media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

ROOT_URLCONF = "tests_kyc.urls"

USE_TZ = True
