// The city of Sunfall City: its bounds, its four named districts, the road grid and every
// building, generated once from a fixed seed so the layout is identical on every load (nothing
// about the city itself is saved to localStorage — only the player's progress is).
import { createRng, pick, randRange, pointInRect, rectsOverlap } from './utils.js';

/** The whole playable world, in world-space pixels. */
export const WORLD_W = 3200;
export const WORLD_H = 3200;

/** Road grid: corridors run every ROAD_SPACING px, each ROAD_WIDTH px wide, both axes. */
export const ROAD_SPACING = 400;
export const ROAD_WIDTH = 92;
export const SIDEWALK = 16;

/** The four districts of Sunfall City, each a quadrant with its own palette and story beats. */
export const DISTRICTS = [
  {
    id: 'industrial',
    name: 'Rustwater Industrial',
    rect: { x: 0, y: 0, w: 1600, h: 1600 },
    ground: '#2b2a28',
    road: '#1c1b1a',
    buildings: ['#5a5753', '#6e4b3a', '#4a4f52', '#7a6a3c'],
    accent: '#d8942b',
  },
  {
    id: 'downtown',
    name: 'Downtown Sunfall',
    rect: { x: 1600, y: 0, w: 1600, h: 1600 },
    ground: '#23272f',
    road: '#171a20',
    buildings: ['#3c4a63', '#2f3b52', '#48597a', '#566f93'],
    accent: '#ffcf5c',
  },
  {
    id: 'suburbs',
    name: 'Palm Hollow Suburbs',
    rect: { x: 0, y: 1600, w: 1600, h: 1600 },
    ground: '#3a3424',
    road: '#241f16',
    buildings: ['#c98a5a', '#b9975e', '#8f9e6a', '#d1a978'],
    accent: '#7bc67e',
  },
  {
    id: 'marina',
    name: 'Tideline Marina',
    rect: { x: 1600, y: 1600, w: 1600, h: 1600 },
    ground: '#1d3b43',
    road: '#15282d',
    buildings: ['#3e8c8f', '#2c6468', '#5aa6a0', '#1f4e52'],
    accent: '#ffe08a',
  },
];

