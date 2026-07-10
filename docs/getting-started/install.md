# Installation

## Scan module

```bash
pip install django-camera-kit
```

Add to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    ...
    "django_camera_kit",
]
```

The scan widget needs two vendor JS files that aren't committed to the PyPI package (large, versioned build artifacts): `opencv.js` and `jspdf.umd.min.js`. Download pinned versions into `django_camera_kit/static/django_camera_kit/vendor/` — see [`vendor/README.md`](https://github.com/Altius-Academy-SNC/django-camera-kit/blob/main/django_camera_kit/static/django_camera_kit/vendor/README.md) in the repo for exact files and versions.

!!! note
    If you install from a source checkout of the repo instead of a released wheel, the vendor files are already committed and nothing extra is needed.

No models, no migrations, no `urls.py` changes — the scan module is entirely client-side widget + static assets.

## KYC module

```bash
pip install django-camera-kit[kyc]
```

This pulls in `djangorestframework`, `pgvector`, `psycopg`, `insightface`, `onnxruntime`, and `pillow`.

### 1. PostgreSQL with pgvector

The KYC module stores face embeddings in a `pgvector.django.VectorField` with an HNSW index — **PostgreSQL only**, no SQLite fallback. Install the [pgvector](https://github.com/pgvector/pgvector) extension on your database server. Example Dockerfile snippet if you build a custom Postgres image:

```dockerfile
FROM postgis/postgis:17-3.5

RUN apt-get update && apt-get install -y git build-essential postgresql-server-dev-17 \
    && cd /tmp && git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git \
    && cd pgvector && make clean && make OPTFLAGS="" && make install \
    && cd / && rm -rf /tmp/pgvector \
    && apt-get remove -y git build-essential postgresql-server-dev-17 && apt-get autoremove -y
```

### 2. INSTALLED_APPS and urls.py

```python
INSTALLED_APPS = [
    ...
    "rest_framework",
    "django_camera_kit",
    "django_camera_kit.kyc",
]
```

```python
# urls.py
urlpatterns = [
    ...
    path("kyc/", include("django_camera_kit.kyc.urls")),
]
```

### 3. Migrate

```bash
python manage.py migrate camera_kit_kyc
```

This also runs `CREATE EXTENSION IF NOT EXISTS vector` for you.

### 4. Storage

`KYCVerification.selfie` and `.id_document` store biometric and government-ID imagery. Point your storage backend at a private, access-controlled location — **never** a publicly readable `MEDIA_URL`. The API response never exposes these files' URLs, but the files themselves are only as private as your storage configuration makes them.

### 5. Authentication

`KYCVerifyView` requires an authenticated user (`IsAuthenticated`) regardless of your project's global DRF settings — every `KYCVerification` is bound to `request.user`. Make sure whatever page embeds `KYCVerificationWidget` is behind your normal login.
