import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePose, angle, RepCounter } from "../app/static/pushups.js";

// Feed a list of elbow angles, one frame every 33 ms (30 fps).
function run(angles, counter = new RepCounter()) {
  const events = [];
  angles.forEach((a, i) => {
    const r = counter.push(a, i * 33);
    if (r.event) events.push(r.event);
  });
  return { counter, events };
}

const ramp = (from, to, frames) => Array.from({ length: frames }, (_, i) => from + ((to - from) * i) / (frames - 1));
const rep = (bottom = 75) => [...ramp(170, bottom, 15), ...ramp(bottom, 170, 15)];

test("counts full push-ups", () => {
  const { counter } = run([170, 170, ...rep(), ...rep(), ...rep()]);
  assert.equal(counter.reps, 3);
});

test("does not count until arms are straight first", () => {
  const { counter } = run([80, 80, 80, ...ramp(80, 170, 10)]);
  assert.equal(counter.reps, 0);
});

test("half reps don't count and say so", () => {
  const { counter, events } = run([170, ...rep(120), ...rep(120)]);
  assert.equal(counter.reps, 0);
  assert.ok(events.includes("shallow"));
});

test("lost frames (null) don't reset progress", () => {
  const frames = [170, ...ramp(170, 75, 15), null, null, null, ...ramp(75, 170, 15)];
  assert.equal(run(frames).counter.reps, 1);
});

test("jitter around the threshold counts one rep, not many", () => {
  const jitter = [170, 90, 160, 92, 158, 95, 160, 90, 170];
  const counter = new RepCounter({ smoothing: 1 });
  jitter.forEach((a, i) => counter.push(a, i * 50)); // 50 ms apart: faster than a real rep
  assert.equal(counter.reps, 1);
});

test("angle", () => {
  assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);
  assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })), 180);
});

// Side-on push-up pose: shoulder, elbow, wrist, hip, with the body horizontal.
function pose({ standing = false, wristAbove = false, vis = 0.9 } = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const set = (i, x, y) => { lms[i] = { x, y, visibility: vis }; };
  if (standing) {
    set(11, 0.5, 0.3); set(13, 0.5, 0.45); set(15, 0.5, 0.6); set(23, 0.5, 0.6);
  } else {
    set(11, 0.4, 0.6); set(13, 0.4, 0.7); set(15, 0.4, wristAbove ? 0.4 : 0.8); set(23, 0.7, 0.62);
  }
  return lms;
}

test("accepts a horizontal push-up pose", () => {
  const r = analyzePose(pose());
  assert.equal(r.ok, true);
  assert.equal(Math.round(r.elbow), 180);
});

test("rejects standing up (no cheating with arm curls)", () => {
  assert.equal(analyzePose(pose({ standing: true })).reason, "horizontal");
});

test("rejects hands above shoulders", () => {
  assert.equal(analyzePose(pose({ wristAbove: true })).reason, "hands");
});

test("asks to turn when arms aren't visible", () => {
  assert.equal(analyzePose(pose({ vis: 0.2 })).reason, "arms");
  assert.equal(analyzePose(null).reason, "nobody");
});
