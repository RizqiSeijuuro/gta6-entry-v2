// Boot and the single game loop. Owns the canvas, the camera, every live entity list (player,
// cars — parked, traffic, police and mission — pedestrians, bullets) and wires the other modules
// together each frame: input -> physics/AI -> collisions/combat -> wanted/mission logic -> save ->
// render (world, then HUD, then minimap). The title screen and "continue" flow live here too.
import {
  WORLD_W, WORLD_H, ROAD_SPACING, ROAD_WIDTH, PLAYER_START,
  drawCity, nearestRoadNode, roadNeighbors,
} from './city.js';
import {
  createPlayer, updatePlayerOnFoot, tryPunch, tryShoot, withinPunchCone,
  advanceBullet, damagePlayer, drawPlayer,
} from './player.js';
import { createCar, driveCar, drawCar } from './car.js';
import { spawnPedestrians, updatePedestrian, knockDown, drawPedestrian } from './pedestrians.js';
import {
  createWantedSystem, addCrime, updateWanted, desiredPoliceCount,
  spawnPoliceCar, updatePoliceAI, shouldDespawn, MAX_WANTED,
} from './police.js';
import { createMissionState, currentMissionText, currentMarker, updateMissions, MISSIONS } from './missions.js';
import { drawStartScreen, drawHud, drawMinimap } from './hud.js';
import { createInput } from './input.js';
import { loadGame, saveGame } from './save.js';
import { createAudio } from './audio.js';
import { createRng, randRange, clamp, dist, normalizeAngle, pick } from './utils.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- world population (deterministic)

const CIVILIAN_TYPES = ['sedan', 'taxi', 'muscle', 'suv', 'pickup'];
const worldRng = createRng(0x43415253); // "CARS" — fixed seed so parked/traffic layout never changes.

function roadParkSpot(rng) {
  const axis = rng() < 0.5 ? 'v' : 'h';
  const steps = Math.floor(ROAD_SPACING === 0 ? 0 : WORLD_W / ROAD_SPACING);
  if (axis === 'v') {
    const i = Math.floor(rng() * (steps + 1));
    const side = rng() < 0.5 ? -1 : 1;
    const x = clamp(Math.min(i * ROAD_SPACING, WORLD_W) + side * (ROAD_WIDTH / 2 - 18), 20, WORLD_W - 20);
    const y = randRange(rng, 140, WORLD_H - 140);
    return { x, y, angle: Math.PI / 2 };
  }
  const j = Math.floor(rng() * (steps + 1));
  const side = rng() < 0.5 ? -1 : 1;
  const y = clamp(Math.min(j * ROAD_SPACING, WORLD_H) + side * (ROAD_WIDTH / 2 - 18), 20, WORLD_H - 20);
  const x = randRange(rng, 140, WORLD_W - 140);
  return { x, y: y, angle: 0 };
}

const cars = [];
for (let i = 0; i < 14; i++) {
  const spot = roadParkSpot(worldRng);
  const type = pick(worldRng, CIVILIAN_TYPES);
  cars.push(createCar(type, spot.x, spot.y, spot.angle));
}
for (let i = 0; i < 9; i++) {
  const node = nearestRoadNode(randRange(worldRng, 0, WORLD_W), randRange(worldRng, 0, WORLD_H));
  const type = pick(worldRng, CIVILIAN_TYPES);
  const car = createCar(type, node.x, node.y, 0);
  car.driver = 'ai';
  car.aiNode = node;
  const options = roadNeighbors(node);
  car.aiNext = options.length ? pick(worldRng, options) : node;
  car.angle = Math.atan2(car.aiNext.y - node.y, car.aiNext.x - node.x);
  cars.push(car);
}

const pedestrians = spawnPedestrians(20);

// ---------------------------------------------------------------- game state

