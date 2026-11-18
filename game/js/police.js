// The wanted-level / police system: crimes add "heat", heat maps to 0-5 wanted stars, heat cools
// down on its own and faster while the player has evaded every police car for a few seconds, and
// police cars are spawned/steered to chase the player's current position (on foot or driving).
import { createCar, driveCar } from './car.js';
import { nearestRoadNode, roadNeighbors, WORLD_W, WORLD_H } from './city.js';
import { normalizeAngle, dist, clamp, pick } from './utils.js';

export const MAX_WANTED = 5;
const HEAT_PER_STAR = 110;
const MAX_HEAT = HEAT_PER_STAR * MAX_WANTED;
const EVADE_SECONDS = 9; // how long with no police nearby before heat starts cooling fast
const PASSIVE_DECAY = 1.4; // heat/sec, always, even while chased (keeps a chase from lasting forever)
const CHASE_LOST_RADIUS = 1500; // a police car this far from the player gives up and despawns

export function createWantedSystem() {
  return { heat: 0, level: 0, evadeTimer: 0, alertFlash: 0 };
}

/** Raises heat by `amount` (a crime just happened) and bumps the wanted stars if a threshold is crossed. */
export function addCrime(system, amount) {
  const before = system.level;
  system.heat = clamp(system.heat + amount, 0, MAX_HEAT);
  system.evadeTimer = 0;
  system.level = Math.min(MAX_WANTED, Math.floor(system.heat / HEAT_PER_STAR) + (system.heat % HEAT_PER_STAR > 0 ? 1 : 0));
  if (system.level > before) system.alertFlash = 0.6;
  return system.level > before;
}

/** Cools heat over time; `policeNear` is true while any police car is close enough to "see" the player. */
export function updateWanted(system, dt, policeNear) {
  system.alertFlash = Math.max(0, system.alertFlash - dt);
  if (system.heat <= 0) {
    system.level = 0;
    return;
  }
  let decay = PASSIVE_DECAY;
  if (!policeNear) {
    system.evadeTimer += dt;
    if (system.evadeTimer > EVADE_SECONDS) decay += 26; // shook the tail: heat drops fast
  } else {
    system.evadeTimer = 0;
  }
  system.heat = clamp(system.heat - decay * dt, 0, MAX_HEAT);
  system.level = Math.min(MAX_WANTED, Math.ceil(system.heat / HEAT_PER_STAR));
}

/** How many police cars should be roaming after the player right now, given the wanted level. */
export function desiredPoliceCount(level) {
  if (level <= 0) return 0;
  return Math.min(level, 4);
}

/** Spawns a police car on the road grid, a little way off from (nearX, nearY) so it drives into view. */
export function spawnPoliceCar(nearX, nearY) {
  const base = nearestRoadNode(nearX, nearY);
  let node = base;
  for (let i = 0; i < 3; i++) {
    const options = roadNeighbors(node);
    if (options.length) node = pick(Math.random, options);
  }
  const x = clamp(node.x, 40, WORLD_W - 40);
  const y = clamp(node.y, 40, WORLD_H - 40);
  const car = createCar('police', x, y, Math.random() * Math.PI * 2, { isPolice: true });
  car.driver = 'police-ai';
  return car;
}

/** Simple pursuit steering: turns and accelerates toward (targetX, targetY). Returns distance to target. */
export function updatePoliceAI(car, dt, targetX, targetY, shake) {
  const dx = targetX - car.x;
  const dy = targetY - car.y;
  const d = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  const diff = normalizeAngle(desired - car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  const throttle = Math.abs(diff) > 2.2 ? 0.2 : 1;
  driveCar(car, dt, { throttle, steer, brake: false }, shake);
  return d;
}

/** Whether a police car should be recycled: too far from the player and the chase is pointless. */
export function shouldDespawn(car, playerX, playerY) {
  return dist(car.x, car.y, playerX, playerY) > CHASE_LOST_RADIUS;
}
