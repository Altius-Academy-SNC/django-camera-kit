# Settings

The scan module has no settings — it's a static widget with no server-side configuration.

The KYC module reads everything from a single `DJANGO_CAMERA_KIT_KYC` dict in your Django settings. Any key you omit falls back to its default.

```python
# settings.py
DJANGO_CAMERA_KIT_KYC = {
    "EMBEDDING_MODEL": "buffalo_sc",
    "MATCH_THRESHOLD": 0.45,
    "THROTTLE_RATE": "10/hour",
    "MAX_UPLOAD_SIZE_MB": 8,
}
```

| Key | Default | Description |
|---|---|---|
| `EMBEDDING_MODEL` | `"buffalo_sc"` | insightface model pack used to extract face embeddings. Changing to a model with a different output dimension requires a migration (`EMBEDDING_DIMENSIONS` in `models.py` is currently hardcoded to 512, matching `buffalo_sc`'s `w600k_mbf` recognition model). |
| `MATCH_THRESHOLD` | `0.45` | Cosine similarity above which a selfie/ID pair counts as a match. This is a starting point, not a calibrated value — tune it against real data before relying on it in production. |
| `THROTTLE_RATE` | `"10/hour"` | Per-user rate limit on `KYCVerifyView`, in DRF throttle-rate syntax (`N/second`, `N/minute`, `N/hour`, `N/day`). |
| `MAX_UPLOAD_SIZE_MB` | `8` | Selfie/ID uploads larger than this are rejected with a 400 before any processing. |
