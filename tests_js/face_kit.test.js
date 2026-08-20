/** Head pose and framing, the two signals the KYC flow reacts to. */
const test = require("node:test");
const assert = require("node:assert");
const { loadFaceKit } = require("./helpers");

const FaceKit = loadFaceKit();

function face(noseX, options) {
  const opts = options || {};
  return {
    x: opts.x === undefined ? 30 : opts.x,
    y: opts.y === undefined ? 30 : opts.y,
    width: opts.width === undefined ? 60 : opts.width,
    height: opts.height === undefined ? 80 : opts.height,
    centerX: opts.centerX === undefined ? 60 : opts.centerX,
    centerY: opts.centerY === undefined ? 70 : opts.centerY,
    landmarks: {
      rightEye: { x: 40, y: 50 },
      leftEye: { x: 80, y: 50 },
      nose: { x: noseX, y: 70 },
      rightMouth: { x: 45, y: 90 },
      leftMouth: { x: 75, y: 90 },
    },
  };
}

const GUIDE = { x: 10, y: 10, width: 100, height: 120 };

test("a face looking at the camera measures a yaw near zero", () => {
  assert.ok(Math.abs(FaceKit.estimateYaw(face(60))) < 0.01);
  assert.ok(FaceKit.isFrontal(face(60)));
});

test("turning to the user's left gives a positive yaw", () => {
  const yaw = FaceKit.estimateYaw(face(72));
  assert.ok(yaw >= FaceKit.YAW_TURNED, "expected a turn, got " + yaw);
  assert.ok(FaceKit.isTurned(face(72), FaceKit.YAW_USER_LEFT));
  assert.ok(!FaceKit.isTurned(face(72), FaceKit.YAW_USER_RIGHT));
});

test("turning to the user's right gives a negative yaw", () => {
  assert.ok(FaceKit.isTurned(face(48), FaceKit.YAW_USER_RIGHT));
  assert.ok(!FaceKit.isFrontal(face(48)));
});

test("a missing face measures nothing instead of throwing", () => {
  assert.strictEqual(FaceKit.estimateYaw(null), 0);
  assert.strictEqual(FaceKit.estimateRoll(null), 0);
});

test("a tilted head is reported by the roll", () => {
  const tilted = face(60);
  tilted.landmarks.leftEye = { x: 80, y: 70 };
  assert.ok(Math.abs(FaceKit.estimateRoll(tilted)) > 15);
});

test("framing asks the user to come closer when the face is small", () => {
  assert.deepStrictEqual(
    { ok: false, reason: "small" },
    JSON.parse(JSON.stringify(FaceKit.framing(face(60, { width: 20 }), GUIDE)))
  );
});

test("framing asks the user to move back when the face fills the guide", () => {
  assert.strictEqual(FaceKit.framing(face(60, { width: 200 }), GUIDE).reason, "large");
});

test("framing asks the user to centre an off-axis face", () => {
  assert.strictEqual(FaceKit.framing(face(60, { centerX: 20 }), GUIDE).reason, "offset");
});

test("framing accepts a well-placed face", () => {
  const result = FaceKit.framing(face(60, { width: 60, centerX: 60, centerY: 70 }), GUIDE);
  assert.strictEqual(result.ok, true);
});

test("framing reports a missing face", () => {
  assert.strictEqual(FaceKit.framing(null, GUIDE).reason, "none");
});
