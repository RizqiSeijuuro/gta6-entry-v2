// Vehicles: arcade-style physics (accelerate, brake/reverse, steer — speed-dependent turning,
// momentum and friction), drawing, and the shared "jack this car" logic used for both empty parked
// cars and ones with a driver already in them (pedestrian or police).
import { clamp, normalizeAngle, circleRectPushOut, dist } from './utils.js';
import { buildingsNear, WORLD_W, WORLD_H } from './city.js';

/** Stat blocks and palettes per car type. Collision radius is roughly the car's half-diagonal. */
export const CAR_TYPES = {
  sedan: { w: 46, h: 24, maxSpeed: 320, accel: 240, brake: 420, turnRate: 3.2, color: '#9aa0a6', label: 'Sedan' },
  taxi: { w: 46, h: 24, maxSpeed: 300, accel: 220, brake: 400, turnRate: 3.0, color: '#f2c744', label: 'Cab' },
  muscle: { w: 50, h: 25, maxSpeed: 420, accel: 320, brake: 460, turnRate: 2.8, color: '#c1452d', label: 'Stormcoupe' },
  suv: { w: 50, h: 27, maxSpeed: 300, accel: 200, brake: 380, turnRate: 2.4, color: '#4c6b4f', label: 'Trailhauler' },
  pickup: { w: 50, h: 26, maxSpeed: 280, accel: 190, brake: 360, turnRate: 2.5, color: '#8a6a4a', label: 'Rustbucket' },
  police: { w: 48, h: 25, maxSpeed: 360, accel: 300, brake: 460, turnRate: 3.3, color: '#1c2a3a', label: 'Patrol' },
  nightshade: { w: 50, h: 24, maxSpeed: 460, accel: 360, brake: 480, turnRate: 3.0, color: '#5b2e8f', label: 'Nightshade GT' },
};

let nextId = 1;

/** Creates a vehicle at (x, y) facing `angle` radians. `opts.isPolice` marks it for the wanted system. */
export function createCar(typeId, x, y, angle = 0, opts = {}) {
  const stats = CAR_TYPES[typeId];
  return {
    id: nextId++,
    type: typeId,
    stats,
    x,
    y,
    angle,
    speed: 0, // signed, along heading
    health: 100,
    driver: null, // 'player' | pedestrian object | 'police-ai' | null
    isPolice: !!opts.isPolice,
    isMission: !!opts.isMission,
    radius: Math.hypot(stats.w, stats.h) / 2,
    flashTimer: 0,
    nodeTarget: null, // used by traffic / police AI (city road graph)
    wanderCooldown: 0,
    name: opts.name ?? stats.label,
  };
}

/** Advances a car's physics by dt seconds given {throttle, steer, brake} each roughly in [-1, 1]. */
export function driveCar(car, dt, controls, shake) {
  const { stats } = car;
  const throttle = clamp(controls.throttle ?? 0, -1, 1);
  const steer = clamp(controls.steer ?? 0, -1, 1);
  const braking = !!controls.brake;

  if (braking && car.speed !== 0) {
    const brakeDir = car.speed > 0 ? -1 : 1;
    car.speed += brakeDir * stats.brake * dt;
    if (Math.abs(car.speed) < 6) car.speed = 0;
  } else {
    car.speed += throttle * stats.accel * dt;
  }
  // Rolling friction, always a little, so the car coasts to a stop.
  const friction = 60;
  if (car.speed > 0) car.speed = Math.max(0, car.speed - friction * dt);
  else if (car.speed < 0) car.speed = Math.min(0, car.speed + friction * dt);
  car.speed = clamp(car.speed, -stats.maxSpeed * 0.55, stats.maxSpeed);

  // Turning needs some speed (a parked car doesn't pivot); scale down near-zero speed.
  const speedFrac = clamp(Math.abs(car.speed) / stats.maxSpeed, 0, 1);
  const turnFactor = 0.25 + 0.75 * Math.min(1, speedFrac * 2.2);
  const dir = car.speed < 0 ? -1 : 1;
  car.angle += steer * stats.turnRate * turnFactor * dir * dt;
  car.angle = normalizeAngle(car.angle);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;

  // Collide with buildings: stop dead and lose a little speed/health, shake the camera.
  let blocked = false;
  for (const b of buildingsNear(nx, ny, car.radius * 0.8)) {
    const push = circleRectPushOut(nx, ny, car.radius * 0.8, b);
    if (push) {
      blocked = true;
      break;
    }
  }
  if (blocked) {
    if (Math.abs(car.speed) > 60 && shake) shake(Math.min(10, Math.abs(car.speed) / 40));
    car.speed *= -0.25;
    car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.02);
  } else {
    car.x = clamp(nx, car.radius, WORLD_W - car.radius);
    car.y = clamp(ny, car.radius, WORLD_H - car.radius);
  }
  car.flashTimer += dt;
}

