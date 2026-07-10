(function (window, document) {
  "use strict";

  var ALIGN_STREAK = 8; // consecutive frames with a detected face before we start the liveness challenge
  var MOVE_THRESHOLD_RATIO = 0.12; // horizontal head movement required, as a fraction of frame width

  function getCookie(name) {
    var match = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return match ? decodeURIComponent(match[2]) : null;
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
    var statusEl = container.querySelector(".camera-kit-kyc-status");
    if (!input || !trigger) return;

    trigger.addEventListener("click", function () {
      openFlow(container, input, statusEl);
    });
  }

  function openFlow(container, input, statusEl) {
    var verifyUrl = container.dataset.verifyUrl;
    if (!verifyUrl) {
      statusEl.textContent = "django-camera-kit: aucun verify_url configuré sur ce widget.";
      return;
    }

    var session = {
      stream: null,
      phase: "align",
      alignStreak: 0,
      challengeStartX: null,
      challengeMaxDelta: 0,
      idBlob: null,
      selfieBlob: null,
      livenessPassed: false,
      running: true,
    };

    var overlay = buildOverlay();
    document.body.appendChild(overlay.root);

    FaceKit.ready(); // kick off model loading in the background, in parallel with camera permission

    enterIdStep(session, overlay);

    overlay.captureIdBtn.addEventListener("click", function () {
      captureId(session, overlay);
    });

    overlay.restartBtn.addEventListener("click", function () {
      enterIdStep(session, overlay);
    });

    overlay.manualSelfieBtn.addEventListener("click", function () {
      captureSelfie(session, overlay, false);
    });

    overlay.retakeSelfieBtn.addEventListener("click", function () {
      enterSelfieStep(session, overlay);
    });

    overlay.sendBtn.addEventListener("click", function () {
      submit(session, overlay, input, verifyUrl, statusEl);
    });

    overlay.closeBtn.addEventListener("click", function () {
      closeOverlay(session, overlay);
    });

    overlay.cancelBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeOverlay(session, overlay);
      });
    });
  }

  function enterIdStep(session, overlay) {
    overlay.idVideoWrapper.appendChild(overlay.video);
    showStep(overlay, "id");
    switchCamera(session, overlay, "environment");
  }

  function enterSelfieStep(session, overlay) {
    overlay.selfieVideoWrapper.appendChild(overlay.video);
    session.phase = "align";
    session.alignStreak = 0;
    session.challengeStartX = null;
    session.challengeMaxDelta = 0;
    showStep(overlay, "selfie");
    switchCamera(session, overlay, "user").then(function () {
      trackSelfie(session, overlay);
    });
  }

  function switchCamera(session, overlay, facingMode) {
    CameraKit.stopStream(session.stream);
    return CameraKit.openStream({ video: { facingMode: { ideal: facingMode } }, audio: false })
      .then(function (stream) {
        session.stream = stream;
        overlay.video.srcObject = stream;
        return overlay.video.play();
      })
      .catch(function (err) {
        overlay.status.textContent = "Impossible d'accéder à la caméra : " + err.message;
      });
  }

  function captureId(session, overlay) {
    var frame = CameraKit.captureFrame(overlay.video);
    CameraKit.canvasToBlob(frame).then(function (blob) {
      session.idBlob = blob;
      overlay.idPreview.src = URL.createObjectURL(blob);
      enterSelfieStep(session, overlay);
    });
  }

  function trackSelfie(session, overlay) {
    if (!session.running || session.phase === "done") return;

    if (overlay.video.readyState === overlay.video.HAVE_ENOUGH_DATA) {
      var frame = CameraKit.captureFrame(overlay.video);
      var detection = FaceKit.detectFace(frame);
      updateMotionState(session, overlay, frame, detection);
    }

    window.requestAnimationFrame(function () {
      trackSelfie(session, overlay);
    });
  }

  // Liveness challenge: track how far the detected face's horizontal
  // center moves once the user is asked to turn their head, instead of a
  // blink. YuNet only returns 5 point landmarks (eye/nose/mouth centers),
  // not full eyelid contours, so a real eye-aspect-ratio blink signal
  // isn't available — head movement is a robust substitute that doesn't
  // depend on eye-region precision at all.
  function updateMotionState(session, overlay, frame, detection) {
    if (!detection) {
      overlay.hint.textContent = "Aucun visage détecté — centrez votre visage dans le cadre.";
      session.alignStreak = 0;
      return;
    }

    if (session.phase === "align") {
      overlay.hint.textContent = "Restez immobile, centrez votre visage…";
      session.alignStreak++;
      if (session.alignStreak >= ALIGN_STREAK) {
        session.phase = "challenge";
        session.challengeStartX = detection.centerX;
        session.challengeMaxDelta = 0;
        overlay.hint.textContent = "Tournez légèrement la tête, à gauche ou à droite.";
      }
      return;
    }

    if (session.phase === "challenge") {
      var delta = Math.abs(detection.centerX - session.challengeStartX);
      session.challengeMaxDelta = Math.max(session.challengeMaxDelta, delta);

      if (session.challengeMaxDelta >= frame.width * MOVE_THRESHOLD_RATIO) {
        session.phase = "done";
        finishChallenge(session, overlay, frame, true);
      }
    }
  }

  function finishChallenge(session, overlay, frame, livenessPassed) {
    session.livenessPassed = livenessPassed;
    CameraKit.canvasToBlob(frame).then(function (blob) {
      session.selfieBlob = blob;
      overlay.selfiePreview.src = URL.createObjectURL(blob);
      showStep(overlay, "review");
    });
  }

  function captureSelfie(session, overlay, livenessPassed) {
    session.phase = "done";
    var frame = CameraKit.captureFrame(overlay.video);
    finishChallenge(session, overlay, frame, livenessPassed);
  }

  function submit(session, overlay, input, verifyUrl, statusEl) {
    if (!session.idBlob || !session.selfieBlob) return;

    overlay.sendBtn.disabled = true;
    overlay.reviewStatus.textContent = "Vérification en cours…";

    var formData = new FormData();
    formData.append("id_document", session.idBlob, "id_document.jpg");
    formData.append("selfie", session.selfieBlob, "selfie.jpg");
    formData.append("liveness_passed", session.livenessPassed ? "true" : "false");

    var csrfToken = getCookie("csrftoken");

    fetch(verifyUrl, {
      method: "POST",
      headers: csrfToken ? { "X-CSRFToken": csrfToken } : {},
      credentials: "same-origin",
      body: formData,
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        overlay.sendBtn.disabled = false;
        showResult(session, overlay, input, statusEl, result);
      })
      .catch(function (err) {
        overlay.sendBtn.disabled = false;
        overlay.reviewStatus.textContent = "Erreur réseau : " + err.message;
      });
  }

  function showResult(session, overlay, input, statusEl, result) {
    if (!result.ok) {
      overlay.resultText.textContent = "Erreur : impossible de traiter la vérification.";
      showStep(overlay, "result");
      return;
    }

    var data = result.data;
    if (data.status === "verified") {
      overlay.resultText.textContent = "Identité vérifiée.";
      input.value = data.id;
      statusEl.textContent = "Vérifié";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      overlay.resultText.textContent = "Vérification refusée — réessayez.";
      statusEl.textContent = "Non vérifié";
    }

    showStep(overlay, "result");
  }

  function closeOverlay(session, overlay) {
    session.running = false;
    CameraKit.stopStream(session.stream);
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

      '  <div data-step="id" class="camera-kit-step">',
      '    <div class="camera-kit-video-wrapper camera-kit-kyc-id-wrapper">',
      '      <div class="camera-kit-kyc-id-guide"></div>',
      "    </div>",
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">Annuler</button>',
      '      <button type="button" class="btn btn-primary camera-kit-capture-id">Capturer la pièce d’identité</button>',
      "    </div>",
      "  </div>",

      '  <div data-step="selfie" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-video-wrapper camera-kit-kyc-selfie-wrapper">',
      '      <div class="camera-kit-kyc-face-guide"></div>',
      "    </div>",
      '    <p class="camera-kit-kyc-hint"></p>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-secondary camera-kit-cancel">Annuler</button>',
      '      <button type="button" class="btn btn-link camera-kit-kyc-manual-selfie">Ça ne marche pas, capturer manuellement</button>',
      "    </div>",
      "  </div>",

      '  <div data-step="review" class="camera-kit-step" hidden>',
      '    <div class="camera-kit-kyc-review">',
      '      <img class="camera-kit-kyc-id-preview" alt="Pièce d’identité capturée">',
      '      <img class="camera-kit-kyc-selfie-preview" alt="Selfie capturé">',
      "    </div>",
      '    <p class="camera-kit-kyc-review-status"></p>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-link camera-kit-kyc-restart">Recommencer tout</button>',
      '      <button type="button" class="btn btn-secondary camera-kit-kyc-retake-selfie">Recommencer le selfie</button>',
      '      <button type="button" class="btn btn-success camera-kit-kyc-send">Envoyer</button>',
      "    </div>",
      "  </div>",

      '  <div data-step="result" class="camera-kit-step" hidden>',
      '    <p class="camera-kit-kyc-result"></p>',
      '    <div class="camera-kit-actions">',
      '      <button type="button" class="btn btn-primary camera-kit-kyc-close">Fermer</button>',
      "    </div>",
      "  </div>",
      "</div>",
    ].join("\n");

    // A single <video> element, moved between the id/selfie step wrappers
    // by enterIdStep()/enterSelfieStep() — not two separate elements, so
    // the live stream is always attached to whichever one is visible.
    var video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    var idVideoWrapper = root.querySelector(".camera-kit-kyc-id-wrapper");
    idVideoWrapper.appendChild(video);

    return {
      root: root,
      status: root.querySelector(".camera-kit-status"),
      video: video,
      idVideoWrapper: idVideoWrapper,
      selfieVideoWrapper: root.querySelector(".camera-kit-kyc-selfie-wrapper"),
      hint: root.querySelector(".camera-kit-kyc-hint"),
      captureIdBtn: root.querySelector(".camera-kit-capture-id"),
      restartBtn: root.querySelector(".camera-kit-kyc-restart"),
      manualSelfieBtn: root.querySelector(".camera-kit-kyc-manual-selfie"),
      retakeSelfieBtn: root.querySelector(".camera-kit-kyc-retake-selfie"),
      idPreview: root.querySelector(".camera-kit-kyc-id-preview"),
      selfiePreview: root.querySelector(".camera-kit-kyc-selfie-preview"),
      reviewStatus: root.querySelector(".camera-kit-kyc-review-status"),
      sendBtn: root.querySelector(".camera-kit-kyc-send"),
      resultText: root.querySelector(".camera-kit-kyc-result"),
      closeBtn: root.querySelector(".camera-kit-kyc-close"),
      cancelBtns: Array.prototype.slice.call(root.querySelectorAll(".camera-kit-cancel")),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
