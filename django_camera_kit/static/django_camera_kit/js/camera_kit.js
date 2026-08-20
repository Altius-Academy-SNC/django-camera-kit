/**
 * django-camera-kit — camera and computer-vision primitives.
 *
 * No DOM, no user-facing text, no state machine: this file exposes the
 * operations the scan and KYC widgets are built on. Everything runs in the
 * browser; nothing is uploaded to detect or flatten a document.
 */
(function (window) {
  "use strict";

  // Live detection never runs on the full frame: a 1080p canvas costs about
  // ten times a 480px one for the same edges. Callers downscale first and the
  // corners are scaled back afterwards.
  var CANNY_LOW = 50;
  var CANNY_HIGH = 150;
  var APPROX_EPSILON = 0.02;

  // A frame never holds more contours worth looking at than this; past it we
  // are scoring noise, and the loop must stay bounded.
  var MAX_CONTOURS = 300;

  // A quadrilateral covering less of the frame than this is background
  // furniture, not the document the user is aiming at.
  var MIN_COVERAGE = 0.12;

  // How far a candidate may be from the expected proportions, as a fraction
  // of the expected ratio. Perspective alone easily costs 10%.
  var DEFAULT_RATIO_TOLERANCE = 0.2;

  // Below this Laplacian variance the frame is too blurry to be worth
  // capturing. Used as a hint, never as a hard block: the threshold depends
  // on the scene, and refusing to capture is worse than a soft warning.
  var BLUR_LIMIT = 12;

  var resolvedCv = null;
  var cvReadyPromise = null;

  function openStream(constraints) {
    return navigator.mediaDevices.getUserMedia(
      constraints || {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }
    );
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (track) {
      track.stop();
    });
  }

  /**
   * opencv.js is an Emscripten module: window.cv is *not* guaranteed to be the
   * ready module. Depending on load timing it is a Promise resolving to the
   * module, a module whose WASM runtime is not up yet (no .Mat), or the ready
   * module. ready() settles that once and caches the real module.
   */
  function ready() {
    if (cvReadyPromise) return cvReadyPromise;
    cvReadyPromise = new Promise(function (resolve) {
      if (!window.cv) {
        resolve(false); // vendor/opencv.js not loaded, see vendor/README.md
        return;
      }
      if (typeof window.cv.then === "function") {
        window.cv.then(function (mod) {
          resolvedCv = mod;
          resolve(true);
        });
        return;
      }
      if (window.cv.Mat) {
        resolvedCv = window.cv;
        resolve(true);
        return;
      }
      window.cv["onRuntimeInitialized"] = function () {
        resolvedCv = window.cv;
        resolve(true);
      };
    });
    return cvReadyPromise;
  }

  /** Draw the current video frame into `canvas` (reused, never re-allocated). */
  function grabFrame(video, canvas) {
    var target = canvas || document.createElement("canvas");
    if (target.width !== video.videoWidth || target.height !== video.videoHeight) {
      target.width = video.videoWidth;
      target.height = video.videoHeight;
    }
    target.getContext("2d").drawImage(video, 0, 0, target.width, target.height);
    return target;
  }

  /** Copy `source` into `canvas` at `targetWidth`, keeping proportions. */
  function downscale(source, targetWidth, canvas) {
    var scale = Math.min(1, targetWidth / source.width);
    var target = canvas || document.createElement("canvas");
    var width = Math.max(1, Math.round(source.width * scale));
    var height = Math.max(1, Math.round(source.height * scale));
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    target.getContext("2d").drawImage(source, 0, 0, width, height);
    return target;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Order four points as top-left, top-right, bottom-right, bottom-left. */
  function orderCorners(points) {
    var bySum = points.slice().sort(function (a, b) {
      return a.x + a.y - (b.x + b.y);
    });
    var byDiff = points.slice().sort(function (a, b) {
      return a.y - a.x - (b.y - b.x);
    });
    var topLeft = bySum[0];
    var bottomRight = bySum[3];
    var topRight = byDiff[0] === topLeft ? byDiff[1] : byDiff[0];
    var bottomLeft = byDiff[3] === bottomRight ? byDiff[2] : byDiff[3];
    return [topLeft, topRight, bottomRight, bottomLeft];
  }

  /** Average side lengths of an ordered quadrilateral. */
  function quadSize(corners) {
    return {
      width: Math.max(distance(corners[0], corners[1]), distance(corners[3], corners[2])),
      height: Math.max(distance(corners[0], corners[3]), distance(corners[1], corners[2])),
    };
  }

  /** Shortest side over longest side, so orientation never matters. */
  function normalizedRatio(width, height) {
    if (width <= 0 || height <= 0) return 0;
    return width <= height ? width / height : height / width;
  }

  /** Shoelace area of an ordered quadrilateral. */
  function quadArea(corners) {
    var total = 0;
    for (var i = 0; i < 4; i++) {
      var current = corners[i];
      var next = corners[(i + 1) % 4];
      total += current.x * next.y - next.x * current.y;
    }
    return Math.abs(total) / 2;
  }

  /**
   * How well a measured ratio matches the expected one: 1 for a perfect
   * match, -1 when it is further off than `tolerance` allows. A falsy
   * `targetRatio` means "any proportions", which always scores 1.
   */
  function ratioScore(ratio, targetRatio, tolerance) {
    if (!targetRatio) return 1;
    var target = normalizedRatio(targetRatio, 1);
    var deviation = Math.abs(ratio - target) / target;
    return deviation > tolerance ? -1 : 1 - deviation;
  }

  /**
   * Rate a candidate quadrilateral, or return null when it is out of bounds.
   * `targetRatio` is a width/height ratio; 0 means "any proportions".
   */
  function scoreQuad(points, frameWidth, frameHeight, options) {
    var opts = options || {};
    var corners = orderCorners(points);
    var coverage = quadArea(corners) / (frameWidth * frameHeight);
    if (coverage < (opts.minCoverage || MIN_COVERAGE) || coverage > 1) return null;

    var size = quadSize(corners);
    var ratio = normalizedRatio(size.width, size.height);
    var quality = ratioScore(
      ratio,
      opts.targetRatio || 0,
      opts.ratioTolerance || DEFAULT_RATIO_TOLERANCE
    );
    if (quality < 0) return null;

    return {
      corners: corners,
      coverage: coverage,
      ratio: ratio,
      score: coverage * quality,
    };
  }

  function matToPoints(mat) {
    var points = [];
    for (var row = 0; row < 4; row++) {
      points.push({ x: mat.intAt(row, 0), y: mat.intAt(row, 1) });
    }
    return points;
  }

  function pickBestQuad(cv, contours, frameWidth, frameHeight, options) {
    var best = null;
    var total = Math.min(contours.size(), MAX_CONTOURS);

    for (var i = 0; i < total; i++) {
      var contour = contours.get(i);
      var approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, APPROX_EPSILON * cv.arcLength(contour, true), true);

      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        var candidate = scoreQuad(matToPoints(approx), frameWidth, frameHeight, options);
        if (candidate && (!best || candidate.score > best.score)) best = candidate;
      }
      approx.delete();
      contour.delete();
    }
    return best;
  }

  /**
   * Best document-shaped quadrilateral in `canvas`, in its pixel coordinates.
   * Returns null when OpenCV is not ready or nothing convincing was found, so
   * callers always keep a manual fallback.
   */
  function detectQuad(canvas, options) {
    var cv = resolvedCv;
    if (!cv || !cv.Mat) return null;

    var src = cv.imread(canvas);
    var gray = new cv.Mat();
    var blurred = new cv.Mat();
    var edges = new cv.Mat();
    var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edges, CANNY_LOW, CANNY_HIGH);
      cv.dilate(edges, edges, kernel);
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      return pickBestQuad(cv, contours, src.cols, src.rows, options);
    } finally {
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      kernel.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  /** Variance of the Laplacian: low means blurry. Returns 0 without OpenCV. */
  function sharpness(canvas) {
    var cv = resolvedCv;
    if (!cv || !cv.Mat) return 0;

    var src = cv.imread(canvas);
    var gray = new cv.Mat();
    var laplacian = new cv.Mat();
    var mean = new cv.Mat();
    var stddev = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.Laplacian(gray, laplacian, cv.CV_64F);
      cv.meanStdDev(laplacian, mean, stddev);
      var deviation = stddev.doubleAt(0, 0);
      return deviation * deviation;
    } finally {
      src.delete();
      gray.delete();
      laplacian.delete();
      mean.delete();
      stddev.delete();
    }
  }

  function scaleCorners(corners, factor) {
    return corners.map(function (corner) {
      return { x: corner.x * factor, y: corner.y * factor };
    });
  }

  /**
   * Output pixel size of a flattened page: the measured quadrilateral, forced
   * to `targetRatio` (width/height, portrait) when a format is imposed. The
   * longest measured side is kept, so a page never loses resolution.
   */
  function outputSize(corners, targetRatio) {
    var size = quadSize(corners);
    var width = Math.max(1, Math.round(size.width));
    var height = Math.max(1, Math.round(size.height));
    if (!targetRatio) return { width: width, height: height };

    var ratio = width >= height ? 1 / targetRatio : targetRatio;
    if (width >= height * ratio) {
      return { width: width, height: Math.max(1, Math.round(width / ratio)) };
    }
    return { width: Math.max(1, Math.round(height * ratio)), height: height };
  }

  /**
   * Crop and un-warp the quadrilateral out of `canvas` into a flat page. With
   * `targetRatio` set, the result carries exactly the format's proportions —
   * that is what makes two A4 scans come out the same size.
   */
  function warpQuad(canvas, corners, targetRatio) {
    var cv = resolvedCv;
    if (!cv || !cv.Mat) {
      throw new Error("django-camera-kit: opencv.js is not ready, see vendor/README.md");
    }
    var size = outputSize(corners, targetRatio || 0);
    var src = cv.imread(canvas);
    var dst = new cv.Mat();
    var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y,
    ]);
    var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      size.width, 0,
      size.width, size.height,
      0, size.height,
    ]);
    var transform = cv.getPerspectiveTransform(srcTri, dstTri);

    try {
      cv.warpPerspective(src, dst, transform, new cv.Size(size.width, size.height));
      var out = document.createElement("canvas");
      out.width = size.width;
      out.height = size.height;
      cv.imshow(out, dst);
      return out;
    } finally {
      src.delete();
      dst.delete();
      transform.delete();
      srcTri.delete();
      dstTri.delete();
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, type || "image/jpeg", quality || 0.92);
    });
  }

  window.CameraKit = {
    BLUR_LIMIT: BLUR_LIMIT,
    openStream: openStream,
    stopStream: stopStream,
    ready: ready,
    getCv: function () {
      return resolvedCv;
    },
    grabFrame: grabFrame,
    downscale: downscale,
    detectQuad: detectQuad,
    scoreQuad: scoreQuad,
    ratioScore: ratioScore,
    orderCorners: orderCorners,
    quadSize: quadSize,
    quadArea: quadArea,
    normalizedRatio: normalizedRatio,
    outputSize: outputSize,
    scaleCorners: scaleCorners,
    sharpness: sharpness,
    warpQuad: warpQuad,
    canvasToBlob: canvasToBlob,
    distance: distance,
  };
})(window);