/** Whether `x,y` is close enough to a car to enter/jack it. */
export function nearCar(car, x, y, range = 46) {
  return dist(car.x, car.y, x, y) <= range;
}

/** Draws one car in world space: body, windows, headlights, and police light bar when relevant. */
export function drawCar(ctx, car, cameraSpeedGlow) {
  const { stats } = car;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Faint motion glow behind a fast-moving car (a cheap "speed" particle effect).
  if (Math.abs(car.speed) > 140) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(-stats.w * 0.7, 0, stats.w * 0.6, stats.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-stats.w / 2 + 2, -stats.h / 2 + 3, stats.w, stats.h);

  ctx.fillStyle = car.health < 35 ? shade(stats.color, -40) : stats.color;
  ctx.fillRect(-stats.w / 2, -stats.h / 2, stats.w, stats.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-stats.w / 2, -stats.h / 2, stats.w, stats.h);

  // Windshield
  ctx.fillStyle = 'rgba(190,220,235,0.7)';
  ctx.fillRect(stats.w * 0.05, -stats.h / 2 + 3, stats.w * 0.28, stats.h - 6);

  // Headlights (front = local +x)
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(stats.w / 2 - 4, -stats.h / 2 + 2, 4, 5);
  ctx.fillRect(stats.w / 2 - 4, stats.h / 2 - 7, 4, 5);
  if (Math.abs(car.speed) > 20) {
    ctx.fillStyle = 'rgba(255,244,190,0.18)';
    ctx.beginPath();
    ctx.moveTo(stats.w / 2, -stats.h / 2 + 4);
    ctx.lineTo(stats.w / 2 + 60, -stats.h / 2 - 8);
    ctx.lineTo(stats.w / 2 + 60, stats.h / 2 + 8);
    ctx.lineTo(stats.w / 2, stats.h / 2 - 4);
    ctx.closePath();
    ctx.fill();
  }

  // Taillights (rear = local -x)
  ctx.fillStyle = '#d6392f';
  ctx.fillRect(-stats.w / 2, -stats.h / 2 + 2, 4, 5);
  ctx.fillRect(-stats.w / 2, stats.h / 2 - 7, 4, 5);

  if (car.isPolice) {
    const on = Math.floor(car.flashTimer * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff3b3b' : '#2b5bff';
    ctx.fillRect(-6, -stats.h / 2 - 5, 12, 5);
  }
  if (car.isMission) {
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-stats.w / 2 - 3, -stats.h / 2 - 3, stats.w + 6, stats.h + 6);
  }
  if (car.driver === 'player') {
    ctx.strokeStyle = '#3da8f5';
    ctx.lineWidth = 2;
    ctx.strokeRect(-stats.w / 2 - 5, -stats.h / 2 - 5, stats.w + 10, stats.h + 10);
  }
  ctx.restore();

  if (car.isPolice && Math.abs(car.speed) > 10) {
    ctx.save();
    ctx.translate(car.x, car.y - stats.h - 10);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#ff5b5b';
    ctx.textAlign = 'center';
    ctx.fillText('', 0, 0);
    ctx.restore();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 0xff) + amt;
  let b = (n & 0xff) + amt;
  r = clamp(r, 0, 255);
  g = clamp(g, 0, 255);
  b = clamp(b, 0, 255);
  return `rgb(${r},${g},${b})`;
}
