/**
 * django-camera-kit — document scanner UI.
 *
 * Reads its whole configuration (format list, options, translated labels)
 * from the JSON block the widget rendered, so this file holds no
 * user-facing text and no hardcoded format.
 */
(function (window, document) {
  "use strict";

  // One timer drives everything. A requestAnimationFrame loop that calls
  // itself is recursion by another name, and it keeps running at 60 Hz for an
  // overlay that changes eight times a second.
  var TICK_MS = 40;

  // Detection runs every N ticks: ~8 detections per second is enough to feel
  // live, and leaves the main thread to the video.
  var DETECT_EVERY_TICKS = 3;

  // Consecutive stable detections before an automatic capture is allowed.
  var STABLE_DETECTIONS = 4;

  // How far a corner may drift between two detections and still count as
  // steady, as a fraction of the frame diagonal.
  var STABILITY_TOLERANCE = 0.02;

  // Grace period between "steady" and the shutter, so the user sees it coming.
  var COUNTDOWN_MS = 700;

  // After a page in series mode, ignore detections for this long: without it
  // the same sheet is captured three times before the user can move it away.
  var BATCH_COOLDOWN_MS = 1500;

  // Fraction of the frame the guide rectangle occupies.
  var GUIDE_FILL = 0.88;

  var COLOR_IDLE = "rgba(255, 255, 255, 0.85)";
  var COLOR_READY = "#00c86f";
  var COLOR_QUAD = "#00723d";
  var HANDLE_RADIUS = 14;

  function t(labels, key, params) {
    var template = labels[key] || key;
    if (!params) return template;
    return Object.keys(params).reduce(function (text, name) {
      return text.split("{" + name + "}").join(params[name]);
    }, template);
  }

  function readConfig(container) {
    var id = container.dataset.cameraKitConfig;
    var node = id && document.getElementById(id);
    if (!node) return null;
    return JSON.parse(node.textContent);
  }

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
    var config = readConfig(container);
    if (!input || !trigger || !config) return;

    // The native file input only disappears once this script has taken over:
    // if it fails to load, the plain input stays as the fallback.
    container.classList.add("camera-kit-js-ready");
    trigger.addEventListener("click", function () {
      openScanner(container, input, config);
    });
  }

  function findFormat(config, key) {
    var match = config.formats.filter(function (fmt) {
      return fmt.key === key;
    });
    return match.length ? match[0] : config.formats[0];
  }

  function resolveOrientation(config, format) {
    if (config.orientation !== "auto") return config.orientation;
    return format.naturalOrientation || "portrait";
  }

  /** Guide ratio as width/height, in the session's orientation. 0 when free. */
  function guideRatio(session) {
    var ratio = session.format.aspectRatio;
    if (!ratio) return 0;
    return session.orientation === "landscape" ? 1 / ratio : ratio;
  }

  function newSession(container, input, config) {
    var format = findFormat(config, config.format);
    return {
      container: container,
      input: input,
      config: config,
      labels: config.labels,
      format: format,
      orientation: resolveOrientation(config, format),
      autoCapture: config.autoCapture,
      batch: config.batch,
      pages: [],
      stream: null,
      frameCanvas: document.createElement("canvas"),
      smallCanvas: document.createElement("canvas"),
      detection: null,
      previousCorners: null,
      stableCount: 0,
      blurry: false,
      captureAt: 0,
      cooldownUntil: 0,
      ticks: 0,
      timerId: null,
      frame: null,
      corners: null,
      step: "setup",
    };
  }

  function openScanner(container, input, config) {
    var session = newSession(container, input, config);
    var overlay = buildOverlay(session);
    session.overlay = overlay;
    document.body.appendChild(overlay.root);

    CameraKit.ready().then(function (isReady) {
      if (!isReady) setStatus(session, t(session.labels, "errorEngine"));
    });

    wireOverlay(session, overlay);
    if (config.allowFormatChange) {
      showStep(session, "setup");
      return;
    }
    startCamera(session);
  }

  function wireOverlay(session, overlay) {
    on(overlay.startBtn, function () {
      applySetup(session, overlay);
      startCamera(session);
    });
    on(overlay.captureBtn, function () {
      capturePage(session);
    });
    on(overlay.retakeBtn, function () {
      enterLive(session);
    });
    on(overlay.confirmBtn, function () {
      confirmAdjustedPage(session);
    });
    on(overlay.addPageBtn, function () {
      enterLive(session);
    });
    overlay.finishBtns.forEach(function (button) {
      on(button, function () {
        finish(session);
      });
    });
    on(overlay.reviewBtn, function () {
      showStep(session, "pages");
    });
    overlay.cancelBtns.forEach(function (button) {
      on(button, function () {
        closeScanner(session);
      });
    });
    overlay.root.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeScanner(session);
    });
  }

  function on(element, handler) {
    if (element) element.addEventListener("click", handler);
  }

  function applySetup(session, overlay) {
    session.format = findFormat(session.config, overlay.formatSelect.value);
    session.orientation = overlay.orientationSelect.value;
    session.autoCapture = overlay.autoCaptureBox.checked;
    session.batch = overlay.batchBox.checked;
  }

  function startCamera(session) {
    enterLive(session);
    CameraKit.openStream()
      .then(function (stream) {
        session.stream = stream;
        session.overlay.video.srcObject = stream;
        return session.overlay.video.play();
      })
      .then(function () {
        startLoop(session);
      })
      .catch(function (error) {
        setStatus(session, t(session.labels, "errorCamera", { error: error.message }));
      });
  }

  function startLoop(session) {
    stopLoop(session);
    session.timerId = window.setInterval(function () {
      tick(session);
    }, TICK_MS);
  }

  function stopLoop(session) {
    if (session.timerId === null) return;
    window.clearInterval(session.timerId);
    session.timerId = null;
  }

  function tick(session) {
    if (session.step !== "live") return;
    session.ticks += 1;
    if (session.ticks % DETECT_EVERY_TICKS === 0) runDetection(session);
    drawScene(session);
    updateHint(session);
    updateAutoCapture(session);
  }

  function runDetection(session) {
    var video = session.overlay.video;
    if (video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return;

    var frame = CameraKit.grabFrame(video, session.frameCanvas);
    var small = CameraKit.downscale(frame, session.config.detectionWidth, session.smallCanvas);
    var found = CameraKit.detectQuad(small, { targetRatio: guideRatio(session) });

    session.blurry = CameraKit.sharpness(small) < CameraKit.BLUR_LIMIT;
    session.detection = found
      ? {
          corners: CameraKit.scaleCorners(found.corners, frame.width / small.width),
          coverage: found.coverage,
        }
      : null;
    updateStability(session);
  }

  function updateStability(session) {
    if (!session.detection) {
      session.previousCorners = null;
      session.stableCount = 0;
      session.captureAt = 0;
      return;
    }
    var corners = session.detection.corners;
    var limit = Math.hypot(session.frameCanvas.width, session.frameCanvas.height) * STABILITY_TOLERANCE;
    var steady = session.previousCorners !== null && cornersClose(corners, session.previousCorners, limit);

    session.previousCorners = corners;
    session.stableCount = steady ? session.stableCount + 1 : 0;
    if (!steady) session.captureAt = 0;
  }

  function cornersClose(left, right, limit) {
    for (var i = 0; i < 4; i++) {
      if (CameraKit.distance(left[i], right[i]) > limit) return false;
    }
    return true;
  }

  function isReadyToShoot(session) {
    return (
      session.detection !== null &&
      !session.blurry &&
      session.stableCount >= STABLE_DETECTIONS &&
      Date.now() >= session.cooldownUntil
    );
  }

  function updateAutoCapture(session) {
    if (!session.autoCapture || !isReadyToShoot(session)) return;
    var now = Date.now();
    if (session.captureAt === 0) {
      session.captureAt = now + COUNTDOWN_MS;
      return;
    }
    if (now >= session.captureAt) capturePage(session);
  }

  function updateHint(session) {
    var labels = session.labels;
    if (Date.now() < session.cooldownUntil) {
      setHint(session, t(labels, "hintNextPage", { count: session.pages.length }));
      return;
    }
    if (!session.detection) {
      setHint(session, t(labels, "hintSearching"));
      return;
    }
    if (session.blurry) {
      setHint(session, t(labels, "hintBlurry"));
      return;
    }
    if (session.captureAt > 0) {
      setHint(session, t(labels, "hintCapturing"));
      return;
    }
    setHint(session, t(labels, session.stableCount > 0 ? "hintHoldStill" : "hintSearching"));
  }

  function guideRect(width, height, ratio) {
    if (!ratio) {
      return { x: width * 0.06, y: height * 0.06, width: width * 0.88, height: height * 0.88 };
    }
    var boxWidth = width * GUIDE_FILL;
    var boxHeight = boxWidth / ratio;
    if (boxHeight > height * GUIDE_FILL) {
      boxHeight = height * GUIDE_FILL;
      boxWidth = boxHeight * ratio;
    }
    return {
      x: (width - boxWidth) / 2,
      y: (height - boxHeight) / 2,
      width: boxWidth,
      height: boxHeight,
    };
  }

  function drawScene(session) {
    var overlay = session.overlay;
    var video = overlay.video;
    var canvas = overlay.liveCanvas;
    if (!video.clientWidth) return;

    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGuide(ctx, canvas, guideRect(canvas.width, canvas.height, guideRatio(session)), session);
    drawDetection(ctx, session, canvas);
  }

  function drawGuide(ctx, canvas, rect, session) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = isReadyToShoot(session) ? COLOR_READY : COLOR_IDLE;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.setLineDash([]);
  }

  function drawDetection(ctx, session, canvas) {
    if (!session.detection || !session.frameCanvas.width) return;
    var scaleX = canvas.width / session.frameCanvas.width;
    var scaleY = canvas.height / session.frameCanvas.height;

    ctx.strokeStyle = isReadyToShoot(session) ? COLOR_READY : COLOR_QUAD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    session.detection.corners.forEach(function (corner, index) {
      var x = corner.x * scaleX;
      var y = corner.y * scaleY;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function cloneCanvas(source) {
    var copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d").drawImage(source, 0, 0);
    return copy;
  }

  function defaultCorners(width, height, ratio) {
    var rect = guideRect(width, height, ratio);
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
  }

  function capturePage(session) {
    if (session.pages.length >= session.config.maxPages) {
      setStatus(session, t(session.labels, "errorMaxPages", { max: session.config.maxPages }));
      return;
    }
    CameraKit.grabFrame(session.overlay.video, session.frameCanvas);
    session.frame = cloneCanvas(session.frameCanvas);
    session.corners = session.detection
      ? session.detection.corners
      : defaultCorners(session.frame.width, session.frame.height, guideRatio(session));
    session.captureAt = 0;
    session.stableCount = 0;

    if (session.batch) {
      addPage(session, session.frame, session.corners);
      session.cooldownUntil = Date.now() + BATCH_COOLDOWN_MS;
      flash(session);
      return;
    }
    enterAdjust(session);
  }

  function addPage(session, frame, corners) {
    var page;
    try {
      page = CameraKit.warpQuad(frame, corners, guideRatio(session));
    } catch (error) {
      setStatus(session, error.message);
      return;
    }
    session.pages.push(page);
    renderPages(session);
    setStatus(session, "");
  }

  function confirmAdjustedPage(session) {
    addPage(session, session.frame, session.corners);
    if (session.config.multiPage) {
      showStep(session, "pages");
      return;
    }
    finish(session);
  }

  function flash(session) {
    var element = session.overlay.flash;
    element.classList.remove("camera-kit-flash-on");
    // Reading offsetWidth forces the style recalculation that restarts the
    // animation; without it a second capture in a row shows nothing.
    void element.offsetWidth;
    element.classList.add("camera-kit-flash-on");
  }

  function enterLive(session) {
    session.step = "live";
    session.frame = null;
    session.corners = null;
    session.detection = null;
    session.stableCount = 0;
    session.captureAt = 0;
    showStep(session, "live");
    if (session.stream) startLoop(session);
  }

  function enterAdjust(session) {
    session.step = "adjust";
    stopLoop(session);
    showStep(session, "adjust");

    var canvas = session.overlay.adjustCanvas;
    canvas.width = session.frame.width;
    canvas.height = session.frame.height;
    drawAdjust(session);
    mountHandles(session);
  }

  function drawAdjust(session) {
    var canvas = session.overlay.adjustCanvas;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(session.frame, 0, 0);
    ctx.strokeStyle = COLOR_QUAD;
    ctx.lineWidth = Math.max(2, canvas.width / 300);
    ctx.beginPath();
    session.corners.forEach(function (corner, index) {
      if (index === 0) ctx.moveTo(corner.x, corner.y);
      else ctx.lineTo(corner.x, corner.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function mountHandles(session) {
    var wrapper = session.overlay.adjustWrapper;
    wrapper.querySelectorAll(".camera-kit-handle").forEach(function (handle) {
      handle.remove();
    });
    session.corners.forEach(function (corner, index) {
      var handle = document.createElement("div");
      handle.className = "camera-kit-handle";
      wrapper.appendChild(handle);
      placeHandle(session, handle, index);
      dragHandle(session, handle, index);
    });
  }

  /** Handles are positioned against the wrapper, in the canvas' own frame. */
  function handleGeometry(session) {
    var canvas = session.overlay.adjustCanvas;
    var wrapper = session.overlay.adjustWrapper;
    var canvasBox = canvas.getBoundingClientRect();
    var wrapperBox = wrapper.getBoundingClientRect();
    return {
      offsetX: canvasBox.left - wrapperBox.left,
      offsetY: canvasBox.top - wrapperBox.top,
      scaleX: canvasBox.width / canvas.width,
      scaleY: canvasBox.height / canvas.height,
      box: canvasBox,
    };
  }

  function placeHandle(session, handle, index) {
    var geometry = handleGeometry(session);
    var corner = session.corners[index];
    handle.style.left = geometry.offsetX + corner.x * geometry.scaleX - HANDLE_RADIUS + "px";
    handle.style.top = geometry.offsetY + corner.y * geometry.scaleY - HANDLE_RADIUS + "px";
  }

  function dragHandle(session, handle, index) {
    function onMove(event) {
      var geometry = handleGeometry(session);
      var canvas = session.overlay.adjustCanvas;
      var x = ((event.clientX - geometry.box.left) / geometry.box.width) * canvas.width;
      var y = ((event.clientY - geometry.box.top) / geometry.box.height) * canvas.height;
      session.corners[index] = {
        x: Math.min(Math.max(x, 0), canvas.width),
        y: Math.min(Math.max(y, 0), canvas.height),
      };
      placeHandle(session, handle, index);
      drawAdjust(session);
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    handle.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  function renderPages(session) {
    var labels = session.labels;
    [session.overlay.pageStrip, session.overlay.pageGrid].forEach(function (holder) {
      holder.innerHTML = "";
    });
    session.pages.forEach(function (page, index) {
      session.overlay.pageStrip.appendChild(thumbnail(session, page, index, false));
      session.overlay.pageGrid.appendChild(thumbnail(session, page, index, true));
    });
    session.overlay.pageCount.textContent = t(labels, "pageCount", { count: session.pages.length });
    session.overlay.finishBtns.forEach(function (button) {
      button.disabled = session.pages.length === 0;
    });
    session.overlay.reviewBtn.hidden = session.pages.length === 0;
  }

  function thumbnail(session, page, index, withDelete) {
    var figure = document.createElement("figure");
    figure.className = "camera-kit-thumb";

    var image = document.createElement("img");
    image.src = page.toDataURL("image/jpeg", 0.6);
    image.alt = t(session.labels, "pageNumber", { number: index + 1 });
    figure.appendChild(image);

    if (!withDelete) return figure;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "camera-kit-thumb-delete";
    button.textContent = "×";
    button.title = t(session.labels, "deletePage");
    button.addEventListener("click", function () {
      session.pages.splice(index, 1);
      renderPages(session);
    });
    figure.appendChild(button);
    return figure;
  }

  /** PDF page size in millimetres, in the session's orientation. */
  function pageSizeMm(session, page) {
    var format = session.format;
    if (!format.widthMm || !format.heightMm) {
      var longSide = 297;
      var shortSide = Math.round((Math.min(page.width, page.height) / Math.max(page.width, page.height)) * longSide);
      return page.width >= page.height ? [longSide, shortSide] : [shortSide, longSide];
    }
    return session.orientation === "landscape"
      ? [format.heightMm, format.widthMm]
      : [format.widthMm, format.heightMm];
  }

  function buildPdf(session) {
    var jsPDFClass = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFClass) {
      throw new Error("django-camera-kit: jsPDF vendor file is missing, see vendor/README.md");
    }
    var first = pageSizeMm(session, session.pages[0]);
    var pdf = new jsPDFClass({ unit: "mm", format: first });

    session.pages.forEach(function (page, index) {
      var size = pageSizeMm(session, page);
      if (index > 0) pdf.addPage(size);
      pdf.addImage(page.toDataURL("image/jpeg", session.config.quality), "JPEG", 0, 0, size[0], size[1]);
    });
    return pdf.output("blob");
  }

  function baseName(session) {
    return (session.input.name || "document") + "-" + session.format.key;
  }

  function pageFiles(session) {
    return session.pages.map(function (page, index) {
      var data = dataUrlToBlob(page.toDataURL("image/jpeg", session.config.quality));
      return new File([data], baseName(session) + "-" + (index + 1) + ".jpg", { type: "image/jpeg" });
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var binary = window.atob(parts[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: "image/jpeg" });
  }

  function buildFiles(session) {
    if (session.config.output === "images") return pageFiles(session);
    return [new File([buildPdf(session)], baseName(session) + ".pdf", { type: "application/pdf" })];
  }

  function finish(session) {
    if (session.pages.length === 0) {
      setStatus(session, t(session.labels, "errorNoPage"));
      return;
    }
    var files;
    try {
      files = buildFiles(session);
    } catch (error) {
      setStatus(session, error.message);
      return;
    }

    var transfer = new DataTransfer();
    files.forEach(function (file) {
      transfer.items.add(file);
    });
    session.input.files = transfer.files;
    session.input.dispatchEvent(new Event("change", { bubbles: true }));
    session.container.dispatchEvent(
      new CustomEvent("camerakit:scan-complete", {
        bubbles: true,
        detail: { pageCount: session.pages.length, format: session.format.key, files: files },
      })
    );
    closeScanner(session);
  }

  function closeScanner(session) {
    stopLoop(session);
    CameraKit.stopStream(session.stream);
    session.step = "closed";
    session.overlay.root.remove();
  }

  function setStatus(session, text) {
    session.overlay.status.textContent = text;
  }

  function setHint(session, text) {
    session.overlay.hint.textContent = text;
  }

  function showStep(session, step) {
    session.step = step;
    session.overlay.root.querySelectorAll("[data-step]").forEach(function (element) {
      element.hidden = element.dataset.step !== step;
    });
  }

  function optionsMarkup(session) {
    var labels = session.labels;
    var options = session.config.formats
      .map(function (format) {
        var selected = format.key === session.format.key ? " selected" : "";
        return '<option value="' + format.key + '"' + selected + ">" + escapeHtml(format.label) + "</option>";
      })
      .join("");

    return [
      '<label class="camera-kit-field">',
      "  <span>" + escapeHtml(labels.format) + "</span>",
      '  <select class="camera-kit-format form-select">' + options + "</select>",
      "</label>",
      '<label class="camera-kit-field">',
      "  <span>" + escapeHtml(labels.orientation) + "</span>",
      '  <select class="camera-kit-orientation form-select">',
      '    <option value="portrait">' + escapeHtml(labels.portrait) + "</option>",
      '    <option value="landscape">' + escapeHtml(labels.landscape) + "</option>",
      "  </select>",
      "</label>",
      '<label class="camera-kit-check">',
      '  <input type="checkbox" class="camera-kit-auto"> <span>' + escapeHtml(labels.autoCapture) + "</span>",
      "</label>",
      '<label class="camera-kit-check">',
      '  <input type="checkbox" class="camera-kit-batch"> <span>' + escapeHtml(labels.batch) + "</span>",
      "</label>",
    ].join("\n");
  }

  function escapeHtml(text) {
    var holder = document.createElement("span");
    holder.textContent = text;
    return holder.innerHTML;
  }

  function overlayMarkup(session) {
    var labels = session.labels;
    return [
      '<div class="camera-kit-modal" role="dialog" aria-modal="true">',
      '  <p class="camera-kit-status" role="status"></p>',
      '  <div data-step="setup" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-setup">' + optionsMarkup(session) + "</div>",
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">' + escapeHtml(labels.cancel) + "</button>",
      '      <button type="button" class="btn btn-primary camera-kit-start">' + escapeHtml(labels.start) + "</button>",
      "    </div>",
      "  </div>",
      '  <div data-step="live" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-video-wrapper">',
      "      <video autoplay playsinline muted></video>",
      '      <canvas class="camera-kit-live-canvas"></canvas>',
      '      <div class="camera-kit-flash"></div>',
      "    </div>",
      '    <p class="camera-kit-hint"></p>',
      '    <div class="camera-kit-page-strip"></div>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">' + escapeHtml(labels.cancel) + "</button>",
      '      <button type="button" class="btn btn-primary camera-kit-capture">' + escapeHtml(labels.capture) + "</button>",
      '      <button type="button" class="btn btn-outline-secondary camera-kit-review" hidden>' + escapeHtml(labels.pagesTitle) + "</button>",
      '      <button type="button" class="btn btn-success camera-kit-finish" disabled>' + escapeHtml(labels.finish) + "</button>",
      "    </div>",
      "  </div>",
      '  <div data-step="adjust" class="camera-kit-step" hidden>',
      "    <p>" + escapeHtml(labels.adjustTitle) + "</p>",
      '    <div class="camera-kit-adjust-wrapper"><canvas></canvas></div>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-retake">' + escapeHtml(labels.retake) + "</button>",
      '      <button type="button" class="btn btn-primary camera-kit-confirm-page">' + escapeHtml(labels.confirmPage) + "</button>",
      "    </div>",
      "  </div>",
      '  <div data-step="pages" class="camera-kit-step" hidden>',
      "    <p><strong>" + escapeHtml(labels.pagesTitle) + '</strong> <span class="camera-kit-page-count"></span></p>',
      '    <div class="camera-kit-page-grid"></div>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-add-page">' + escapeHtml(labels.addPage) + "</button>",
      '      <button type="button" class="btn btn-success camera-kit-finish" disabled>' + escapeHtml(labels.finish) + "</button>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("\n");
  }

  function buildOverlay(session) {
    var root = document.createElement("div");
    root.className = "camera-kit-overlay";
    root.tabIndex = -1;
    root.innerHTML = overlayMarkup(session);

    var overlay = {
      root: root,
      status: root.querySelector(".camera-kit-status"),
      hint: root.querySelector(".camera-kit-hint"),
      video: root.querySelector("video"),
      liveCanvas: root.querySelector(".camera-kit-live-canvas"),
      flash: root.querySelector(".camera-kit-flash"),
      formatSelect: root.querySelector(".camera-kit-format"),
      orientationSelect: root.querySelector(".camera-kit-orientation"),
      autoCaptureBox: root.querySelector(".camera-kit-auto"),
      batchBox: root.querySelector(".camera-kit-batch"),
      startBtn: root.querySelector(".camera-kit-start"),
      captureBtn: root.querySelector(".camera-kit-capture"),
      retakeBtn: root.querySelector(".camera-kit-retake"),
      confirmBtn: root.querySelector(".camera-kit-confirm-page"),
      addPageBtn: root.querySelector(".camera-kit-add-page"),
      reviewBtn: root.querySelector(".camera-kit-review"),
      pageStrip: root.querySelector(".camera-kit-page-strip"),
      pageGrid: root.querySelector(".camera-kit-page-grid"),
      pageCount: root.querySelector(".camera-kit-page-count"),
      cancelBtns: Array.prototype.slice.call(root.querySelectorAll(".camera-kit-cancel")),
    };
    overlay.finishBtns = Array.prototype.slice.call(root.querySelectorAll(".camera-kit-finish"));
    overlay.orientationSelect.value = session.orientation;
    overlay.autoCaptureBox.checked = session.autoCapture;
    overlay.batchBox.checked = session.batch;
    return overlay;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CameraKitScanner = { init: init, guideRect: guideRect, format: t };
})(window, document);
