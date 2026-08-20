# KYC & identity verification

## How it works

`KYCVerificationWidget` is a `forms.HiddenInput` subclass with no file-upload
fallback — unlike the [scan widget](scan.md), accepting a picture here would
defeat the whole point of the challenge.

1. **ID capture** — the rear camera opens with a guide at the real ISO/IEC 7810
   ID-1 ratio (85.6 × 53.98 mm). The card's edges are detected and the shot is
   flattened, falling back to the raw frame when they are not found.
2. **Face framing** — the front camera opens behind an oval guide. Every frame
   runs through `cv.FaceDetectorYN` (YuNet). The user is told what to fix —
   *move closer*, *move back*, *centre your face* — and the oval turns green
   once the face sits inside it at a usable size.
3. **Head-pose challenge** — three poses in a row: look at the camera, turn
   left, turn right. The two turns are shuffled, so a replayed recording
   cannot match a fixed order. Each pose must hold for four consecutive frames,
   and the frame is captured automatically when it does.
4. **Submit** — the ID, the frontal capture and the two turn captures are
   POSTed to `verify_url`, with the CSRF token read from the `csrftoken`
   cookie.
5. **Server-side decision** — `KYCVerifyView` extracts a face embedding from
   each image (insightface, `buffalo_sc`), compares the selfie to the ID, and
   **re-runs the head-pose analysis on the frames it received**.
6. **Result** — the response (`status`, `match_score`, `liveness_passed`,
   `liveness_score`, `liveness_reason`) fills the hidden field with the
   verification id on success, and fires a `camerakit:kyc-result` event.

## Liveness is verified on the server

In 0.1 the browser sent a `liveness_passed` flag and the server believed it —
which meant any modified page could claim to have passed. That flag is gone:
the submission has no field to carry it.

What the server does instead, in `django_camera_kit.kyc.liveness`: for each
frame it measures the **yaw** — the nose's horizontal offset from the eye
midpoint, in eye-distance units. It is near zero facing the camera and grows
as the head turns. The sequence passes only when the reference frame is
frontal, one frame turned past the threshold one way, the other past it the
other way, *and* all three frames carry the same face (embedding similarity
above `SAME_PERSON_THRESHOLD`).

The measure is scale-invariant and depends on no lighting or skin-tone
assumption: it is a ratio of two distances between landmarks.

```python
from django_camera_kit.kyc.liveness import verify_pose_sequence

verify_pose_sequence(frontal_yaw=0.02, left_yaw=0.31, right_yaw=-0.28)
# LivenessResult(passed=True, score=0.67, reason='ok')
```

`liveness_reason` records why an attempt failed: `missing_frames`,
`not_frontal`, `no_left_turn`, `no_right_turn`, `wrong_person`, `no_face`.

## Why head pose, not a blink

YuNet returns five landmarks — eye, nose and mouth centres — not eyelid
contours, so a real eye-aspect-ratio blink signal cannot be computed from it.
Head pose uses exactly the landmarks the detector does give, and it is
verifiable from a still image on the server, which a blink is not.

## What this defeats, and what it does not

**Defeated**: a still photo of someone; a screenshot; a recorded clip that
does not perform the requested sequence; a client that simply claims success;
challenge frames showing a different person from the selfie.

**Not defeated**: a determined attacker playing a matching video on a screen
in front of the camera, or a rendered deepfake that follows the instructions.
Passive anti-spoofing — screen-reflection, texture and depth analysis — is a
later phase. Size the risk you are covering accordingly.

## Why not Haar cascades

The detector is YuNet, not the Haar cascade most tutorials reach for. Haar
cascades detect faces from brightness-contrast patterns and are well
documented to miss far more often on darker skin tones and in low-contrast
lighting — a bias traced to the composition of their historical training sets
(Buolamwini & Gebru, ["Gender Shades"](https://proceedings.mlr.press/v81/buolamwini18a.html),
2018). YuNet is a small CNN trained on
[WIDER FACE](http://shuoyang1213.me/WIDERFACE/) and does not carry that
failure mode. This is not a detail: a KYC flow that cannot see its users is
not a KYC flow.

## Security model

- **Identity binding** — every `KYCVerification` requires an authenticated
  user (`permission_classes = [IsAuthenticated]`) and is bound to
  `request.user`, whatever the project's global DRF settings say.
- **Nothing from the client is trusted** — no embedding, no score, no flag.
  The browser sends images; the server decides.
- **Rate limiting** — `KYCVerifyThrottle` caps requests per user
  (`THROTTLE_RATE`, default `10/hour`). Each call runs several inference
  passes, so an unthrottled endpoint is a cheap exhaustion vector.
- **Upload limits** — `MAX_UPLOAD_SIZE_MB` (default 8) rejects oversized
  uploads before anything is processed.
- **Storage** — the API response never exposes URLs to the stored images. The
  challenge frames are analysed in memory and never stored at all. Point your
  storage backend at a private location for `selfie` and `id_document`: they
  are biometric and government-ID imagery.

## Vector search beyond 1:1

`selfie_embedding` and `id_face_embedding` are stored as
`pgvector.django.VectorField` with an HNSW cosine index, not just used for the
one comparison. A similarity search across all stored embeddings — e.g.
`KYCVerification.objects.order_by(CosineDistance("selfie_embedding", target))`
— surfaces the same face reused across accounts, which is where
network-level fraud shows up. The package stores what makes that possible;
the query and the workflow on top belong to your project.

## Settings

See the [settings reference](../reference/settings.md) for `MATCH_THRESHOLD`,
`SAME_PERSON_THRESHOLD`, `LIVENESS_YAW_THRESHOLD`, `REQUIRE_LIVENESS`,
`THROTTLE_RATE` and `MAX_UPLOAD_SIZE_MB`.
