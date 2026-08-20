/** Geometry behind the scanner: ordering, scoring, output size. */
const test = require("node:test");
const assert = require("node:assert");
const { loadCameraKit, plain } = require("./helpers");

const CameraKit = loadCameraKit();

const A4 = 210 / 297;
const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

function quadOfRatio(width, height) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

test("orderCorners sorts any input into top-left, top-right, bottom-right, bottom-left", () => {
  const shuffled = [
    { x: 100, y: 100 },
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ];
  assert.deepStrictEqual(plain(CameraKit.orderCorners(shuffled)), SQUARE);
});

test("quadArea measures the surface, not the bounding box", () => {
  assert.strictEqual(CameraKit.quadArea(SQUARE), 10000);
});

test("normalizedRatio never depends on orientation", () => {
  assert.strictEqual(CameraKit.normalizedRatio(210, 297), CameraKit.normalizedRatio(297, 210));
  assert.strictEqual(CameraKit.normalizedRatio(0, 297), 0);
});

test("ratioScore accepts a match and refuses what is out of tolerance", () => {
  assert.strictEqual(CameraKit.ratioScore(A4, A4, 0.2), 1);
  assert.ok(CameraKit.ratioScore(A4 * 0.95, A4, 0.2) < 1);
  assert.strictEqual(CameraKit.ratioScore(0.95, A4, 0.2), -1);
});

test("scoreQuad refuses a shape that covers too little of the frame", () => {
  const small = quadOfRatio(20, 28);
  assert.strictEqual(CameraKit.scoreQuad(small, 1000, 1000, {}), null);
});

test("scoreQuad refuses a shape that is not the requested format", () => {
  const square = quadOfRatio(800, 800);
  assert.strictEqual(CameraKit.scoreQuad(square, 1000, 1000, { targetRatio: A4 }), null);
});

test("scoreQuad accepts the requested format and rates it", () => {
  const sheet = quadOfRatio(700, 990);
  const result = CameraKit.scoreQuad(sheet, 1000, 1000, { targetRatio: A4 });
  assert.ok(result);
  assert.ok(result.score > 0);
  assert.ok(Math.abs(result.ratio - A4) < 0.01);
});

test("scoreQuad prefers the candidate closest to the format", () => {
  const exact = CameraKit.scoreQuad(quadOfRatio(700, 990), 1000, 1000, { targetRatio: A4 });
  const off = CameraKit.scoreQuad(quadOfRatio(700, 900), 1000, 1000, { targetRatio: A4 });
  assert.ok(exact.score > off.score);
});

test("outputSize forces the format proportions on a portrait page", () => {
  const size = CameraKit.outputSize(quadOfRatio(700, 900), A4);
  assert.ok(Math.abs(size.width / size.height - A4) < 0.01);
});

test("outputSize keeps a landscape capture landscape", () => {
  const size = CameraKit.outputSize(quadOfRatio(900, 700), A4);
  assert.ok(size.width > size.height);
  assert.ok(Math.abs(size.height / size.width - A4) < 0.01);
});

test("outputSize without a format keeps the measured size", () => {
  const size = CameraKit.outputSize(quadOfRatio(640, 480), 0);
  assert.deepStrictEqual(plain(size), { width: 640, height: 480 });
});

test("outputSize never loses resolution", () => {
  const size = CameraKit.outputSize(quadOfRatio(1000, 1200), A4);
  assert.ok(Math.max(size.width, size.height) >= 1200);
});

test("scaleCorners maps detection coordinates back to the full frame", () => {
  const scaled = CameraKit.scaleCorners(SQUARE, 4);
  assert.deepStrictEqual(plain(scaled[2]), { x: 400, y: 400 });
});
