// Save/load progress to localStorage: player position, cash, health and how far through the
// mission chain the player has gotten. The world itself (city.js) is deterministic and never
// saved. Autosaves run on a timer from main.js, which also flashes a brief "Saved" HUD indicator.
const KEY = 'sunfallCity.save.v1';

/** Reads the saved game, or null when there is none / it is unreadable. */
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

/** Writes the given progress snapshot to localStorage. Returns true on success. */
export function saveGame(snapshot) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Clears any saved progress (used by a fresh "New Game"). */
export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
