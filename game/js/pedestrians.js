// AI pedestrians: each wanders between random walkable points in its district, occasionally
// crossing a road, flees when the player (on foot or in a car) gets close and aggressive, and
// is knocked down (briefly) rather than gone when hit — it gets back up and wanders off again.
import { createRng, dist, randRange, clamp } from './utils.js';
import { DISTRICTS, isFreeOfBuildings } from './city.js';

const COLORS = ['#e3b089', '#caa06f', '#8a5a3b', '#f0d2a8', '#6e4a36', '#d9a4c0', '#7fa8c9'];

let nextId = 1;
const rng = createRng(0x50454453); // "PEDS" — deterministic initial placement/colours.

function randomWalkablePoint(district) {
  const r = district.rect;
  for (let tries = 0; tries < 12; tries++) {
    const x = randRange(rng, r.x + 40, r.x + r.w - 40);
    const y = randRange(rng, r.y + 40, r.y + r.h - 40);
    if (isFreeOfBuildings(x, y, 14)) return { x, y };
  }
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Creates `count` pedestrians spread across all districts. */
export function spawnPedestrians(count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const district = DISTRICTS[i % DISTRICTS.length];
    const start = randomWalkablePoint(district);
    const target = randomWalkablePoint(district);
    peds.push({
      id: nextId++,
      x: start.x,
      y: start.y,
      angle: 0,
      speed: randRange(rng, 34, 58),
      target,
      district,
      color: COLORS[Math.floor(rng() * COLORS.length)],
      state: 'walk', // 'walk' | 'flee' | 'down'
      downTimer: 0,
      radius: 11,
    });
  }
  return peds;
}

/** Knocks a pedestrian down (hit by a car, punched, or shot) for a few seconds. */
export function knockDown(ped) {
  ped.state = 'down';
  ped.downTimer = 3 + Math.random() * 1.5;
}

/** Advances one pedestrian's AI and movement by dt seconds. `threat` is {x, y} or null (the player). */
export function updatePedestrian(ped, dt, threat) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.target = randomWalkablePoint(ped.district);
    }
    return;
  }

  if (threat) {
    const d = dist(ped.x, ped.y, threat.x, threat.y);
    if (d < threat.scareRadius) ped.state = 'flee';
    else if (ped.state === 'flee' && d > threat.scareRadius * 1.8) ped.state = 'walk';
  }

  let dx, dy;
  if (ped.state === 'flee' && threat) {
    dx = ped.x - threat.x;
    dy = ped.y - threat.y;
  } else {
    dx = ped.target.x - ped.x;
    dy = ped.target.y - ped.y;
    if (Math.hypot(dx, dy) < 14) {
      ped.target = randomWalkablePoint(ped.district);
      return;
    }
  }
  const len = Math.hypot(dx, dy) || 1;
  const vx = (dx / len) * ped.speed * (ped.state === 'flee' ? 2.1 : 1);
  const vy = (dy / len) * ped.speed * (ped.state === 'flee' ? 2.1 : 1);
  ped.angle = Math.atan2(vy, vx);
  const r = ped.district.rect;
  ped.x = clamp(ped.x + vx * dt, r.x + 10, r.x + r.w - 10);
  ped.y = clamp(ped.y + vy * dt, r.y + 10, r.y + r.h - 10);
}

/** Draws one pedestrian: a small walking figure, grey and prone while knocked down. */
export function drawPedestrian(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#777';
    ctx.fillRect(-10, -5, 20, 10);
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.state === 'flee' ? '#ffdd55' : ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.beginPath();
  ctx.arc(4, -2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
