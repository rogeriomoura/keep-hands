import type { GameState } from "./game";

export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  const { world, camera } = state;
  const viewW = ctx.canvas.clientWidth || ctx.canvas.width;
  const viewH = ctx.canvas.clientHeight || ctx.canvas.height;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;

  ctx.save();
  ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

  drawBackdrop(ctx, world.width, world.height, state.betweenWaves);
  drawGround(ctx, world);
  drawWalls(ctx, state);
  drawTowers(ctx, state);
  drawSupplies(ctx, state);
  drawEnemies(ctx, state);
  drawProjectiles(ctx, state);
  drawPlayer(ctx, state);
  drawFloaters(ctx, state);
  drawPrompt(ctx, state);

  ctx.restore();

  drawDayTimer(ctx, state, viewW, viewH);
  drawBanner(ctx, state, viewW);
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isDay: boolean,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (isDay) {
    g.addColorStop(0, "#6a8aaa");
    g.addColorStop(0.45, "#9bb0a0");
    g.addColorStop(1, "#7a8f72");
  } else {
    g.addColorStop(0, "#1c2430");
    g.addColorStop(0.55, "#3a4548");
    g.addColorStop(1, "#4a5a52");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = isDay ? "rgba(255, 220, 140, 0.55)" : "rgba(232, 220, 200, 0.12)";
  ctx.beginPath();
  ctx.arc(isDay ? 420 : 1180, isDay ? 140 : 120, isDay ? 48 : 70, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(20, 24, 20, 0.18)";
  for (let i = 0; i < 8; i++) {
    const x = 900 + i * 90;
    const height = 80 + ((i * 37) % 60);
    ctx.beginPath();
    ctx.moveTo(x, 620);
    ctx.lineTo(x + 40, 620 - height);
    ctx.lineTo(x + 80, 620);
    ctx.fill();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, world: GameState["world"]) {
  ctx.fillStyle = "#3d5a45";
  ctx.fillRect(0, world.groundY, world.width, world.height - world.groundY);
  ctx.fillStyle = "#2f4636";
  ctx.fillRect(0, world.groundY, world.width, 8);

  ctx.fillStyle = "#5a5044";
  ctx.fillRect(0, world.groundY, world.gateX, 10);
}

function drawWalls(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const wall of state.world.walls) {
    const ratio = wall.hp / wall.maxHp;
    const ruined = wall.hp <= 0;
    const cracked = !ruined && ratio < 0.55;

    if (ruined) {
      ctx.fillStyle = "#4a4036";
      ctx.fillRect(wall.body.x, wall.body.y + wall.body.h * 0.55, wall.body.w, wall.body.h * 0.45);
      ctx.fillStyle = "#6a5a48";
      ctx.fillRect(wall.body.x + 10, wall.body.y + wall.body.h * 0.4, 40, 20);
      continue;
    }

    ctx.fillStyle = cracked ? "#6a5a48" : "#7a6d5c";
    ctx.fillRect(wall.body.x, wall.body.y, wall.body.w, wall.body.h);
    ctx.fillStyle = "#958675";
    ctx.fillRect(wall.body.x, wall.body.y, wall.body.w, 10);

    for (let i = 0; i < wall.body.w; i += 22) {
      ctx.fillRect(wall.body.x + i, wall.body.y - 12, 12, 12);
    }

    drawBar(ctx, wall.body.x + 8, wall.body.y - 28, wall.body.w - 16, 6, ratio, "#c45c2a");

    if (cracked) {
      ctx.strokeStyle = "rgba(30, 24, 18, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wall.body.x + 20, wall.body.y + 20);
      ctx.lineTo(wall.body.x + 45, wall.body.y + 55);
      ctx.lineTo(wall.body.x + 70, wall.body.y + 35);
      ctx.stroke();
    }
  }
}

function drawTowers(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const tower of state.world.towers) {
    const ratio = tower.hp / tower.maxHp;
    const empty = tower.ammo <= 0 && tower.hp > 0;
    const pulse = empty ? 0.5 + Math.sin(state.elapsed * 8) * 0.5 : 0;

    ctx.fillStyle = ratio <= 0 ? "#3a342c" : ratio < 0.5 ? "#5c5348" : "#6e6458";
    ctx.fillRect(tower.base.x, tower.base.y, tower.base.w, tower.base.h);

    ctx.fillStyle = "#1a1612";
    ctx.fillRect(tower.base.x + 18, tower.base.y + tower.base.h * 0.35, 12, 16);
    ctx.fillRect(tower.base.x + 40, tower.base.y + tower.base.h * 0.6, 12, 16);

    ctx.fillStyle = "#8a7d6c";
    ctx.fillRect(tower.platform.x, tower.platform.y, tower.platform.w, tower.platform.h);

    for (let i = 0; i < tower.platform.w; i += 18) {
      ctx.fillRect(tower.platform.x + i, tower.platform.y - 14, 10, 14);
    }

    ctx.fillStyle = "#4a3a28";
    ctx.fillRect(tower.ladder.x, tower.ladder.y, 4, tower.ladder.h);
    ctx.fillRect(tower.ladder.x + 12, tower.ladder.y, 4, tower.ladder.h);
    for (let y = tower.ladder.y + 10; y < tower.ladder.y + tower.ladder.h; y += 18) {
      ctx.fillRect(tower.ladder.x, y, 16, 3);
    }

    drawBar(
      ctx,
      tower.platform.x + 8,
      tower.platform.y - 36,
      tower.platform.w - 16,
      6,
      tower.ammo / tower.maxAmmo,
      empty ? `rgba(232, 160, 80, ${0.55 + pulse * 0.45})` : "#d8b45a",
    );
    drawBar(
      ctx,
      tower.platform.x + 8,
      tower.platform.y - 26,
      tower.platform.w - 16,
      5,
      Math.max(0, ratio),
      "#c45c2a",
    );

    ctx.fillStyle = empty ? "#e8a050" : "#e8dcc8";
    ctx.font = "600 11px IBM Plex Sans, sans-serif";
    ctx.fillText(
      empty ? "NEED AMMO" : `${tower.ammo}/${tower.maxAmmo}`,
      tower.platform.x + 10,
      tower.platform.y - 40,
    );
  }
}

