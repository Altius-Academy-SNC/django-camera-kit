/**
 * django-camera-kit — face detection primitives for the KYC flow.
 *
 * Reuses the opencv.js instance already loaded by CameraKit (camera_kit.js
 * must run first) rather than vendoring a second CV stack.
 *
 * Detection uses YuNet (cv.FaceDetectorYN), a small CNN trained on WIDER
 * FACE — deliberately not a Haar cascade. Haar cascades detect faces from
 * brightness-contrast patterns and are well documented to miss far more
 * often on darker skin tones and low-contrast lighting (Buolamwini & Gebru,
 * "Gender Shades", 2018). YuNet does not carry that bias.
 */
(function (window, document) {
  "use strict";

  // Locate vendor/ relative to this script's own URL, so it works under any
  // STATIC_URL prefix instead of a hardcoded path.
  var scriptUrl = document.currentScript && document.currentScript.src;
  var vendorBase = scriptUrl ? scriptUrl.replace(/js\/face_kit\.js.*$/, "vendor/") : "";
  var MODEL_FILE = "face_detection_yunet_2023mar.onnx";

  // YuNet emits one row per face: x, y, w, h, then five landmarks as (x, y)
  // pairs — right eye, left eye, nose tip, right mouth corner, left mouth
  // corner — then the confidence score.
  var LANDMARK_NAMES = ["rightEye", "leftEye", "nose", "rightMouth", "leftMouth"];
  var LANDMARK_OFFSET = 4;
  var SCORE_INDEX = 14;

  // Detection score below which a "face" is noise.
  var SCORE_THRESHOLD = 0.8;
  var NMS_THRESHOLD = 0.3;
  var TOP_K = 5000;

  // A frame never holds more faces worth ranking than this; the loop has to
  // stay bounded even if the detector goes wild on a crowd or a poster.
  var MAX_FACES = 32;

  // Nose offset from the eye midpoint, in eye-distance units, past which the
  // head counts as turned. Measured on frontal faces it sits near 0.
  var YAW_TURNED = 0.22;

  // Positive yaw means the nose moved toward the right of the raw camera
  // image, which is what happens when the user turns their head to their own
  // left. The preview may be mirrored for comfort; the analysis never is.
  var YAW_USER_LEFT = 1;
  var YAW_USER_RIGHT = -1;

  // Face width relative to the guide width: outside this band the user is too
  // far to be usable, or so close the frame crops their face.
  var MIN_FACE_FILL = 0.45;
  var MAX_FACE_FILL = 1.15;

  // How far the face centre may sit from the guide centre, as a fraction of
  // the guide size, before the user is asked to re-centre.
  var CENTER_TOLERANCE = 0.18;

  var detector = null;
  var readyPromise = null;

  function loadModelFile(cv) {
    return fetch(vendorBase + MODEL_FILE)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("django-camera-kit: cannot load " + MODEL_FILE + " (" + response.status + ")");
        }
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        cv.FS_createDataFile("/", MODEL_FILE, new Uint8Array(buffer), true, false, false);
      });
  }

  function ready() {
    if (readyPromise) return readyPromise;

    readyPromise = window.CameraKit.ready().then(function (cvIsReady) {
      if (!cvIsReady) return false;
      var cv = window.CameraKit.getCv();
      if (!cv.FaceDetectorYN) return false;

      return loadModelFile(cv).then(function () {
        // This embind binding exposes the C++ static FaceDetectorYN::create()
        // factory as a plain constructor, not as a .create() static method.
        detector = new cv.FaceDetectorYN(
          MODEL_FILE,
          "",
          new cv.Size(320, 320),
          SCORE_THRESHOLD,
          NMS_THRESHOLD,
          TOP_K,
          0,
          0
        );
        return true;
      });
    });

    return readyPromise;
  }

  function bestRow(faces) {
    var bestIndex = 0;
    var bestArea = 0;
    var total = Math.min(faces.rows, MAX_FACES);
    for (var row = 0; row < total; row++) {
      var area = faces.floatAt(row, 2) * faces.floatAt(row, 3);
      if (area > bestArea) {
        bestArea = area;
        bestIndex = row;
      }
    }
    return bestIndex;
  }

  function readFace(faces, row) {
    var x = faces.floatAt(row, 0);
    var y = faces.floatAt(row, 1);
    var width = faces.floatAt(row, 2);
    var height = faces.floatAt(row, 3);
    var landmarks = {};

    LANDMARK_NAMES.forEach(function (name, index) {
      landmarks[name] = {
        x: faces.floatAt(row, LANDMARK_OFFSET + index * 2),
        y: faces.floatAt(row, LANDMARK_OFFSET + index * 2 + 1),
      };
    });

    return {
      x: x,
      y: y,
      width: width,
      height: height,
      centerX: x + width / 2,
      centerY: y + height / 2,
      score: faces.floatAt(row, SCORE_INDEX),
      landmarks: landmarks,
    };
  }

  /** Largest detected face in canvas pixel coordinates, or null. */
  function detectFace(canvas) {
    var cv = window.CameraKit.getCv();
    if (!cv || !detector) return null;

    detector.setInputSize(new cv.Size(canvas.width, canvas.height));
    var src = cv.imread(canvas);
    var bgr = new cv.Mat();
    var faces = new cv.Mat();

    try {
      cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
      detector.detect(bgr, faces);
      if (faces.rows === 0) return null;
      return readFace(faces, bestRow(faces));
    } finally {
      src.delete();
      bgr.delete();
      faces.delete();
    }
  }

  /**
   * Horizontal head rotation, as the nose offset from the eye midpoint in
   * eye-distance units. Near 0 facing the camera, positive when the user
   * turns to their own left. Returns 0 when the landmarks are unusable.
   */
  function estimateYaw(face) {
    if (!face || !face.landmarks) return 0;
    var left = face.landmarks.leftEye;
    var right = face.landmarks.rightEye;
    var nose = face.landmarks.nose;
    var eyeDistance = Math.hypot(left.x - right.x, left.y - right.y);
    if (eyeDistance <= 0) return 0;
    return (nose.x - (left.x + right.x) / 2) / eyeDistance;
  }

  /** Head tilt in degrees, from the line between the eyes. */
  function estimateRoll(face) {
    if (!face || !face.landmarks) return 0;
    var left = face.landmarks.leftEye;
    var right = face.landmarks.rightEye;
    return (Math.atan2(left.y - right.y, left.x - right.x) * 180) / Math.PI;
  }

  /**
   * Compare a detected face to the guide box.
   * Returns {ok, reason} where reason is "none", "small", "large" or "offset".
   */
  function framing(face, guide) {
    if (!face) return { ok: false, reason: "none" };

    var fill = face.width / guide.width;
    if (fill < MIN_FACE_FILL) return { ok: false, reason: "small" };
    if (fill > MAX_FACE_FILL) return { ok: false, reason: "large" };

    var guideCenterX = guide.x + guide.width / 2;
    var guideCenterY = guide.y + guide.height / 2;
    var offX = Math.abs(face.centerX - guideCenterX) / guide.width;
    var offY = Math.abs(face.centerY - guideCenterY) / guide.height;
    if (offX > CENTER_TOLERANCE || offY > CENTER_TOLERANCE) {
      return { ok: false, reason: "offset" };
    }
    return { ok: true, reason: "ok" };
  }

  /** True when the head is turned far enough in `direction` (+1 user left). */
  function isTurned(face, direction) {
    var yaw = estimateYaw(face);
    return direction > 0 ? yaw >= YAW_TURNED : yaw <= -YAW_TURNED;
  }

  /** True when the head faces the camera. */
  function isFrontal(face) {
    return Math.abs(estimateYaw(face)) < YAW_TURNED / 2;
  }

  window.FaceKit = {
    YAW_TURNED: YAW_TURNED,
    YAW_USER_LEFT: YAW_USER_LEFT,
    YAW_USER_RIGHT: YAW_USER_RIGHT,
    ready: ready,
    detectFace: detectFace,
    estimateYaw: estimateYaw,
    estimateRoll: estimateRoll,
    framing: framing,
    isTurned: isTurned,
    isFrontal: isFrontal,
  };
})(window, document);
