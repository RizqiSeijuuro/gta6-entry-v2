// Everything drawn on top of the world in screen space: the title screen, the HUD (health, cash,
// wanted stars, mission banner, on-screen control hints) and the minimap.
import { WORLD_W, WORLD_H, DISTRICTS, LANDMARKS } from './city.js';
import { clamp } from './utils.js';

const MINI_SIZE = 168;
const MINI_MARGIN = 16;

/** The animated title screen: game name, tagline, continue/new-game prompt, control hints. */
export function drawStartScreen(ctx, w, h, hasSave, t) {
  ctx.save();
  ctx.fillStyle = '#0c1118';
  ctx.fillRect(0, 0, w, h);

  // A few drifting skyline silhouettes for atmosphere (abstract, not a real skyline — original art).
  ctx.fillStyle = '#141b26';
  for (let i = 0; i < 14; i++) {
    const bw = 40 + (i % 5) * 18;
    const bh = 60 + ((i * 37) % 180);
    const bx = ((i * 97 + t * 6) % (w + 80)) - 40;
    ctx.fillRect(bx, h - bh, bw, bh);
  }
  const sunY = h * 0.42 + Math.sin(t * 0.3) * 4;
  const grad = ctx.createRadialGradient(w / 2, sunY, 10, w / 2, sunY, 160);
  grad.addColorStop(0, '#ffdf7a');
  grad.addColorStop(1, 'rgba(255,145,80,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(w / 2, sunY, 160, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd25c';
  ctx.font = 'bold 86px Georgia, serif';
  ctx.save();
  ctx.translate(w / 2, h * 0.36);
  ctx.scale(1, 1 + Math.sin(t * 1.4) * 0.01);
  ctx.fillText('SUNFALL CITY', 0, 0);
  ctx.restore();

  ctx.font = 'italic 20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('an original open-world crime story', w / 2, h * 0.36 + 38);

  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ffffff' : '#ffd25c';
  ctx.fillText(hasSave ? 'Press ENTER or click to continue' : 'Press ENTER or click to start', w / 2, h * 0.62);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const hints = [
    'WASD / Arrows — move     Mouse — aim',
    'E — enter / jack a car     Left click — punch     Right click — shoot',
    'Driving: W/S accelerate & brake, A/D steer     H — toggle control hints',
  ];
  hints.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.72 + i * 24));

  if (hasSave) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Saved progress found — continuing from your last autosave.', w / 2, h * 0.72 + hints.length * 24 + 18);
  }
  ctx.restore();
}

/** Health bar, cash, wanted stars, mission banner, control hints and the save indicator. */
export function drawHud(ctx, w, h, state) {
  ctx.save();
  // Health bar
  const barW = 180;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(16, 16, barW + 8, 22);
  const healthFrac = clamp(state.player.health / state.player.maxHealth, 0, 1);
  ctx.fillStyle = healthFrac > 0.4 ? '#4fd67a' : '#e24d4d';
  ctx.fillRect(20, 20, barW * healthFrac, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(20, 20, barW, 14);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 24, 31);

  // Cash
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(16, 44, barW + 8, 26);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#9af08a';
  ctx.fillText(`$ ${Math.floor(state.player.cash)}`, 24, 63);

  // Wanted stars (top right)
  const starsX = w - 16;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(starsX - 160, 16, 160, 32);
  ctx.font = '26px sans-serif';
  let starLine = '';
  for (let i = 0; i < 5; i++) starLine += i < state.wantedLevel ? '★' : '☆';
  ctx.fillStyle = state.wantedLevel > 0 ? '#ffd25c' : 'rgba(255,255,255,0.35)';
  if (state.wantedFlash > 0 && Math.floor(state.wantedFlash * 8) % 2 === 0) ctx.fillStyle = '#ff5b5b';
  ctx.fillText(starLine, starsX - 8, 40);

  // Vehicle / state label under wanted stars
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(state.inCarLabel ?? 'On foot', starsX - 8, 62);

  // Mission banner (bottom)
  ctx.textAlign = 'center';
  const bannerY = h - 54;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const textW = Math.min(w - 40, 760);
  ctx.fillRect(w / 2 - textW / 2, bannerY - 24, textW, 40);
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = state.missionFlash > 0 ? '#ffd25c' : '#ffffff';
  ctx.fillText(state.missionText, w / 2, bannerY);

  // Toast (mission complete / crime notices)
  if (state.toast && state.toastTimer > 0) {
    ctx.font = 'bold 17px sans-serif';
    ctx.fillStyle = state.toastOk ? '#9af08a' : '#ff8a8a';
    ctx.globalAlpha = clamp(state.toastTimer, 0, 1);
    ctx.fillText(state.toast, w / 2, bannerY - 34);
    ctx.globalAlpha = 1;
  }

  // Control hints (toggleable)
  if (state.showControls) {
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    const lines = [
      'WASD/Arrows move · Mouse aim · E enter/jack car',
      'Left click punch · Right click shoot · H hide hints',
    ];
    lines.forEach((line, i) => ctx.fillText(line, 16, h - 16 - (lines.length - 1 - i) * 16));
  }

  // Save indicator
  if (state.saveFlash > 0) {
    ctx.textAlign = 'left';
    ctx.font = 'italic 12px sans-serif';
    ctx.fillStyle = `rgba(255,255,255,${clamp(state.saveFlash, 0, 1)})`;
    ctx.fillText('Saved', 16, 86);
  }
  ctx.restore();
}

/** The minimap, bottom-right: whole world scaled down, player, police, and the active mission marker. */
export function drawMinimap(ctx, w, h, state) {
  const x = w - MINI_SIZE - MINI_MARGIN;
  const y = h - MINI_SIZE - MINI_MARGIN;
  const scale = MINI_SIZE / WORLD_W;

  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fillRect(x - 4, y - 4, MINI_SIZE + 8, MINI_SIZE + 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, MINI_SIZE, MINI_SIZE);
  ctx.clip();

  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(x + d.rect.x * scale, y + d.rect.y * scale, d.rect.w * scale, d.rect.h * scale);
  }

  if (state.marker) {
    ctx.fillStyle = '#ffd25c';
    ctx.beginPath();
    ctx.arc(x + state.marker.x * scale, y + state.marker.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of state.policeCars) {
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(x + c.x * scale, y + c.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.missionCar) {
    ctx.fillStyle = '#9af0ff';
    ctx.beginPath();
    ctx.arc(x + state.missionCar.x * scale, y + state.missionCar.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3da8f5';
  ctx.beginPath();
  ctx.arc(x + state.player.x * scale, y + state.player.y * scale, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(x, y, MINI_SIZE, MINI_SIZE);
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('SUNFALL CITY', x, y - 8);
  ctx.restore();
}
