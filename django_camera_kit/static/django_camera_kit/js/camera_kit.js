(function (window) {
  "use strict";

  function openStream(constraints) {
    constraints = constraints || {
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (track) {
      track.stop();
    });
  }

  function captureFrame(video) {
    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // Largest 4-point contour in the given canvas, in canvas pixel coordinates.
  // Returns null if OpenCV isn't ready yet or nothing convincing was found,
  // so callers always have a manual-adjustment fallback.
  function detectDocumentCorners(canvas) {
    if (!window.cv || !window.cv.Mat) return null;

    var cv = window.cv;
    var src = cv.imread(canvas);
    var gray = new cv.Mat();
    var blurred = new cv.Mat();
    var edged = new cv.Mat();
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    var corners = null;

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edged, 75, 200);
      cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      var bestArea = 0;
      var bestApprox = null;
      var minArea = src.rows * src.cols * 0.2;

      for (var i = 0; i < contours.size(); i++) {
        var contour = contours.get(i);
        var peri = cv.arcLength(contour, true);
        var approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        if (approx.rows === 4) {
          var area = cv.contourArea(approx);
          if (area > bestArea && area > minArea) {
            bestArea = area;
            if (bestApprox) bestApprox.delete();
            bestApprox = approx;
          } else {
            approx.delete();
          }
        } else {
          approx.delete();
        }
        contour.delete();
      }

      if (bestApprox) {
        corners = [];
        for (var p = 0; p < 4; p++) {
          corners.push({ x: bestApprox.intAt(p, 0), y: bestApprox.intAt(p, 1) });
        }
        bestApprox.delete();
      }
    } finally {
      src.delete();
      gray.delete();
      blurred.delete();
      edged.delete();
      contours.delete();
      hierarchy.delete();
    }

    return corners ? sortCornersClockwise(corners) : null;
  }

  function sortCornersClockwise(corners) {
    var center = corners.reduce(
      function (acc, c) {
        return { x: acc.x + c.x / 4, y: acc.y + c.y / 4 };
      },
      { x: 0, y: 0 }
    );
    return corners.slice().sort(function (a, b) {
      return (
        Math.atan2(a.y - center.y, a.x - center.x) -
        Math.atan2(b.y - center.y, b.x - center.x)
      );
    });
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Crops and un-warps the quadrilateral defined by `corners` (clockwise,
  // starting top-left) out of `canvas` into a flat rectangular document image.
  function warpToDocument(canvas, corners) {
    var cv = window.cv;
    var src = cv.imread(canvas);

    var widthTop = distance(corners[0], corners[1]);
    var widthBottom = distance(corners[3], corners[2]);
    var heightLeft = distance(corners[0], corners[3]);
    var heightRight = distance(corners[1], corners[2]);

    var outWidth = Math.round(Math.max(widthTop, widthBottom));
    var outHeight = Math.round(Math.max(heightLeft, heightRight));

    var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y,
    ]);
    var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outWidth, 0,
      outWidth, outHeight,
      0, outHeight,
    ]);

    var transform = cv.getPerspectiveTransform(srcTri, dstTri);
    var dst = new cv.Mat();
    cv.warpPerspective(src, dst, transform, new cv.Size(outWidth, outHeight));

    var outCanvas = document.createElement("canvas");
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    cv.imshow(outCanvas, dst);

    src.delete();
    dst.delete();
    transform.delete();
    srcTri.delete();
    dstTri.delete();

    return outCanvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, type || "image/jpeg", quality || 0.92);
    });
  }

  window.CameraKit = {
    openStream: openStream,
    stopStream: stopStream,
    captureFrame: captureFrame,
    detectDocumentCorners: detectDocumentCorners,
    warpToDocument: warpToDocument,
    canvasToBlob: canvasToBlob,
  };
})(window);