/** The district containing a world point, or null past the world edge. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) if (pointInRect(x, y, d.rect)) return d;
  return null;
}

const CELLS_PER_AXIS = WORLD_W / ROAD_SPACING; // 8

/** True when a world point sits on a road corridor (drivable and walkable). */
export function isOnRoad(x, y) {
  const halfRoad = ROAD_WIDTH / 2;
  const mx = ((x % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
  const my = ((y % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
  return mx < halfRoad || mx > ROAD_SPACING - halfRoad || my < halfRoad || my > ROAD_SPACING - halfRoad;
}

/** Road intersection nodes (the centre of every grid crossing), used by traffic and pedestrian AI. */
export const ROAD_NODES = (() => {
  const nodes = [];
  for (let i = 0; i <= CELLS_PER_AXIS; i++) {
    for (let j = 0; j <= CELLS_PER_AXIS; j++) {
      const x = Math.min(i * ROAD_SPACING, WORLD_W);
      const y = Math.min(j * ROAD_SPACING, WORLD_H);
      nodes.push({ x, y, i, j });
    }
  }
  return nodes;
})();

/** The road node nearest a world point. */
export function nearestRoadNode(x, y) {
  let best = ROAD_NODES[0];
  let bestD = Infinity;
  for (const n of ROAD_NODES) {
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** A node's four grid neighbours that exist on the map, for traffic/police path-following. */
export function roadNeighbors(node) {
  const out = [];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const i = node.i + di;
    const j = node.j + dj;
    if (i < 0 || j < 0 || i > CELLS_PER_AXIS || j > CELLS_PER_AXIS) continue;
    out.push({ x: Math.min(i * ROAD_SPACING, WORLD_W), y: Math.min(j * ROAD_SPACING, WORLD_H), i, j });
  }
  return out;
}

/** Every building rect in the city, generated once at a fixed seed: {x, y, w, h, color, district}. */
export const BUILDINGS = (() => {
  const rng = createRng(0x53756e66); // "Sunf" — a fixed seed, so the city never changes shape.
  const list = [];
  const half = ROAD_WIDTH / 2 + SIDEWALK;
  for (let i = 0; i < CELLS_PER_AXIS; i++) {
    for (let j = 0; j < CELLS_PER_AXIS; j++) {
      const cx = i * ROAD_SPACING;
      const cy = j * ROAD_SPACING;
      const block = { x: cx + half, y: cy + half, w: ROAD_SPACING - half * 2, h: ROAD_SPACING - half * 2 };
      if (block.w <= 20 || block.h <= 20) continue;
      const centerX = block.x + block.w / 2;
      const centerY = block.y + block.h / 2;
      const d = districtAt(centerX, centerY);
      if (!d) continue;
      // Skip a few blocks entirely so the district has plazas / open lots to drive through.
      if (rng() < 0.12) continue;
      const count = 1 + Math.floor(rng() * 3);
      const cols = count === 1 ? 1 : 2;
      const rows = Math.ceil(count / cols);
      const cw = block.w / cols;
      const ch = block.h / rows;
      for (let k = 0; k < count; k++) {
        const col = k % cols;
        const row = Math.floor(k / cols);
        const pad = 10;
        const w = Math.max(24, cw - pad * 2 - rng() * 20);
        const h = Math.max(24, ch - pad * 2 - rng() * 20);
        const x = block.x + col * cw + pad + (cw - pad * 2 - w) / 2;
        const y = block.y + row * ch + pad + (ch - pad * 2 - h) / 2;
        list.push({ x, y, w, h, color: pick(rng, d.buildings), district: d.id });
      }
    }
  }
  return list;
})();

/** Whether a circle at (x, y) with radius `r` overlaps any building (used for movement collision). */
export function buildingsNear(x, y, radius) {
  const hits = [];
  for (const b of BUILDINGS) {
    if (x + radius < b.x - 40 || x - radius > b.x + b.w + 40 || y + radius < b.y - 40 || y - radius > b.y + b.h + 40) continue;
    hits.push(b);
  }
  return hits;
}

// ---------------------------------------------------------------- notable places / story markers

/** Fixed, named locations the mission chain and the minimap refer to. */
export const LANDMARKS = {
  tidelineCustoms: { x: 2820, y: 2820, label: "Tideline Customs", district: 'marina' },
  industrialYard: { x: 380, y: 380, label: 'Rustwater Yard', district: 'industrial' },
  deadDrop: { x: 2000, y: 1180, label: 'Downtown dead-drop', district: 'downtown' },
  safehouse: { x: 360, y: 2820, label: 'Hollow Safehouse', district: 'suburbs' },
  vipSpot: { x: 2820, y: 360, label: 'VIP valet lot', district: 'downtown' },
  scrapyardHideout: { x: 360, y: 1180, label: 'Scrapyard hideout', district: 'industrial' },
};

export const PLAYER_START = { x: 2000, y: 820 };

/** True when nothing in the city (buildings) blocks a circle at (x, y). */
export function isFreeOfBuildings(x, y, radius) {
  for (const b of buildingsNear(x, y, radius)) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((nx - x) * (nx - x) + (ny - y) * (ny - y) < radius * radius) return false;
  }
  return true;
}

/** Draws the city: district ground, road grid, buildings — everything in world space. */
export function drawCity(ctx, cameraX, cameraY, viewW, viewH) {
  const left = cameraX - viewW / 2 - 80;
  const top = cameraY - viewH / 2 - 80;
  const right = cameraX + viewW / 2 + 80;
  const bottom = cameraY + viewH / 2 + 80;

  // Ground, per district (simple flat fill; the water strip beyond the world edge reads as coast).
  ctx.fillStyle = '#123036';
  ctx.fillRect(left, top, right - left, bottom - top);
  for (const d of DISTRICTS) {
    const r = d.rect;
    if (r.x + r.w < left || r.x > right || r.y + r.h < top || r.y > bottom) continue;
    ctx.fillStyle = d.ground;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // Roads: vertical then horizontal corridors, district-tinted near their centre.
  const half = ROAD_WIDTH / 2;
  for (let i = 0; i <= CELLS_PER_AXIS; i++) {
    const x = i * ROAD_SPACING;
    if (x + half < left || x - half > right) continue;
    ctx.fillStyle = '#20242c';
    ctx.fillRect(x - half, 0, ROAD_WIDTH, WORLD_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([22, 18]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, Math.max(0, top));
    ctx.lineTo(x, Math.min(WORLD_H, bottom));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let j = 0; j <= CELLS_PER_AXIS; j++) {
    const y = j * ROAD_SPACING;
    if (y + half < top || y - half > bottom) continue;
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, y - half, WORLD_W, ROAD_WIDTH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([22, 18]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, left), y);
    ctx.lineTo(Math.min(WORLD_W, right), y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Buildings, culled to the view.
  for (const b of BUILDINGS) {
    if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x, b.y + b.h - 6, b.w, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }

  // District name banners, faint, near the top of each quadrant (only while visible).
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'left';
  for (const d of DISTRICTS) {
    const r = d.rect;
    const tx = r.x + 30;
    const ty = r.y + 60;
    if (tx < left || tx > right || ty < top || ty > bottom) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillText(d.name.toUpperCase(), tx, ty);
  }

  // World edge: a coastline glow so the player reads the hard boundary as a shoreline.
  ctx.strokeStyle = '#4fd6c7';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);
}