const player = createPlayer(PLAYER_START.x, PLAYER_START.y);
const wanted = createWantedSystem();
const mission = createMissionState();
const camera = { x: player.x, y: player.y };
const bullets = [];
let missionCarRef = null;
let shakeMag = 0;
let saveTimer = 4;
let saveFlash = 0;
let toast = '';
let toastTimer = 0;
let toastOk = true;
let showControls = true;
let aggro = 0; // >0 for a while after the player attacks or rams something; makes peds flee
let gameState = 'title'; // 'title' | 'playing'
let elapsed = 0;
let prompt = '';

const existingSave = loadGame();

function shake(mag) {
  shakeMag = Math.max(shakeMag, mag);
}

function notify(text, ok) {
  toast = text;
  toastTimer = 2.6;
  toastOk = ok;
}

function applySave(data) {
  if (!data) return;
  player.x = clamp(data.x ?? player.x, 20, WORLD_W - 20);
  player.y = clamp(data.y ?? player.y, 20, WORLD_H - 20);
  player.cash = data.cash ?? player.cash;
  player.health = data.health ?? player.health;
  mission.index = clamp(data.missionIndex ?? 0, 0, MISSIONS.length);
  mission.stage = data.missionStage ?? 0;
  mission.done = !!data.missionDone;
  camera.x = player.x;
  camera.y = player.y;
}

function doSave() {
  saveGame({
    x: player.x,
    y: player.y,
    cash: player.cash,
    health: player.health,
    missionIndex: mission.index,
    missionStage: mission.stage,
    missionDone: mission.done,
  });
  saveFlash = 1.4;
}

function startGame() {
  audio.unlock();
  audio.uiBeep();
  if (existingSave) applySave(existingSave);
  gameState = 'playing';
}

// ---------------------------------------------------------------- mission <-> world glue

const missionCtx = {
  player,
  isDrivingMissionCar(type) {
    return !!(player.inCar && player.inCar.type === type && player.inCar.isMission);
  },
  spawnMissionCar(type, x, y) {
    const car = createCar(type, x, y, randRange(worldRng, 0, Math.PI * 2), { isMission: true });
    cars.push(car);
    missionCarRef = car;
  },
  addWanted(amount) {
    addCrime(wanted, amount);
    audio.alert(wanted.level);
  },
  notify(text, ok) {
    notify(text, ok);
    audio.chime(ok);
  },
};

// ---------------------------------------------------------------- per-entity helpers

function effectivePlayerPos() {
  return player.inCar ? { x: player.inCar.x, y: player.inCar.y } : { x: player.x, y: player.y };
}

