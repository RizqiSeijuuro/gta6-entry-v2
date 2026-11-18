// The mission chain: an original four-job story for getaway driver Jonah "Birdie" Alvarez,
// working for fixer Marisol Reyes out of her chop shop, Tideline Customs. Each mission has a
// marker, an objective, and unlocks the next on completion. This module only tracks state and
// checks completion; main.js supplies the few things it needs from the live world (the player,
// spawning a car, raising the wanted level, showing a toast).
import { LANDMARKS } from './city.js';
import { dist } from './utils.js';

const MARKER_RADIUS = 55;

export const MISSIONS = [
  {
    id: 'meet-fixer',
    title: 'Meet the Fixer',
    brief: 'New in town. Marisol "Fix" Reyes has work at Tideline Customs, out in the Marina.',
    objective: 'Get to Tideline Customs',
    marker: () => LANDMARKS.tidelineCustoms,
    reward: 50,
  },
  {
    id: 'parts-run',
    title: 'Parts Run',
    brief: 'Marisol needs the Rustbucket moved from the Rustwater Yard to Tideline Customs.',
    objective: 'Drive the Rustbucket to Tideline Customs',
    marker: () => LANDMARKS.tidelineCustoms,
    spawnAt: () => LANDMARKS.industrialYard,
    vehicle: 'pickup',
    reward: 150,
  },
  {
    id: 'hot-load',
    title: 'Hot Load',
    brief: 'Pick up the package at the Downtown dead-drop. Word is it is being watched.',
    objective: 'Get to the Downtown dead-drop',
    objective2: 'Shake the tail — get to the Hollow Safehouse',
    marker: () => LANDMARKS.deadDrop,
    marker2: () => LANDMARKS.safehouse,
    heatOnPickup: 140,
    reward: 300,
  },
  {
    id: 'last-favor',
    title: 'Last Favor',
    brief: 'One more job: the Nightshade GT is sitting in the Downtown VIP lot. Bring it to the scrapyard.',
    objective: 'Steal the Nightshade GT and deliver it to the scrapyard hideout',
    marker: () => LANDMARKS.scrapyardHideout,
    spawnAt: () => LANDMARKS.vipSpot,
    vehicle: 'nightshade',
    reward: 500,
  },
];

export function createMissionState() {
  return { index: 0, stage: 0, done: false, carSpawned: false, flash: 0, lastEvent: '' };
}

/** The HUD line(s) to show for the current mission state. */
export function currentMissionText(state) {
  if (state.done) return 'All jobs done — Sunfall City is yours. Keep roaming, Birdie.';
  const m = MISSIONS[state.index];
  if (!m) return '';
  if (m.objective2 && state.stage >= 1) return `${m.title}: ${m.objective2}`;
  return `${m.title}: ${m.objective}`;
}

/** The current active marker {x, y, label} for the minimap/world marker draw, or null. */
export function currentMarker(state) {
  if (state.done) return null;
  const m = MISSIONS[state.index];
  if (!m) return null;
  const pos = m.objective2 && state.stage >= 1 ? m.marker2() : m.marker();
  return { ...pos };
}

/**
 * Advances mission logic by checking the player's position/vehicle against the current
 * objective. `ctx` supplies: player, isDrivingMissionCar(), spawnMissionCar(type, x, y),
 * addWanted(amount), notify(text, ok).
 */
export function updateMissions(state, ctx) {
  if (state.done) return;
  const m = MISSIONS[state.index];
  if (!m) {
    state.done = true;
    return;
  }

  // Spawn the mission's vehicle once, the moment it becomes current.
  if (m.vehicle && !state.carSpawned) {
    const at = m.spawnAt();
    ctx.spawnMissionCar(m.vehicle, at.x, at.y);
    state.carSpawned = true;
  }

  const p = ctx.player;
  if (m.id === 'parts-run' || m.id === 'last-favor') {
    const target = m.marker();
    const d = dist(p.x, p.y, target.x, target.y);
    if (d < MARKER_RADIUS && ctx.isDrivingMissionCar(m.vehicle)) {
      completeCurrent(state, ctx, m);
    }
    return;
  }

  if (m.id === 'hot-load') {
    if (state.stage === 0) {
      const target = m.marker();
      if (dist(p.x, p.y, target.x, target.y) < MARKER_RADIUS) {
        state.stage = 1;
        ctx.addWanted(m.heatOnPickup);
        ctx.notify('Package grabbed — and someone called it in. Go!', true);
      }
      return;
    }
    const target2 = m.marker2();
    if (dist(p.x, p.y, target2.x, target2.y) < MARKER_RADIUS) {
      completeCurrent(state, ctx, m);
    }
    return;
  }

  // meet-fixer: simple goto.
  const target = m.marker();
  if (dist(p.x, p.y, target.x, target.y) < MARKER_RADIUS) {
    completeCurrent(state, ctx, m);
  }
}

function completeCurrent(state, ctx, m) {
  ctx.player.cash += m.reward;
  ctx.notify(`${m.title} complete — +$${m.reward}`, true);
  state.index += 1;
  state.stage = 0;
  state.carSpawned = false;
  state.flash = 2.2;
  if (state.index >= MISSIONS.length) state.done = true;
}
