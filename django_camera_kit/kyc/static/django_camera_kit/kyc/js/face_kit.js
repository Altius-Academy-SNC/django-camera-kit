(function (window, document) {
  "use strict";

  // Locate vendor/ relative to this script's own URL so it works under any
  // STATIC_URL prefix, instead of hardcoding a path.
  var scriptUrl = document.currentScript && document.currentScript.src;
  var vendorBase = scriptUrl ? scriptUrl.replace(/js\/face_kit\.js.*$/, "vendor/") : "";
  var MODEL_FILE = "face_detection_yunet_2023mar.onnx";

  var detector = null;
  var readyPromise = null;

  function loadModelFile(cv) {
    return fetch(vendorBase + MODEL_FILE)
      .then(function (r) {
        return r.arrayBuffer();
      })
      .then(function (buf) {
        cv.FS_createDataFile("/", MODEL_FILE, new Uint8Array(buf), true, false, false);
      });
  }

  // Reuses the opencv.js instance already loaded by CameraKit (camera_kit.js
  // must run before this file) instead of vendoring a second CV stack.
  //
  // Uses YuNet (cv.FaceDetectorYN), a small CNN trained on WIDER FACE —
  // deliberately not a Haar cascade. Haar cascades detect faces from
  // brightness-contrast patterns and are well documented to have far
  // higher miss rates on darker skin tones and low-contrast lighting
  // (see e.g. Buolamwini & Gebru, "Gender Shades", 2018). YuNet doesn't
  // carry that specific bias.
  function ready() {
    if (readyPromise) return readyPromise;

    readyPromise = window.CameraKit.ready().then(function (cvIsReady) {
      if (!cvIsReady) return false;
      var cv = window.CameraKit.getCv();
      if (!cv.FaceDetectorYN) return false;

      return loadModelFile(cv).then(function () {
        // This embind binding exposes the C++ static FaceDetectorYN::create()
        // factory as a plain constructor, not a .create() static method.
        detector = new cv.FaceDetectorYN(
          MODEL_FILE,
          "",
          new cv.Size(320, 320),
          0.8,
          0.3,
          5000,
          0,
          0
        );
        return true;
      });
    });

    return readyPromise;
  }

  // Largest detected face as {x, y, width, height, centerX, centerY, score}
  // in canvas pixel coordinates, or null if none found.
  function detectFace(canvas) {
    var cv = window.CameraKit.getCv();
    if (!cv || !detector) return null;

    detector.setInputSize(new cv.Size(canvas.width, canvas.height));

    var src = cv.imread(canvas);
    var bgr = new cv.Mat();
    var faces = new cv.Mat();
    var result = null;

    try {
      cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
      detector.detect(bgr, faces);

      if (faces.rows > 0) {
        var bestRow = 0;
        var bestArea = 0;
        for (var i = 0; i < faces.rows; i++) {
          var area = faces.floatAt(i, 2) * faces.floatAt(i, 3);
          if (area > bestArea) {
            bestArea = area;
            bestRow = i;
          }
        }

        var x = faces.floatAt(bestRow, 0);
        var y = faces.floatAt(bestRow, 1);
        var width = faces.floatAt(bestRow, 2);
        var height = faces.floatAt(bestRow, 3);

        result = {
          x: x,
          y: y,
          width: width,
          height: height,
          centerX: x + width / 2,
          centerY: y + height / 2,
          score: faces.floatAt(bestRow, 14),
        };
      }
    } finally {
      src.delete();
      bgr.delete();
      faces.delete();
    }

    return result;
  }

  window.FaceKit = {
    ready: ready,
    detectFace: detectFace,
  };
})(window, document);
