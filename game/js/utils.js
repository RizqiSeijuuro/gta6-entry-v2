// Small shared math helpers used by every system: vectors, collision tests and a seeded
// pseudo-random number generator so the city layout is identical on every load (the world is
// never saved to localStorage, only the player's progress is, so it must regenerate the same way).

/** Clamp `v` into [lo, hi]. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation from `a` to `b` by `t` in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest-path interpolation between two angles (radians), avoiding the long way around. */
export function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

/** Euclidean distance between two points. */
export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Squared distance (cheaper when only comparing). */
export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Normalizes an angle (radians) into (-PI, PI]. */
export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Whether a circle (cx, cy, r) overlaps an axis-aligned rect {x, y, w, h}. */
export function circleRectOverlap(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return dist2(cx, cy, nx, ny) <= r * r;
}

/** The push-out vector (dx, dy) that moves a circle (cx, cy, r) fully outside `rect`, or null. */
export function circleRectPushOut(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d = Math.hypot(dx, dy);
  if (d >= r) return null;
  if (d > 0.0001) {
    const push = r - d;
    return { dx: (dx / d) * push, dy: (dy / d) * push };
  }
  // Circle's center is exactly inside the rect: push out along the shallowest axis.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { dx: -(left + r), dy: 0 };
  if (m === right) return { dx: right + r, dy: 0 };
  if (m === top) return { dx: 0, dy: -(top + r) };
  return { dx: 0, dy: bottom + r };
}

/** Whether a point lies inside an axis-aligned rect {x, y, w, h}. */
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** Whether two axis-aligned rects overlap. */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** A seedable, deterministic PRNG (mulberry32): same seed, same sequence, every time. */
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks a random element of a non-empty array using `rng`. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** A random number in [lo, hi) using `rng`. */
export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Formats a number of seconds as a short duration string, e.g. "3.2s". */
export function fmt1(n) {
  return Math.round(n * 10) / 10;
}
