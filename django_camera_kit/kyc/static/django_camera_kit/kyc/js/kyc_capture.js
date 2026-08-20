/**
 * django-camera-kit — KYC capture flow.
 *
 * Two steps: photograph the ID document inside an ID-1 guide, then frame the
 * face inside the oval and answer a short sequence of head-pose challenges.
 * Every captured frame is sent to the server, which re-runs the analysis:
 * nothing the browser asserts about liveness is trusted.
 *
 * All user-facing text comes from the widget's JSON configuration.
 */
(function (window, document) {
  "use strict";

  var TICK_MS = 60;

  // Consecutive frames a challenge must hold before it counts. One good frame
  // can be a detection glitch; four in a row is a pose.
  var HOLD_FRAMES = 4;

  // The face guide is an oval this wide relative to the frame, with a
  // portrait ratio close to a human head.
  var GUIDE_WIDTH_RATIO = 0.52;
  var GUIDE_ASPECT = 1.32;
  var GUIDE_MAX_HEIGHT = 0.86;

  // The ID guide follows ISO/IEC 7810 ID-1 (85.6 × 54 mm), landscape.
  var ID_GUIDE_RATIO = 85.6 / 53.98;
  var ID_GUIDE_FILL = 0.82;

  var COLOR_IDLE = "rgba(255, 255, 255, 0.85)";
  var COLOR_READY = "#00c86f";

  function t(labels, key, params) {
    var template = labels[key] || key;
    if (!params) return template;
    return Object.keys(params).reduce(function (text, name) {
      return text.split("{" + name + "}").join(params[name]);
    }, template);
  }

  function getCookie(name) {
    var match = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return match ? decodeURIComponent(match[2]) : null;
  }

  function readConfig(container) {
    var id = container.dataset.cameraKitConfig;
    var node = id && document.getElementById(id);
    if (!node) return null;
    return JSON.parse(node.textContent);
  }

  function init() {
    document.querySelectorAll(".camera-kit-kyc").forEach(function (container) {
      if (container.dataset.camerakitBound) return;
      container.dataset.camerakitBound = "true";
      bindWidget(container);
    });
  }

  function bindWidget(container) {
    var input = container.querySelector("input[type=hidden]");
    var trigger = container.querySelector(".camera-kit-kyc-trigger");
    var config = readConfig(container);
    if (!input || !trigger || !config) return;

    trigger.addEventListener("click", function () {
      openFlow(container, input, config);
    });
  }

  /**
   * The challenge sequence: face the camera, then turn each way. The two
   * turns are shuffled so a replayed recording cannot match a fixed order.
   */
  function buildChallenges() {
    var turns = [
      { key: "left", direction: FaceKit.YAW_USER_LEFT, hint: "hintTurnLeft" },
      { key: "right", direction: FaceKit.YAW_USER_RIGHT, hint: "hintTurnRight" },
    ];
    if (Math.random() < 0.5) turns.reverse();
    return [{ key: "frontal", direction: 0, hint: "hintFrontal" }].concat(turns);
  }

  function newSession(container, input, config) {
    return {
      container: container,
      input: input,
      config: config,
      labels: config.labels,
      stream: null,
      frameCanvas: document.createElement("canvas"),
      challenges: buildChallenges(),
      challengeIndex: 0,
      holdCount: 0,
      captures: {},
      idBlob: null,
      timerId: null,
      step: "id",
      framingOk: false,
    };
  }

  function openFlow(container, input, config) {
    if (!config.verifyUrl) {
      window.console.error("django-camera-kit: no verify_url configured on this widget.");
      return;
    }
    var session = newSession(container, input, config);
    session.overlay = buildOverlay(session);
    document.body.appendChild(session.overlay.root);

    FaceKit.ready().then(function (isReady) {
      if (!isReady) setStatus(session, t(session.labels, "errorEngine"));
    });

    wireOverlay(session);
    enterIdStep(session);
  }

  function wireOverlay(session) {
    var overlay = session.overlay;
    on(overlay.captureIdBtn, function () {
      captureId(session);
    });
    on(overlay.restartBtn, function () {
      restart(session);
    });
    on(overlay.retakeFaceBtn, function () {
      enterFaceStep(session);
    });
    on(overlay.sendBtn, function () {
      submit(session);
    });
    on(overlay.closeBtn, function () {
      closeFlow(session);
    });
    overlay.cancelBtns.forEach(function (button) {
      on(button, function () {
        closeFlow(session);
      });
    });
    overlay.root.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeFlow(session);
    });
  }

  function on(element, handler) {
    if (element) element.addEventListener("click", handler);
  }

  function restart(session) {
    session.challenges = buildChallenges();
    session.challengeIndex = 0;
    session.holdCount = 0;
    session.captures = {};
    session.idBlob = null;
    enterIdStep(session);
  }

  function startLoop(session) {
    stopLoop(session);
    session.timerId = window.setInterval(function () {
      tick(session);
    }, TICK_MS);
  }

  function stopLoop(session) {
    if (session.timerId === null || session.timerId === undefined) return;
    window.clearInterval(session.timerId);
    session.timerId = null;
  }

  function openCamera(session, facingMode) {
    CameraKit.stopStream(session.stream);
    return CameraKit.openStream({ video: { facingMode: { ideal: facingMode } }, audio: false })
      .then(function (stream) {
        session.stream = stream;
        session.overlay.video.srcObject = stream;
        return session.overlay.video.play();
      })
      .catch(function (error) {
        setStatus(session, t(session.labels, "errorCamera", { error: error.message }));
      });
  }

  function enterIdStep(session) {
    showStep(session, "id");
    session.overlay.idWrapper.appendChild(session.overlay.video);
    session.overlay.video.classList.remove("camera-kit-mirrored");
    openCamera(session, "environment").then(function () {
      startLoop(session);
    });
  }

  function enterFaceStep(session) {
    showStep(session, "face");
    session.overlay.faceWrapper.appendChild(session.overlay.video);
    session.overlay.video.classList.add("camera-kit-mirrored");
    session.challengeIndex = 0;
    session.holdCount = 0;
    session.captures = {};
    openCamera(session, "user").then(function () {
      startLoop(session);
    });
  }

  function tick(session) {
    var video = session.overlay.video;
    if (video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return;
    if (session.step === "id") {
      tickId(session);
      return;
    }
    if (session.step === "face") tickFace(session);
  }

  /**
   * Centred box of the given width/height ratio, taking at most `fillWidth`
   * of the frame width and `fillHeight` of its height.
   */
  function guideBox(width, height, ratio, fillWidth, fillHeight) {
    var boxWidth = width * fillWidth;
    var boxHeight = boxWidth / ratio;
    if (boxHeight > height * fillHeight) {
      boxHeight = height * fillHeight;
      boxWidth = boxHeight * ratio;
    }
    return {
      x: (width - boxWidth) / 2,
      y: (height - boxHeight) / 2,
      width: boxWidth,
      height: boxHeight,
    };
  }

  function faceGuideBox(width, height) {
    return guideBox(width, height, 1 / GUIDE_ASPECT, GUIDE_WIDTH_RATIO, GUIDE_MAX_HEIGHT);
  }

  /** The guide canvas of the step currently on screen. */
  function overlayCanvas(session) {
    var canvas = session.step === "face" ? session.overlay.faceCanvas : session.overlay.idCanvas;
    var video = session.overlay.video;
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }
    return canvas;
  }

  function tickId(session) {
    var canvas = overlayCanvas(session);
    var ctx = canvas.getContext("2d");
    var box = guideBox(canvas.width, canvas.height, ID_GUIDE_RATIO, ID_GUIDE_FILL, ID_GUIDE_FILL);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(box.x, box.y, box.width, box.height);
    ctx.strokeStyle = COLOR_IDLE;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);
  }

  function drawFaceGuide(session, ready) {
    var canvas = overlayCanvas(session);
    var ctx = canvas.getContext("2d");
    var box = faceGuideBox(canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = ready ? COLOR_READY : COLOR_IDLE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  var FRAMING_HINTS = {
    none: "hintNoFace",
    small: "hintCloser",
    large: "hintFarther",
    offset: "hintCenter",
  };

  function tickFace(session) {
    var frame = CameraKit.grabFrame(session.overlay.video, session.frameCanvas);
    var face = FaceKit.detectFace(frame);
    var guide = faceGuideBox(frame.width, frame.height);
    var framing = FaceKit.framing(face, guide);

    session.framingOk = framing.ok;
    drawFaceGuide(session, framing.ok);
    updateProgress(session);

    if (!framing.ok) {
      session.holdCount = 0;
      setHint(session, t(session.labels, FRAMING_HINTS[framing.reason] || "hintNoFace"));
      return;
    }
    evaluateChallenge(session, frame, face);
  }

  function currentChallenge(session) {
    return session.challenges[session.challengeIndex];
  }

  function challengeSatisfied(challenge, face) {
    if (challenge.direction === 0) return FaceKit.isFrontal(face);
    return FaceKit.isTurned(face, challenge.direction);
  }

  function evaluateChallenge(session, frame, face) {
    var challenge = currentChallenge(session);
    if (!challenge) return;

    setHint(session, t(session.labels, challenge.hint));
    if (!challengeSatisfied(challenge, face)) {
      session.holdCount = 0;
      return;
    }

    session.holdCount += 1;
    if (session.holdCount < HOLD_FRAMES) return;
    session.holdCount = 0;
    captureChallenge(session, frame, challenge);
  }

  function captureChallenge(session, frame, challenge) {
    var snapshot = document.createElement("canvas");
    snapshot.width = frame.width;
    snapshot.height = frame.height;
    snapshot.getContext("2d").drawImage(frame, 0, 0);

    CameraKit.canvasToBlob(snapshot, "image/jpeg", session.config.quality).then(function (blob) {
      session.captures[challenge.key] = blob;
      if (challenge.key === "frontal") {
        session.overlay.facePreview.src = URL.createObjectURL(blob);
      }
      advanceChallenge(session);
    });
  }

  function advanceChallenge(session) {
    session.challengeIndex += 1;
    updateProgress(session);
    if (session.challengeIndex < session.challenges.length) return;
    stopLoop(session);
    showStep(session, "review");
  }

  function updateProgress(session) {
    session.overlay.progress.textContent = t(session.labels, "progress", {
      done: session.challengeIndex,
      total: session.challenges.length,
    });
  }

  function captureId(session) {
    var frame = CameraKit.grabFrame(session.overlay.video, session.frameCanvas);
    var flattened = flattenId(frame);
    CameraKit.canvasToBlob(flattened, "image/jpeg", session.config.quality).then(function (blob) {
      session.idBlob = blob;
      session.overlay.idPreview.src = URL.createObjectURL(blob);
      enterFaceStep(session);
    });
  }

  /** Flatten the card when its edges are found, otherwise keep the frame. */
  function flattenId(frame) {
    var found = CameraKit.detectQuad(frame, { targetRatio: 1 / ID_GUIDE_RATIO });
    if (!found) return frame;
    try {
      return CameraKit.warpQuad(frame, found.corners, 1 / ID_GUIDE_RATIO);
    } catch (error) {
      window.console.warn("django-camera-kit: ID flattening failed, using the raw frame", error);
      return frame;
    }
  }

  function buildFormData(session) {
    var data = new FormData();
    data.append("id_document", session.idBlob, "id_document.jpg");
    data.append("selfie", session.captures.frontal, "selfie.jpg");
    if (session.captures.left) data.append("frame_left", session.captures.left, "frame_left.jpg");
    if (session.captures.right) data.append("frame_right", session.captures.right, "frame_right.jpg");
    return data;
  }

  function submit(session) {
    if (!session.idBlob || !session.captures.frontal) return;
    var overlay = session.overlay;
    overlay.sendBtn.disabled = true;
    overlay.reviewStatus.textContent = t(session.labels, "verifying");

    var csrfToken = getCookie("csrftoken");
    window
      .fetch(session.config.verifyUrl, {
        method: "POST",
        headers: csrfToken ? { "X-CSRFToken": csrfToken } : {},
        credentials: "same-origin",
        body: buildFormData(session),
      })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        overlay.sendBtn.disabled = false;
        showResult(session, result);
      })
      .catch(function (error) {
        overlay.sendBtn.disabled = false;
        overlay.reviewStatus.textContent = t(session.labels, "errorNetwork", { error: error.message });
      });
  }

  function showResult(session, result) {
    var labels = session.labels;
    var overlay = session.overlay;
    if (!result.ok) {
      overlay.resultText.textContent = t(labels, "errorServer");
      showStep(session, "result");
      return;
    }
    if (result.data.status === "verified") {
      overlay.resultText.textContent = t(labels, "verified");
      session.input.value = result.data.id;
      session.container.querySelector(".camera-kit-kyc-status").textContent = t(labels, "badgeVerified");
      session.input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      overlay.resultText.textContent = t(labels, "rejected");
      session.container.querySelector(".camera-kit-kyc-status").textContent = t(labels, "badgeRejected");
    }
    session.container.dispatchEvent(
      new CustomEvent("camerakit:kyc-result", { bubbles: true, detail: result.data })
    );
    showStep(session, "result");
  }

  function closeFlow(session) {
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

  function escapeHtml(text) {
    var holder = document.createElement("span");
    holder.textContent = text;
    return holder.innerHTML;
  }

  function overlayMarkup(labels) {
    return [
      '<div class="camera-kit-modal" role="dialog" aria-modal="true">',
      '  <p class="camera-kit-status" role="status"></p>',
      '  <div data-step="id" class="camera-kit-step">',
      "    <p>" + escapeHtml(labels.idTitle) + "</p>",
      '    <div class="camera-kit-video-wrapper camera-kit-kyc-id-wrapper">',
      '      <canvas class="camera-kit-live-canvas"></canvas>',
      "    </div>",
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">' + escapeHtml(labels.cancel) + "</button>",
      '      <button type="button" class="btn btn-primary camera-kit-capture-id">' + escapeHtml(labels.capture) + "</button>",
      "    </div>",
      "  </div>",
      '  <div data-step="face" class="camera-kit-step" hidden>',
      "    <p>" + escapeHtml(labels.faceTitle) + ' <span class="camera-kit-kyc-progress"></span></p>',
      '    <div class="camera-kit-video-wrapper camera-kit-kyc-face-wrapper">',
      '      <canvas class="camera-kit-live-canvas"></canvas>',
      "    </div>",
      '    <p class="camera-kit-hint"></p>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">' + escapeHtml(labels.cancel) + "</button>",
      "    </div>",
      "  </div>",
      '  <div data-step="review" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-kyc-review">',
      '      <img class="camera-kit-kyc-id-preview" alt="' + escapeHtml(labels.idTitle) + '">',
      '      <img class="camera-kit-kyc-face-preview" alt="' + escapeHtml(labels.faceTitle) + '">',
      "    </div>",
      '    <p class="camera-kit-kyc-review-status"></p>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-link camera-kit-kyc-restart">' + escapeHtml(labels.restart) + "</button>",
      '      <button type="button" class="btn btn-secondary camera-kit-kyc-retake-face">' + escapeHtml(labels.retakeFace) + "</button>",
      '      <button type="button" class="btn btn-success camera-kit-kyc-send">' + escapeHtml(labels.send) + "</button>",
      "    </div>",
      "  </div>",
      '  <div data-step="result" class="camera-kit-step" hidden>',
      '    <p class="camera-kit-kyc-result"></p>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-primary camera-kit-kyc-close">' + escapeHtml(labels.close) + "</button>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("\n");
  }

  function buildOverlay(session) {
    var root = document.createElement("div");
    root.className = "camera-kit-overlay";
    root.tabIndex = -1;
    root.innerHTML = overlayMarkup(session.labels);

    // One <video> element moved between the two step wrappers, so the live
    // stream is always attached to whichever one is visible.
    var video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    var idWrapper = root.querySelector(".camera-kit-kyc-id-wrapper");
    idWrapper.insertBefore(video, idWrapper.firstChild);

    return {
      root: root,
      video: video,
      idWrapper: idWrapper,
      faceWrapper: root.querySelector(".camera-kit-kyc-face-wrapper"),
      idCanvas: root.querySelector('[data-step="id"] canvas'),
      faceCanvas: root.querySelector('[data-step="face"] canvas'),
      status: root.querySelector(".camera-kit-status"),
      hint: root.querySelector(".camera-kit-hint"),
      progress: root.querySelector(".camera-kit-kyc-progress"),
      captureIdBtn: root.querySelector(".camera-kit-capture-id"),
      restartBtn: root.querySelector(".camera-kit-kyc-restart"),
      retakeFaceBtn: root.querySelector(".camera-kit-kyc-retake-face"),
      sendBtn: root.querySelector(".camera-kit-kyc-send"),
      closeBtn: root.querySelector(".camera-kit-kyc-close"),
      idPreview: root.querySelector(".camera-kit-kyc-id-preview"),
      facePreview: root.querySelector(".camera-kit-kyc-face-preview"),
      reviewStatus: root.querySelector(".camera-kit-kyc-review-status"),
      resultText: root.querySelector(".camera-kit-kyc-result"),
      cancelBtns: Array.prototype.slice.call(root.querySelectorAll(".camera-kit-cancel")),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CameraKitKyc = { init: init, guideBox: guideBox, buildChallenges: buildChallenges };
})(window, document);
