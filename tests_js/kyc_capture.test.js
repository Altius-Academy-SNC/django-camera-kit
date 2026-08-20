/** The challenge sequence and the guides it draws. */
const test = require("node:test");
const assert = require("node:assert");
const { loadKyc } = require("./helpers");

const Kyc = loadKyc();
const ID1 = 85.6 / 53.98;

test("the guide keeps its ratio and stays inside the frame", () => {
  const box = Kyc.guideBox(1000, 600, ID1, 0.82, 0.82);
  assert.ok(Math.abs(box.width / box.height - ID1) < 0.001);
  assert.ok(box.x >= 0 && box.y >= 0);
  assert.ok(box.x + box.width <= 1000.001);
  assert.ok(box.y + box.height <= 600.001);
});

test("the guide shrinks when the frame is too short for it", () => {
  const box = Kyc.guideBox(1000, 200, ID1, 0.9, 0.9);
  assert.ok(box.height <= 180.001);
  assert.ok(Math.abs(box.width / box.height - ID1) < 0.001);
});

test("the guide is centred", () => {
  const box = Kyc.guideBox(800, 800, 1, 0.5, 0.5);
  assert.ok(Math.abs(box.x + box.width / 2 - 400) < 0.001);
  assert.ok(Math.abs(box.y + box.height / 2 - 400) < 0.001);
});

test("a challenge sequence always starts facing the camera", () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const challenges = Kyc.buildChallenges();
    assert.strictEqual(challenges.length, 3);
    assert.strictEqual(challenges[0].key, "frontal");
    const keys = challenges.map(function (item) {
      return item.key;
    });
    assert.ok(keys.indexOf("left") > 0);
    assert.ok(keys.indexOf("right") > 0);
  }
});

test("the two turns are not always asked in the same order", () => {
  const orders = new Set();
  for (let attempt = 0; attempt < 50; attempt++) {
    orders.add(Kyc.buildChallenges()[1].key);
  }
  assert.strictEqual(orders.size, 2, "the challenge order never varied");
});

test("each turn carries the direction its analysis needs", () => {
  const challenges = Kyc.buildChallenges();
  challenges.forEach(function (challenge) {
    if (challenge.key === "left") assert.ok(challenge.direction > 0);
    if (challenge.key === "right") assert.ok(challenge.direction < 0);
    if (challenge.key === "frontal") assert.strictEqual(challenge.direction, 0);
  });
});
