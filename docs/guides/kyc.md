# KYC & Identity Verification

## How it works

`KYCVerificationWidget` (`django_camera_kit.kyc.widgets.KYCVerificationWidget`) is a `forms.HiddenInput` subclass with no file-upload fallback — unlike the [scan widget](scan.md), allowing a raw upload here would defeat the whole point of the liveness challenge.

1. **ID capture** — the rear camera opens with a guide matching the real ISO/IEC 7810 ID-1 card ratio (85.6 × 53.98mm), a single shot, no auto-crop.
2. **Selfie + liveness challenge** — the front camera opens with a face-oval guide. Every frame runs through `cv.FaceDetectorYN` (YuNet). Once a face is reliably detected, the user is asked to turn their head slightly; the challenge completes when the detected face's horizontal center has moved far enough, at which point the current frame is captured automatically.
3. **Submit** — both images plus a `liveness_passed` flag are POSTed to your `verify_url` (a `fetch()` call with the CSRF token read from the `csrftoken` cookie).
4. **Server-side matching** — `KYCVerifyView` extracts a face embedding from each image (insightface, `buffalo_sc` model) and computes cosine similarity. **Matching only ever happens server-side** — the client never computes or asserts a match score.
5. **Result** — the response (`status`, `match_score`, `liveness_passed`, `created_at`) is used to populate the hidden field with the verification id on success.

## Why head movement, not blink

YuNet returns 5 point landmarks (eye/nose/mouth centers) — not full eyelid contours, so there's no way to compute a real eye-aspect-ratio blink signal from it. Tracking horizontal head movement is a substitute that doesn't depend on eye-region precision (or lighting/skin-tone-sensitive texture analysis) at all.

## Security model — what's real, what isn't yet

- **Identity binding**: every `KYCVerification` requires an authenticated user (`permission_classes = [IsAuthenticated]`) and is bound to `request.user`. This is enforced at the view regardless of your project's global DRF settings.
- **Rate limiting**: `KYCVerifyThrottle` limits requests per user (`THROTTLE_RATE`, default `10/hour`) — each request runs a full face-embedding inference pass, so an unthrottled endpoint is a cheap resource-exhaustion vector.
- **Upload size limits**: `MAX_UPLOAD_SIZE_MB` (default 8) rejects oversized uploads before they're processed.
- **`liveness_passed` is client-asserted, not server-verified.** A malicious client could send `liveness_passed=true` without ever performing the head-movement challenge. This is a known, documented MVP limitation — real server-side liveness verification (passive scoring from the images themselves, multiple challenge types) is planned but not yet built. Don't treat the current liveness flag as a strong anti-spoofing guarantee.
- **Storage**: the API response never includes URLs to the stored `selfie`/`id_document` images. Whether they're otherwise exposed depends entirely on your storage backend configuration — see [Installation](../getting-started/install.md#4-storage).

## Vector search beyond 1:1 matching

`selfie_embedding` and `id_face_embedding` are stored as `pgvector.django.VectorField` with an HNSW index (cosine distance), not just used transiently for the 1:1 comparison. This means a similarity search across *all* stored embeddings — e.g. `KYCVerification.objects.order_by(CosineDistance("selfie_embedding", target))` — can surface the same face reused across multiple accounts, which is the basis for network-level fraud detection beyond what a single verification's match score can tell you. Django Camera Kit stores the data to make this possible; building the actual fraud-detection query/workflow on top is left to your project for now.

## Settings

See [Settings reference](../reference/settings.md) for `EMBEDDING_MODEL`, `MATCH_THRESHOLD`, `THROTTLE_RATE`, and `MAX_UPLOAD_SIZE_MB`.
