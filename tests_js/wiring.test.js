/**
 * The contract between the Django widget and the browser code: the JSON the
 * widget renders is exactly what the script expects to find.
 *
 * The fixtures are generated from the widgets themselves, and
 * tests/test_widgets.py fails if they drift.
 */
const test = require("node:test");
const assert = require("node:assert");
const { loadScript, loadCameraKit, loadFaceKit, makeWidgetDom, readFixture } = require("./helpers");

test("the scanner binds the container the widget rendered", () => {
  const config = readFixture("scanner_config.json");
  const dom = makeWidgetDom("camera-kit-scanner", "id_file-camera-kit-config", config);
  const sandbox = loadScript("static/django_camera_kit/js/doc_scan.js", {
    CameraKit: loadCameraKit(),
    document: dom.document,
  });

  sandbox.CameraKitScanner.init();

  assert.strictEqual(dom.container.dataset.camerakitBound, "true");
  assert.ok(dom.container.classList.added.indexOf("camera-kit-js-ready") !== -1);
  assert.strictEqual(dom.trigger.listeners.length, 1);
  assert.strictEqual(dom.trigger.listeners[0].name, "click");
});

test("the scanner configuration carries every key the script reads", () => {
  const config = readFixture("scanner_config.json");
  [
    "format",
    "formats",
    "orientation",
    "output",
    "multiPage",
    "batch",
    "autoCapture",
    "allowFormatChange",
    "maxPages",
    "quality",
    "detectionWidth",
    "labels",
  ].forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(config, key), "missing " + key);
  });
});

test("every scanner label the script asks for is translated", () => {
  const labels = readFixture("scanner_config.json").labels;
  [
    "trigger",
    "cancel",
    "start",
    "capture",
    "retake",
    "confirmPage",
    "addPage",
    "finish",
    "deletePage",
    "format",
    "orientation",
    "portrait",
    "landscape",
    "autoCapture",
    "batch",
    "adjustTitle",
    "pagesTitle",
    "pageNumber",
    "pageCount",
    "hintSearching",
    "hintBlurry",
    "hintHoldStill",
    "hintCapturing",
    "hintNextPage",
    "errorCamera",
    "errorEngine",
    "errorMaxPages",
    "errorNoPage",
  ].forEach(function (key) {
    assert.ok(labels[key], "missing label " + key);
  });
});

test("each format the widget offers carries what the guide needs", () => {
  readFixture("scanner_config.json").formats.forEach(function (format) {
    assert.ok(format.key);
    assert.ok(format.label);
    assert.strictEqual(typeof format.aspectRatio, "number");
    assert.ok(["portrait", "landscape"].indexOf(format.naturalOrientation) !== -1);
  });
});

test("the KYC flow binds its container too", () => {
  const config = readFixture("kyc_config.json");
  const dom = makeWidgetDom("camera-kit-kyc", "id_v-camera-kit-kyc-config", config);
  const sandbox = loadScript("kyc/static/django_camera_kit/kyc/js/kyc_capture.js", {
    CameraKit: loadCameraKit(),
    FaceKit: loadFaceKit(),
    document: dom.document,
  });

  sandbox.CameraKitKyc.init();

  assert.strictEqual(dom.container.dataset.camerakitBound, "true");
  assert.strictEqual(dom.trigger.listeners.length, 1);
});

test("every KYC label the script asks for is translated", () => {
  const labels = readFixture("kyc_config.json").labels;
  [
    "trigger",
    "cancel",
    "close",
    "capture",
    "send",
    "restart",
    "retakeFace",
    "idTitle",
    "faceTitle",
    "progress",
    "verifying",
    "verified",
    "rejected",
    "badgeVerified",
    "badgeRejected",
    "hintNoFace",
    "hintCloser",
    "hintFarther",
    "hintCenter",
    "hintFrontal",
    "hintTurnLeft",
    "hintTurnRight",
    "errorCamera",
    "errorEngine",
    "errorNetwork",
    "errorServer",
  ].forEach(function (key) {
    assert.ok(labels[key], "missing label " + key);
  });
});