function findJackableCar() {
  let best = null;
  let bestD = Infinity;
  for (const car of cars) {
    if (car.driver === 'player') continue;
    const d = dist(car.x, car.y, player.x, player.y);
    if (d < 46 && d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function driveTowardNode(car, dt, tx, ty) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const desired = Math.atan2(dy, dx);
  const diff = normalizeAngle(desired - car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  const throttle = Math.abs(diff) > 2.0 ? 0.35 : 1;
  driveCar(car, dt, { throttle, steer, brake: false }, shake);
}

// ---------------------------------------------------------------- the frame

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  elapsed += dt;
  input.mouse.worldX = camera.x + (input.mouse.x - canvas.width / 2);
  input.mouse.worldY = camera.y + (input.mouse.y - canvas.height / 2);

  if (gameState === 'title') {
    if (input.wasPressed('Enter') || input.mouse.leftClicked) startGame();
    drawStartScreen(ctx, canvas.width, canvas.height, !!existingSave, elapsed);
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }

  update(dt);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

function update(dt) {
  if (input.wasPressed('h')) showControls = !showControls;
  aggro = Math.max(0, aggro - dt);
  toastTimer = Math.max(0, toastTimer - dt);
  saveFlash = Math.max(0, saveFlash - dt);

  const eff = effectivePlayerPos();
  prompt = '';

  // ---- player: driving or on foot ----
  if (player.inCar) {
    const car = player.inCar;
    let throttle = 0;
    let steer = 0;
    if (input.anyDown('w', 'ArrowUp')) throttle += 1;
    if (input.anyDown('s', 'ArrowDown')) throttle -= 1;
    if (input.anyDown('a', 'ArrowLeft')) steer -= 1;
    if (input.anyDown('d', 'ArrowRight')) steer += 1;
    driveCar(car, dt, { throttle, steer, brake: input.isDown(' ') }, shake);
    audio.updateEngine(Math.abs(car.speed) / car.stats.maxSpeed);
    player.x = car.x;
    player.y = car.y;
    if (input.wasPressed('e')) {
      car.driver = null;
      player.inCar = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.radius + 14);
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.radius + 14);
      audio.stopEngine();
    }
  } else {
    updatePlayerOnFoot(player, dt, input, input.mouse.worldX, input.mouse.worldY);

    if (input.mouse.leftClicked && tryPunch(player)) {
      audio.punch();
      for (const ped of pedestrians) {
        if (ped.state === 'down') continue;
        if (withinPunchCone(player, ped.x, ped.y)) {
          knockDown(ped);
          addCrime(wanted, 12);
          aggro = 2.2;
        }
      }
      for (const car of cars) {
        if (car.driver === 'player') continue;
        if (withinPunchCone(player, car.x, car.y)) {
          car.health = Math.max(0, car.health - 10);
          if (car.isPolice) addCrime(wanted, 30);
        }
      }
    }
    if (input.mouse.rightClicked) {
      const bullet = tryShoot(player);
      if (bullet) {
        bullets.push(bullet);
        audio.shoot();
        aggro = 2.2;
      }
    }

    const jack = findJackableCar();
    if (jack) {
      prompt = `Press E to ${jack.driver ? 'jack' : 'enter'} the ${jack.name}`;
      if (input.wasPressed('e')) {
        if (jack.driver === 'ai') addCrime(wanted, 15);
        else if (jack.driver === 'police-ai') addCrime(wanted, 70);
        if (jack.driver === 'police-ai') audio.alert(wanted.level);
        jack.driver = 'player';
        player.inCar = jack;
        audio.startEngine();
        aggro = 1.2;
      }
    }
  }

  // ---- bullets ----
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (!advanceBullet(b, dt)) {
      bullets.splice(i, 1);
      continue;
    }
    let hit = false;
    for (const ped of pedestrians) {
      if (ped.state === 'down') continue;
      if (dist(b.x, b.y, ped.x, ped.y) < ped.radius + 5) {
        knockDown(ped);
        addCrime(wanted, 22);
        aggro = 2.2;
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const car of cars) {
        if (car.driver === 'player') continue;
        if (dist(b.x, b.y, car.x, car.y) < car.radius) {
          car.health = Math.max(0, car.health - 35);
          if (car.isPolice) addCrime(wanted, 45);
          hit = true;
          break;
        }
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  // ---- traffic AI ----
  for (const car of cars) {
    if (car.driver !== 'ai') continue;
    if (dist(car.x, car.y, car.aiNext.x, car.aiNext.y) < 34) {
      car.aiNode = car.aiNext;
      const options = roadNeighbors(car.aiNode);
      car.aiNext = options.length ? pick(worldRng, options) : car.aiNode;
    }
    driveTowardNode(car, dt, car.aiNext.x, car.aiNext.y);
  }

  // ---- pedestrians (wander, flee, and get run down) ----
  const threat = aggro > 0 || (player.inCar && Math.abs(player.inCar.speed) > 90)
    ? { x: eff.x, y: eff.y, scareRadius: player.inCar ? 150 : 110 }
    : null;
  for (const ped of pedestrians) {
    updatePedestrian(ped, dt, threat);
    if (ped.state !== 'down' && player.inCar && Math.abs(player.inCar.speed) > 70) {
      if (dist(player.inCar.x, player.inCar.y, ped.x, ped.y) < ped.radius + player.inCar.radius * 0.7) {
        knockDown(ped);
        addCrime(wanted, 34);
        audio.alert(wanted.level);
        shake(5);
        aggro = 2.5;
      }
    }
  }

  // ---- police: maintain count, chase, bust on contact ----
  let policeNear = false;
  const desired = desiredPoliceCount(wanted.level);
  const policeCars = cars.filter((c) => c.isPolice);
  for (let i = policeCars.length - 1; i >= 0; i--) {
    const pc = policeCars[i];
    if (wanted.level <= 0 || shouldDespawn(pc, eff.x, eff.y)) {
      const idx = cars.indexOf(pc);
      if (idx >= 0) cars.splice(idx, 1);
      continue;
    }
    const d = updatePoliceAI(pc, dt, eff.x, eff.y, shake);
    if (d < 420) policeNear = true;
    if (d < 42) {
      if (player.inCar) {
        shake(7);
        player.inCar.speed *= -0.4;
        audio.crash();
      } else {
        damagePlayer(player, 10);
        wanted.heat = Math.max(0, wanted.heat - 110);
        wanted.level = Math.min(MAX_WANTED, Math.ceil(wanted.heat / 110));
        notify('Busted! Warned off — lost a star.', false);
        pc.x = eff.x - Math.cos(pc.angle) * 160;
        pc.y = eff.y - Math.sin(pc.angle) * 160;
      }
    }
  }
  const currentCount = cars.filter((c) => c.isPolice).length;
  if (currentCount < desired) {
    cars.push(spawnPoliceCar(eff.x, eff.y));
  }
  updateWanted(wanted, dt, policeNear);
  if (wanted.level > 0) audio.startSiren();
  else audio.stopSiren();
  audio.updateSiren(elapsed);

  // ---- camera ----
  const followX = player.inCar ? player.inCar.x : player.x;
  const followY = player.inCar ? player.inCar.y : player.y;
  const smooth = 1 - Math.exp(-6 * dt);
  camera.x += (followX - camera.x) * smooth;
  camera.y += (followY - camera.y) * smooth;
  shakeMag = Math.max(0, shakeMag - dt * 24);

  // ---- missions ----
  updateMissions(mission, missionCtx);

  // ---- autosave ----
  saveTimer -= dt;
  if (saveTimer <= 0) {
    saveTimer = 6;
    doSave();
  }
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  const sx = (Math.random() - 0.5) * shakeMag;
  const sy = (Math.random() - 0.5) * shakeMag;
  ctx.translate(Math.round(-camera.x + w / 2 + sx), Math.round(-camera.y + h / 2 + sy));

  drawCity(ctx, camera.x, camera.y, w, h);

  // Mission marker: a pulsing ring + label at the active objective.
  const marker = currentMarker(mission);
  if (marker) {
    const pulse = 10 + Math.sin(elapsed * 4) * 4;
    ctx.strokeStyle = '#ffd25c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 30 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd25c';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(marker.label ?? '', marker.x, marker.y - 44);
  }

  for (const car of cars) drawCar(ctx, car);
  for (const ped of pedestrians) drawPedestrian(ctx, ped);
  if (!player.inCar) drawPlayer(ctx, player);

  for (const b of bullets) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const hudState = {
    player,
    wantedLevel: wanted.level,
    wantedFlash: wanted.alertFlash,
    missionText: currentMissionText(mission),
    missionFlash: mission.flash,
    toast,
    toastTimer,
    toastOk,
    saveFlash,
    showControls,
    inCarLabel: player.inCar ? `Driving: ${player.inCar.name}` : 'On foot',
    prompt,
  };
  mission.flash = Math.max(0, mission.flash - 1 / 60);
  drawHud(ctx, w, h, hudState);
  if (prompt) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prompt, w / 2, h - 90);
    ctx.restore();
  }
  drawMinimap(ctx, w, h, {
    player,
    marker,
    policeCars: cars.filter((c) => c.isPolice),
    missionCar: missionCarRef,
  });
}

requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});
