/** The guide rectangle is what tells the user where to put the paper. */
const test = require("node:test");
const assert = require("node:assert");
const { loadScanner } = require("./helpers");

const Scanner = loadScanner();
const A4 = 210 / 297;

test("the guide keeps the requested proportions", () => {
  const rect = Scanner.guideRect(1000, 1000, A4);
  assert.ok(Math.abs(rect.width / rect.height - A4) < 0.001);
});

test("the guide is centred in the frame", () => {
  const rect = Scanner.guideRect(1000, 800, A4);
  assert.ok(Math.abs(rect.x + rect.width / 2 - 500) < 0.001);
  assert.ok(Math.abs(rect.y + rect.height / 2 - 400) < 0.001);
});

test("the guide never overflows the frame", () => {
  [
    [1920, 1080],
    [720, 1280],
    [640, 640],
  ].forEach(function (size) {
    const rect = Scanner.guideRect(size[0], size[1], A4);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= size[0] + 0.001);
    assert.ok(rect.y + rect.height <= size[1] + 0.001);
  });
});

test("a landscape format gives a landscape guide", () => {
  const rect = Scanner.guideRect(1000, 1000, 1 / A4);
  assert.ok(rect.width > rect.height);
});

test("without a format the guide is a plain margin", () => {
  const rect = Scanner.guideRect(1000, 500, 0);
  assert.ok(rect.width > 0 && rect.height > 0);
  assert.ok(rect.x > 0 && rect.y > 0);
});

test("labels interpolate their placeholders", () => {
  const labels = { pageCount: "{count} page(s)", plain: "Cancel" };
  assert.strictEqual(Scanner.format(labels, "pageCount", { count: 3 }), "3 page(s)");
  assert.strictEqual(Scanner.format(labels, "plain"), "Cancel");
});

test("an unknown label falls back to its key instead of throwing", () => {
  assert.strictEqual(Scanner.format({}, "missing"), "missing");
});
