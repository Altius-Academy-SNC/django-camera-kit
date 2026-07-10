(function (window, document) {
  "use strict";

  function init() {
    document.querySelectorAll(".camera-kit-scanner").forEach(function (container) {
      if (container.dataset.camerakitBound) return;
      container.dataset.camerakitBound = "true";
      bindScanner(container);
    });
  }

  function bindScanner(container) {
    var input = container.querySelector("input[type=file]");
    var trigger = container.querySelector(".camera-kit-trigger");
    if (!input || !trigger) return;

    trigger.addEventListener("click", function () {
      openScanner(container, input);
    });
  }

  function openScanner(container, input) {
    var session = {
      pages: [], // warped page canvases, in order
      stream: null,
      frame: null,
      corners: null,
      lastCorners: null,
      mode: "live", // "live" | "adjust" | "pages" | "closed"
    };

    var overlay = buildOverlay();
    document.body.appendChild(overlay.root);

    CameraKit.ready().then(function (isReady) {
      if (!isReady) {
        overlay.status.textContent =
          "opencv.js n'est pas chargé (voir vendor/README.md) : le scan ne fonctionnera pas.";
      }
    });

    CameraKit.openStream()
      .then(function (stream) {
        session.stream = stream;
        overlay.video.srcObject = stream;
        return overlay.video.play();
      })
      .then(function () {
        trackLiveContour(session, overlay);
      })
      .catch(function (err) {
        overlay.status.textContent = "Impossible d'accéder à la caméra : " + err.message;
      });

    overlay.captureBtn.addEventListener("click", function () {
      capturePage(session, overlay);
    });

    overlay.retakeBtn.addEventListener("click", function () {
      enterLiveMode(session, overlay);
    });

    overlay.confirmPageBtn.addEventListener("click", function () {
      confirmPage(session, overlay);
    });

    overlay.addPageBtn.addEventListener("click", function () {
      enterLiveMode(session, overlay);
    });

    overlay.finishBtn.addEventListener("click", function () {
      finishScan(session, input, container);
      closeOverlay(session, overlay);
    });

    overlay.cancelBtn.addEventListener("click", function () {
      closeOverlay(session, overlay);
    });
  }

  function trackLiveContour(session, overlay) {
    if (session.mode !== "live" || !session.stream) return;

    var video = overlay.video;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      var frame = CameraKit.captureFrame(video);
      session.lastCorners = CameraKit.detectDocumentCorners(frame);
      drawOverlayQuad(overlay, video, session.lastCorners);
    }

    window.requestAnimationFrame(function () {
      trackLiveContour(session, overlay);
    });
  }

  function drawOverlayQuad(overlay, video, corners) {
    var canvas = overlay.liveCanvas;
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!corners || !video.videoWidth) return;

    var scaleX = video.clientWidth / video.videoWidth;
    var scaleY = video.clientHeight / video.videoHeight;

    ctx.strokeStyle = "#00723d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    corners.forEach(function (c, i) {
      var x = c.x * scaleX;
      var y = c.y * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function capturePage(session, overlay) {
    session.frame = CameraKit.captureFrame(overlay.video);
    session.corners = session.lastCorners || defaultCorners(session.frame.width, session.frame.height);
    enterAdjustMode(session, overlay);
  }

  function defaultCorners(width, height) {
    var marginX = width * 0.08;
    var marginY = height * 0.08;
    return [
      { x: marginX, y: marginY },
      { x: width - marginX, y: marginY },
      { x: width - marginX, y: height - marginY },
      { x: marginX, y: height - marginY },
    ];
  }

  function enterAdjustMode(session, overlay) {
    session.mode = "adjust";
    showStep(overlay, "adjust");

    var canvas = overlay.adjustCanvas;
    canvas.width = session.frame.width;
    canvas.height = session.frame.height;
    canvas.getContext("2d").drawImage(session.frame, 0, 0);

    mountCornerHandles(session, overlay);
  }

  function mountCornerHandles(session, overlay) {
    var wrapper = overlay.adjustWrapper;
    wrapper.querySelectorAll(".camera-kit-handle").forEach(function (h) {
      h.remove();
    });

    session.corners.forEach(function (corner, index) {
      var handle = document.createElement("div");
      handle.className = "camera-kit-handle";
      wrapper.appendChild(handle);
      positionHandle(handle, corner, overlay.adjustCanvas);
      makeDraggable(handle, overlay.adjustCanvas, function (point) {
        session.corners[index] = point;
        redrawAdjustQuad(session, overlay);
      });
    });

    redrawAdjustQuad(session, overlay);
  }

  function positionHandle(handle, corner, canvas) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = rect.width / canvas.width;
    var scaleY = rect.height / canvas.height;
    handle.style.left = corner.x * scaleX - 12 + "px";
    handle.style.top = corner.y * scaleY - 12 + "px";
  }

  function makeDraggable(handle, canvas, onMove) {
    function toCanvasPoint(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function onPointerMove(evt) {
      var rect = canvas.getBoundingClientRect();
      handle.style.left = evt.clientX - rect.left - 12 + "px";
      handle.style.top = evt.clientY - rect.top - 12 + "px";
      onMove(toCanvasPoint(evt.clientX, evt.clientY));
    }

    function onPointerUp() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    }

    handle.addEventListener("pointerdown", function (evt) {
      evt.preventDefault();
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    });
  }

  function redrawAdjustQuad(session, overlay) {
    var canvas = overlay.adjustCanvas;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(session.frame, 0, 0);

    ctx.strokeStyle = "#00723d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    session.corners.forEach(function (c, i) {
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function confirmPage(session, overlay) {
    var warped;
    try {
      warped = CameraKit.warpToDocument(session.frame, session.corners);
    } catch (err) {
      overlay.status.textContent = err.message;
      return;
    }
    session.pages.push(warped);
    renderPageStrip(session, overlay);
    session.mode = "pages";
    showStep(overlay, "pages");
  }

  function renderPageStrip(session, overlay) {
    overlay.pageStrip.innerHTML = "";
    session.pages.forEach(function (pageCanvas, index) {
      var thumb = document.createElement("img");
      thumb.src = pageCanvas.toDataURL("image/jpeg", 0.7);
      thumb.className = "camera-kit-thumb";
      thumb.alt = "Page " + (index + 1);
      overlay.pageStrip.appendChild(thumb);
    });
  }

  function enterLiveMode(session, overlay) {
    session.mode = "live";
    session.frame = null;
    session.corners = null;
    showStep(overlay, "live");
    trackLiveContour(session, overlay);
  }

  function finishScan(session, input, container) {
    if (session.pages.length === 0) return;

    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
      throw new Error("django-camera-kit: jsPDF vendor file is missing, see vendor/README.md");
    }

    var pdf = new jsPDF({ unit: "pt" });

    session.pages.forEach(function (pageCanvas, index) {
      var imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
      var pageWidth = pdf.internal.pageSize.getWidth();
      var pageHeight = (pageCanvas.height / pageCanvas.width) * pageWidth;

      if (index > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);
    });

    var blob = pdf.output("blob");
    var fileName = (input.name || "document") + ".pdf";
    var file = new File([blob], fileName, { type: "application/pdf" });

    var dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    container.dispatchEvent(
      new CustomEvent("camerakit:scan-complete", {
        bubbles: true,
        detail: { pageCount: session.pages.length, file: file },
      })
    );
  }

  function closeOverlay(session, overlay) {
    CameraKit.stopStream(session.stream);
    session.mode = "closed";
    overlay.root.remove();
  }

  function showStep(overlay, step) {
    overlay.root.querySelectorAll("[data-step]").forEach(function (el) {
      el.hidden = el.dataset.step !== step;
    });
  }

  function buildOverlay() {
    var root = document.createElement("div");
    root.className = "camera-kit-overlay";
    root.innerHTML = [
      '<div class="camera-kit-modal">',
      '  <div class="camera-kit-status"></div>',

      '  <div data-step="live" class="camera-kit-step">',
      '    <div class="camera-kit-video-wrapper">',
      "      <video autoplay playsinline muted></video>",
      "      <canvas></canvas>",
      "    </div>",
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">Annuler</button>',
      '      <button type="button" class="btn btn-primary camera-kit-capture">Capturer</button>',
      "    </div>",
      "  </div>",

      '  <div data-step="adjust" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-adjust-wrapper">',
      "      <canvas></canvas>",
      "    </div>",
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-retake">Reprendre</button>',
      '      <button type="button" class="btn btn-primary camera-kit-confirm-page">Valider la page</button>',
      "    </div>",
      "  </div>",

      '  <div data-step="pages" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-page-strip"></div>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-add-page">Page suivante</button>',
      '      <button type="button" class="btn btn-success camera-kit-finish">Terminer</button>',
      "    </div>",
      "  </div>",
      "</div>",
    ].join("\n");

    return {
      root: root,
      status: root.querySelector(".camera-kit-status"),
      video: root.querySelector("video"),
      liveCanvas: root.querySelector('[data-step="live"] canvas'),
      captureBtn: root.querySelector(".camera-kit-capture"),
      cancelBtn: root.querySelector(".camera-kit-cancel"),
      retakeBtn: root.querySelector(".camera-kit-retake"),
      confirmPageBtn: root.querySelector(".camera-kit-confirm-page"),
      adjustWrapper: root.querySelector(".camera-kit-adjust-wrapper"),
      adjustCanvas: root.querySelector('[data-step="adjust"] canvas'),
      addPageBtn: root.querySelector(".camera-kit-add-page"),
      finishBtn: root.querySelector(".camera-kit-finish"),
      pageStrip: root.querySelector(".camera-kit-page-strip"),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