function drawSupplies(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const s of state.world.supplies) {
    if (s.kind === "ammo") {
      ctx.fillStyle = "#8a5a28";
      ctx.fillRect(s.body.x, s.body.y, s.body.w, s.body.h);
      ctx.fillStyle = "#c4a060";
      ctx.fillRect(s.body.x + 6, s.body.y + 8, s.body.w - 12, 8);
      ctx.fillStyle = "#e8dcc8";
      ctx.font = "600 11px IBM Plex Sans, sans-serif";
      ctx.fillText("AMMO", s.body.x + 4, s.body.y - 6);
    } else {
      ctx.fillStyle = "#7a7468";
      ctx.beginPath();
      ctx.moveTo(s.body.x, s.body.y + s.body.h);
      ctx.lineTo(s.body.x + 10, s.body.y);
      ctx.lineTo(s.body.x + s.body.w - 8, s.body.y + 6);
      ctx.lineTo(s.body.x + s.body.w, s.body.y + s.body.h);
      ctx.fill();
      ctx.fillStyle = "#e8dcc8";
      ctx.font = "600 11px IBM Plex Sans, sans-serif";
      ctx.fillText("STONE", s.body.x + 2, s.body.y - 6);
    }
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const e of state.enemies) {
    ctx.fillStyle = e.kind === "brute" ? "#5a2a28" : "#3a4a38";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(e.x + 4, e.y + 6, 6, 5);
    ctx.fillStyle = "#c45c2a";
    ctx.fillRect(e.x + 4, e.y - 8, (e.w - 8) * (e.hp / e.maxHp), 4);
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.fillStyle = "#f0d080";
  for (const p of state.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState) {
  const p = state.player;
  // body
  ctx.fillStyle = "#3d5c4a";
  ctx.fillRect(p.x + 3, p.y + 12, p.w - 6, 18);
  // head
  ctx.fillStyle = "#c9b28a";
  ctx.fillRect(p.x + 5, p.y + 2, 12, 12);
  // legs
  ctx.fillStyle = "#2a241c";
  ctx.fillRect(p.x + 4, p.y + 30, 6, 10);
  ctx.fillRect(p.x + 12, p.y + 30, 6, 10);
  // facing cue
  ctx.fillStyle = "#1a1612";
  if (p.facing > 0) ctx.fillRect(p.x + 12, p.y + 6, 4, 3);
  else ctx.fillRect(p.x + 6, p.y + 6, 4, 3);

  if (p.carrying) {
    ctx.fillStyle = p.carrying === "ammo" ? "#d8b45a" : "#9a9488";
    ctx.fillRect(p.x + (p.facing > 0 ? 16 : -8), p.y + 14, 14, 10);
  }
}

function drawFloaters(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const f of state.floaters) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.font = "700 13px IBM Plex Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}

function drawPrompt(ctx: CanvasRenderingContext2D, state: GameState) {
  if (!state.prompt) return;
  const p = state.player;
  ctx.fillStyle = "rgba(20, 16, 12, 0.82)";
  const text = state.prompt;
  ctx.font = "600 13px IBM Plex Sans, sans-serif";
  const w = ctx.measureText(text).width + 16;
  const x = p.x + p.w / 2 - w / 2;
  const y = p.y - 36;
  ctx.fillRect(x, y, w, 24);
  ctx.fillStyle = "#f0e6d4";
  ctx.fillText(text, x + 8, y + 16);
}

function drawDayTimer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  if (!state.betweenWaves || state.status !== "playing") return;
  if (state.wave > 5) return;

  const secs = Math.max(0, state.waveTimer);
  const whole = Math.ceil(secs);
  const progress = state.dayDuration > 0 ? secs / state.dayDuration : 0;
  const urgent = secs <= 5;

  const cx = viewW / 2;
  const cy = viewH * 0.28;

  ctx.save();
  ctx.fillStyle = "rgba(18, 14, 10, 0.55)";
  roundRect(ctx, cx - 150, cy - 78, 300, 150, 10);
  ctx.fill();

  ctx.strokeStyle = urgent ? "rgba(196, 92, 42, 0.85)" : "rgba(232, 220, 200, 0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - 150, cy - 78, 300, 150, 10);
  ctx.stroke();

  ctx.fillStyle = "#a89880";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    state.wave === 1 ? "DAYLIGHT — PREPARE THE KEEP" : "DAYBREAK — REPAIR & RELOAD",
    cx,
    cy - 48,
  );

  ctx.fillStyle = urgent ? "#e8a050" : "#f0e6d4";
  ctx.font = "700 64px Cormorant Garamond, serif";
  ctx.fillText(String(whole), cx, cy + 18);

  ctx.fillStyle = "#cbb89a";
  ctx.font = "500 13px IBM Plex Sans, sans-serif";
  ctx.fillText(`Night ${state.wave} begins soon`, cx, cy + 48);

  // progress bar
  const barW = 220;
  const barX = cx - barW / 2;
  const barY = cy + 62;
  ctx.fillStyle = "rgba(20, 16, 12, 0.7)";
  ctx.fillRect(barX, barY, barW, 8);
  ctx.fillStyle = urgent ? "#c45c2a" : "#d8b45a";
  ctx.fillRect(barX, barY, barW * progress, 8);

  ctx.textAlign = "left";
  ctx.restore();
}

function drawBanner(ctx: CanvasRenderingContext2D, state: GameState, viewW: number) {
  if (state.bannerLife <= 0 || !state.banner) return;
  // hide brief banners while the day timer is the focus, except night-start
  if (state.betweenWaves && state.status === "playing") return;

  const a = Math.min(1, state.bannerLife);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(18, 14, 10, 0.7)";
  const y = 28;
  roundRect(ctx, viewW / 2 - 200, y, 400, 44, 8);
  ctx.fill();
  ctx.fillStyle = "#f0e6d4";
  ctx.font = "600 18px Cormorant Garamond, serif";
  ctx.textAlign = "center";
  ctx.fillText(state.banner, viewW / 2, y + 28);
  ctx.textAlign = "left";
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
) {
  ctx.fillStyle = "rgba(20, 16, 12, 0.7)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * ratio), h);
}
