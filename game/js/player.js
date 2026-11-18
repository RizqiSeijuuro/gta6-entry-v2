// The player on foot: WASD movement (strafes freely), mouse-aim facing, building collision, and
// the two combat moves — a short melee punch and a cooldown-limited ranged shot. Hit *detection*
// against pedestrians/cars/police lives in main.js (so this module stays independent of them);
// this file only answers "did the attack fire" and "what does it reach".
import { clamp, circleRectPushOut, normalizeAngle } from './utils.js';
import { buildingsNear, WORLD_W, WORLD_H } from './city.js';

export const PLAYER_SPEED = 172;
export const PUNCH_COOLDOWN = 0.45;
export const PUNCH_RANGE = 46;
export const PUNCH_CONE_DEG = 80;
export const SHOOT_COOLDOWN = 0.35;
export const BULLET_SPEED = 820;
export const BULLET_LIFE = 0.55;

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: 0,
    radius: 12,
    health: 100,
    maxHealth: 100,
    cash: 250,
    inCar: null,
    moving: false,
    walkPhase: 0,
    punchCooldown: 0,
    shootCooldown: 0,
    punchFlash: 0,
    hurtFlash: 0,
    invuln: 0,
  };
}

/** Moves the player by WASD/arrows, strafing freely; faces the mouse world position. Building-collides. */
export function updatePlayerOnFoot(player, dt, input, mouseWorldX, mouseWorldY) {
  let mx = 0;
  let my = 0;
  if (input.anyDown('w', 'ArrowUp')) my -= 1;
  if (input.anyDown('s', 'ArrowDown')) my += 1;
  if (input.anyDown('a', 'ArrowLeft')) mx -= 1;
  if (input.anyDown('d', 'ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my);
  player.moving = len > 0;
  if (len > 0) {
    mx /= len;
    my /= len;
    const nx = player.x + mx * PLAYER_SPEED * dt;
    const ny = player.y + my * PLAYER_SPEED * dt;
    const resolved = resolveBuildingCollision(nx, ny, player.radius);
    player.x = clamp(resolved.x, player.radius, WORLD_W - player.radius);
    player.y = clamp(resolved.y, player.radius, WORLD_H - player.radius);
    player.walkPhase += dt * 9;
  }
  if (mouseWorldX !== undefined) {
    const dx = mouseWorldX - player.x;
    const dy = mouseWorldY - player.y;
    if (Math.hypot(dx, dy) > 1) player.angle = Math.atan2(dy, dx);
  } else if (len > 0) {
    player.angle = Math.atan2(my, mx);
  }

  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.punchFlash = Math.max(0, player.punchFlash - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  player.invuln = Math.max(0, player.invuln - dt);
}

function resolveBuildingCollision(x, y, radius) {
  let rx = x;
  let ry = y;
  for (const b of buildingsNear(rx, ry, radius)) {
    const push = circleRectPushOut(rx, ry, radius, b);
    if (push) {
      rx += push.dx;
      ry += push.dy;
    }
  }
  return { x: rx, y: ry };
}

/** Starts a punch if its cooldown is ready. Returns true when it fired (caller does hit detection). */
export function tryPunch(player) {
  if (player.punchCooldown > 0) return false;
  player.punchCooldown = PUNCH_COOLDOWN;
  player.punchFlash = 0.15;
  return true;
}

/** Fires a ranged shot if its cooldown is ready; returns a bullet object, or null. */
export function tryShoot(player) {
  if (player.shootCooldown > 0) return null;
  player.shootCooldown = SHOOT_COOLDOWN;
  return {
    x: player.x + Math.cos(player.angle) * 18,
    y: player.y + Math.sin(player.angle) * 18,
    angle: player.angle,
    speed: BULLET_SPEED,
    life: BULLET_LIFE,
    owner: 'player',
  };
}

/** Whether a target at (tx, ty) is within punch range and within the facing cone. */
export function withinPunchCone(player, tx, ty) {
  const dx = tx - player.x;
  const dy = ty - player.y;
  const d = Math.hypot(dx, dy);
  if (d > PUNCH_RANGE) return false;
  const angleTo = Math.atan2(dy, dx);
  const diff = Math.abs(normalizeAngle(angleTo - player.angle));
  return diff <= (PUNCH_CONE_DEG * Math.PI) / 180 / 2;
}

/** Advances a bullet's position by dt; returns false once it has expired. */
export function advanceBullet(bullet, dt) {
  bullet.x += Math.cos(bullet.angle) * bullet.speed * dt;
  bullet.y += Math.sin(bullet.angle) * bullet.speed * dt;
  bullet.life -= dt;
  return bullet.life > 0 && bullet.x > 0 && bullet.x < WORLD_W && bullet.y > 0 && bullet.y < WORLD_H;
}

export function damagePlayer(player, amount) {
  if (player.invuln > 0) return;
  player.health = clamp(player.health - amount, 0, player.maxHealth);
  player.hurtFlash = 0.25;
  player.invuln = 0.5;
}

/** Draws the player on foot: body, facing indicator, and a brief punch-flash arc. */
export function drawPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(player.angle);
  const bob = player.moving ? Math.sin(player.walkPhase) * 1.5 : 0;
  ctx.fillStyle = player.hurtFlash > 0 ? '#ff5b5b' : '#3da8f5';
  ctx.beginPath();
  ctx.arc(0, bob, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Facing wedge (eyes/nose), and arm.
  ctx.fillStyle = '#ffe3a8';
  ctx.beginPath();
  ctx.arc(8, bob, 4, 0, Math.PI * 2);
  ctx.fill();

  if (player.punchFlash > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, bob, PUNCH_RANGE * 0.9, (-PUNCH_CONE_DEG * Math.PI) / 360, (PUNCH_CONE_DEG * Math.PI) / 360);
    ctx.stroke();
  }
  ctx.restore();
}
