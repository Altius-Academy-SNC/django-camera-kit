/**
 * Load a browser file of the package into a fresh VM context.
 *
 * The scan and KYC files are plain IIFEs that publish their API on `window`,
 * so the pure geometry they contain can be tested without a browser, a
 * camera, or OpenCV.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "django_camera_kit");

function makeElement(tag) {
  let text = "";
  const element = {
    tagName: tag,
    style: {},
    dataset: {},
    className: "",
    children: [],
    hidden: false,
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    insertBefore(child) {
      element.children.unshift(child);
      return child;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    remove() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    },
  };
  Object.defineProperty(element, "textContent", {
    get() {
      return text;
    },
    set(value) {
      text = String(value);
      element.innerHTML = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },
  });
  return element;
}

/** A container as the widget renders it, wired to its JSON configuration. */
function makeWidgetDom(className, configId, config) {
  const trigger = makeElement("button");
  trigger.className = className + "-trigger";
  trigger.listeners = [];
  trigger.addEventListener = function (name, handler) {
    trigger.listeners.push({ name: name, handler: handler });
  };

  const input = makeElement("input");
  input.type = className === "camera-kit-kyc" ? "hidden" : "file";
  input.name = "document";

  const container = makeElement("div");
  container.className = className;
  container.dataset = { cameraKitConfig: configId };
  container.classList = {
    added: [],
    add(name) {
      container.classList.added.push(name);
    },
  };
  container.querySelector = function (selector) {
    if (selector.indexOf("trigger") !== -1) return trigger;
    if (selector.indexOf("input") !== -1) return input;
    return null;
  };

  const document_ = makeDocument();
  document_.querySelectorAll = function () {
    return [container];
  };
  document_.getElementById = function (id) {
    return id === configId ? { textContent: JSON.stringify(config) } : null;
  };
  return { container: container, trigger: trigger, input: input, document: document_ };
}

function makeDocument() {
  return {
    readyState: "complete",
    currentScript: null,
    cookie: "",
    body: makeElement("body"),
    createElement: makeElement,
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  };
}

function loadScript(relativePath, extras) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const sandbox = Object.assign({ console: console }, extras || {});
  sandbox.window = sandbox;
  sandbox.document = sandbox.document || makeDocument();
  sandbox.navigator = sandbox.navigator || { mediaDevices: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

function loadCameraKit() {
  return loadScript("static/django_camera_kit/js/camera_kit.js").CameraKit;
}

function loadScanner() {
  return loadScript("static/django_camera_kit/js/doc_scan.js", {
    CameraKit: loadCameraKit(),
  }).CameraKitScanner;
}

function loadFaceKit() {
  return loadScript("kyc/static/django_camera_kit/kyc/js/face_kit.js", {
    CameraKit: loadCameraKit(),
  }).FaceKit;
}

function loadKyc() {
  return loadScript("kyc/static/django_camera_kit/kyc/js/kyc_capture.js", {
    CameraKit: loadCameraKit(),
    FaceKit: loadFaceKit(),
  }).CameraKitKyc;
}

/** Values crossing a VM realm keep another realm's prototypes; strip them. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
}

module.exports = {
  plain: plain,
  readFixture: readFixture,
  makeWidgetDom: makeWidgetDom,
  makeElement: makeElement,
  makeDocument: makeDocument,
  loadScript: loadScript,
  loadCameraKit: loadCameraKit,
  loadScanner: loadScanner,
  loadFaceKit: loadFaceKit,
  loadKyc: loadKyc,
};
