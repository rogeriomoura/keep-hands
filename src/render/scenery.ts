/** Sky, ground, walls, towers, cannons and supplies. */
import type { GameState } from "../game/types";
import { drawBar, EDGE_BLEED, mixHex, withTextBoost } from "./shared";
import { muzzleFlashScale } from "../motion";
import { getReducedMotion } from "../settings";

/** night: 0 = day sky, 1 = night sky — crossfades at dusk and dawn */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  night: number,
) {
  const n = night * night * (3 - 2 * night); // smoothstep
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mixHex("#6a8aaa", "#1c2430", n));
  g.addColorStop(0.5, mixHex("#9bb0a0", "#3a4548", n));
  g.addColorStop(1, mixHex("#7a8f72", "#4a5a52", n));
  ctx.fillStyle = g;
  ctx.fillRect(-EDGE_BLEED, 0, w + EDGE_BLEED * 2, h);

  // sun sinks and fades as night falls; the moon rises and brightens
  if (n < 1) {
    ctx.fillStyle = `rgba(255, 220, 140, ${0.55 * (1 - n)})`;
    ctx.beginPath();
    ctx.arc(420, 140 + n * 90, 48, 0, Math.PI * 2);
    ctx.fill();
  }
  if (n > 0) {
    ctx.fillStyle = `rgba(232, 220, 200, ${0.12 * n})`;
    ctx.beginPath();
    ctx.arc(1180, 120 + (1 - n) * 90, 70, 0, Math.PI * 2);
    ctx.fill();
  }

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

export function drawGround(ctx: CanvasRenderingContext2D, world: GameState["world"]) {
  const x0 = -EDGE_BLEED;
  const span = world.width + EDGE_BLEED * 2;
  ctx.fillStyle = "#3d5a45";
  ctx.fillRect(x0, world.groundY, span, world.height - world.groundY);
  ctx.fillStyle = "#2f4636";
  ctx.fillRect(x0, world.groundY, span, 8);

  ctx.fillStyle = "#5a5044";
  ctx.fillRect(x0, world.groundY, world.gateX - x0, 10);
}

/** 0 intact → 4 critical; ruined is handled separately */
export function damageStage(ratio: number): number {
  if (ratio >= 0.85) return 0;
  if (ratio >= 0.65) return 1;
  if (ratio >= 0.4) return 2;
  if (ratio >= 0.2) return 3;
  return 4;
}

export function stoneTone(stage: number, healthy: string, mid: string, bad: string): string {
  if (stage <= 1) return healthy;
  if (stage === 2) return mid;
  return bad;
}

export function drawWalls(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const wall of state.world.walls) {
    const ratio = Math.max(0, wall.hp / wall.maxHp);
    const ruined = wall.hp <= 0;
    const stage = ruined ? 5 : damageStage(ratio);
    const { x, y, w, h } = wall.body;
    const seed = hashId(wall.id);

    if (ruined) {
      drawRuinedWall(ctx, wall.body, seed);
      drawBar(ctx, x + 8, y - 28, w - 16, 6, 0, "#c45c2a");
      continue;
    }

    ctx.fillStyle = stoneTone(stage, "#7a6d5c", "#6a5a48", "#5a4a3a");
    ctx.fillRect(x, y, w, h);

    // scar / soot as damage worsens
    if (stage >= 2) {
      ctx.fillStyle = `rgba(30, 24, 18, ${0.08 + stage * 0.04})`;
      ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
    }

    ctx.fillStyle = stoneTone(stage, "#958675", "#857564", "#6a5e50");
    ctx.fillRect(x, y, w, 10);

    // battlements — chip away as HP falls
    for (let i = 0; i < w; i += 22) {
      const slot = Math.floor(i / 22);
      const broken = stage >= 2 && (seed + slot * 17) % 7 < stage - 1;
      const chipped = stage >= 3 && (seed + slot * 13) % 5 === 0;
      if (broken) {
        // stump of a merlon
        ctx.fillStyle = "#5a4a3c";
        ctx.fillRect(x + i + 2, y - 5, 8, 5);
        continue;
      }
      ctx.fillStyle = stoneTone(stage, "#958675", "#857564", "#6a5e50");
      const mh = chipped ? 7 : 12;
      ctx.fillRect(x + i, y - mh, 12, mh);
    }

    drawDamageCracks(ctx, x, y, w, h, stage, seed);
    if (stage >= 3) drawRubbleChips(ctx, x, y + h, w, stage, seed);

    drawBar(ctx, x + 8, y - 28, w - 16, 6, ratio, "#c45c2a");
  }
}

export function drawRuinedWall(
  ctx: CanvasRenderingContext2D,
  body: { x: number; y: number; w: number; h: number },
  seed: number,
) {
  const { x, y, w, h } = body;
  ctx.fillStyle = "#4a4036";
  ctx.fillRect(x, y + h * 0.55, w, h * 0.45);

  // jagged break line
  ctx.fillStyle = "#5a4e42";
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.55);
  for (let i = 0; i <= 6; i++) {
    const px = x + (w * i) / 6;
    const py = y + h * (0.42 + ((seed + i * 19) % 5) * 0.03);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();

  // fallen blocks
  ctx.fillStyle = "#6a5a48";
  ctx.fillRect(x + 8, y + h * 0.72, 22, 14);
  ctx.fillRect(x + w * 0.45, y + h * 0.78, 18, 12);
  ctx.fillRect(x + w - 30, y + h * 0.7, 16, 16);
  if (seed % 2 === 0) {
    ctx.fillRect(x + w * 0.28, y + h * 0.62, 14, 10);
  }
}

export function drawTowers(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const tower of state.world.towers) {
    const ratio = Math.max(0, tower.hp / tower.maxHp);
    const empty = tower.ammo <= 0 && tower.hp > 0;
    const ruined = tower.hp <= 0;
    const stage = ruined ? 5 : damageStage(ratio);
    const pulse = empty ? 0.5 + Math.sin(state.elapsed * 8) * 0.5 : 0;
    const seed = hashId(tower.id);
    const { x, y, w, h } = tower.base;

    if (ruined) {
      ctx.fillStyle = "#3a342c";
      ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
      ctx.fillStyle = "#4a4036";
      ctx.fillRect(x - 4, y + h * 0.55, w + 8, 12);
      drawRubbleChips(ctx, x - 6, y + h, w + 12, 4, seed);
      // no cannon when ruined
    } else {
      ctx.fillStyle = stoneTone(stage, "#6e6458", "#5c5348", "#4a4238");
      ctx.fillRect(x, y, w, h);

      if (stage >= 2) {
        ctx.fillStyle = `rgba(24, 18, 14, ${0.1 + stage * 0.05})`;
        ctx.fillRect(x, y + h * 0.4, w, h * 0.6);
      }

      // windows — shatter / darken with damage
      const winA = stage >= 3 ? "#0a0806" : "#1a1612";
      const winB = stage >= 4 ? "#0a0806" : "#1a1612";
      ctx.fillStyle = winA;
      ctx.fillRect(x + 18, y + h * 0.35, 12, 16);
      ctx.fillStyle = winB;
      ctx.fillRect(x + 40, y + h * 0.6, 12, 16);
      if (stage >= 2) {
        ctx.strokeStyle = `rgba(20, 14, 10, ${0.4 + stage * 0.1})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 20, y + h * 0.35);
        ctx.lineTo(x + 28, y + h * 0.35 + 16);
        ctx.stroke();
      }

      ctx.fillStyle = stoneTone(stage, "#8a7d6c", "#74685a", "#5e5448");
      ctx.fillRect(tower.platform.x, tower.platform.y, tower.platform.w, tower.platform.h);

      for (let i = 0; i < tower.platform.w; i += 18) {
        const mx = tower.platform.x + i;
        if (mx > tower.platform.x + tower.platform.w * 0.35 && mx < tower.platform.x + tower.platform.w * 0.72) {
          continue;
        }
        const slot = Math.floor(i / 18);
        const missing = stage >= 2 && (seed + slot * 11) % 6 < stage - 1;
        if (missing) {
          ctx.fillStyle = "#4a4036";
          ctx.fillRect(mx + 1, tower.platform.y - 4, 8, 4);
          continue;
        }
        const short = stage >= 3 && (seed + slot) % 3 === 0;
        ctx.fillStyle = stoneTone(stage, "#8a7d6c", "#74685a", "#5e5448");
        ctx.fillRect(mx, tower.platform.y - (short ? 8 : 14), 10, short ? 8 : 14);
      }

      ctx.fillStyle = stage >= 3 ? "#3a2e22" : "#4a3a28";
      ctx.fillRect(tower.ladder.x, tower.ladder.y, 4, tower.ladder.h);
      ctx.fillRect(tower.ladder.x + 12, tower.ladder.y, 4, tower.ladder.h);
      for (let ly = tower.ladder.y + 10; ly < tower.ladder.y + tower.ladder.h; ly += 18) {
        ctx.fillRect(tower.ladder.x, ly, 16, 3);
      }

      drawDamageCracks(ctx, x, y, w, h, stage, seed + 3);
      if (stage >= 3) drawRubbleChips(ctx, x - 4, y + h, w + 8, stage, seed + 7);

      drawCannon(ctx, tower);
    }

    drawBar(
      ctx,
      tower.platform.x + 8,
      tower.platform.y - 58,
      tower.platform.w - 16,
      6,
      tower.ammo / tower.maxAmmo,
      empty ? `rgba(232, 160, 80, ${0.55 + pulse * 0.45})` : "#d8b45a",
    );
    drawBar(
      ctx,
      tower.platform.x + 8,
      tower.platform.y - 48,
      tower.platform.w - 16,
      5,
      Math.max(0, ratio),
      "#c45c2a",
    );

    withTextBoost(ctx, tower.platform.x + 10, tower.platform.y - 54, () => {
      ctx.fillStyle = empty ? "#e8a050" : "#e8dcc8";
      ctx.font = "600 11px IBM Plex Sans, sans-serif";
      ctx.fillText(empty ? "NEED AMMO" : `${tower.ammo}/${tower.maxAmmo}`, 0, -8);
    });
  }
}

export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function drawDamageCracks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stage: number,
  seed: number,
) {
  if (stage < 1) return;

  const crackCount = stage;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let c = 0; c < crackCount; c++) {
    const sx = x + 8 + ((seed + c * 47) % Math.max(1, w - 16));
    const sy = y + 12 + ((seed + c * 29) % Math.max(1, Math.floor(h * 0.35)));
    const alpha = 0.35 + stage * 0.1;
    ctx.strokeStyle = `rgba(22, 16, 12, ${alpha})`;
    ctx.lineWidth = stage >= 3 ? 2.2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let px = sx;
    let py = sy;
    const segs = 3 + stage;
    for (let s = 0; s < segs; s++) {
      px += ((seed + c * 11 + s * 7) % 17) - 6;
      py += 10 + ((seed + s * 5) % 12);
      px = Math.max(x + 4, Math.min(x + w - 4, px));
      py = Math.min(y + h - 6, py);
      ctx.lineTo(px, py);
      // branch
      if (stage >= 2 && s === 1) {
        ctx.lineTo(px + 8 + (c % 3) * 4, py + 6);
        ctx.moveTo(px, py);
      }
    }
    ctx.stroke();
  }

  // missing chunks / holes at high damage
  if (stage >= 3) {
    ctx.fillStyle = "rgba(18, 14, 10, 0.55)";
    const hx = x + 10 + (seed % Math.max(1, w - 28));
    const hy = y + h * 0.45;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + 10, hy + 4);
    ctx.lineTo(hx + 7, hy + 14);
    ctx.lineTo(hx - 3, hy + 10);
    ctx.closePath();
    ctx.fill();
  }
  if (stage >= 4) {
    ctx.fillStyle = "rgba(14, 10, 8, 0.65)";
    const hx = x + w * 0.55;
    const hy = y + h * 0.25;
    ctx.fillRect(hx, hy, 9, 11);
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h * 0.7);
    ctx.lineTo(x + 18, y + h * 0.78);
    ctx.lineTo(x + 8, y + h * 0.9);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawRubbleChips(
  ctx: CanvasRenderingContext2D,
  left: number,
  ground: number,
  width: number,
  stage: number,
  seed: number,
) {
  const n = 2 + stage;
  for (let i = 0; i < n; i++) {
    const cx = left + ((seed + i * 37) % Math.max(1, width));
    const size = 4 + ((seed + i * 9) % 6);
    ctx.fillStyle = i % 2 === 0 ? "#6a5a48" : "#524638";
    ctx.fillRect(cx, ground - size + 2, size, size - 1);
  }
}

export function drawCannon(
  ctx: CanvasRenderingContext2D,
  tower: GameState["world"]["towers"][number],
) {
  const pivotX = tower.platform.x + tower.platform.w * 0.55;
  const pivotY = tower.platform.y - 6;
  const recoil = tower.recoil * 5;
  const ang = tower.aimAngle;
  const armed = tower.ammo > 0;
  const carriage = armed ? "#3a2a1c" : "#2a241c";
  const wheel = armed ? "#2a2018" : "#1c1814";
  const barrel = armed ? "#2c2c2a" : "#3a342e";
  const barrelDark = armed ? "#1a1a18" : "#2a241e";
  const ring = armed ? "#5a5a52" : "#4a4038";
  const breech = armed ? "#3a3a36" : "#322c26";

  ctx.globalAlpha = armed ? 1 : 0.72;

  // carriage / wheels on the platform
  ctx.fillStyle = carriage;
  ctx.fillRect(pivotX - 16, tower.platform.y - 8, 28, 8);
  ctx.fillStyle = wheel;
  ctx.beginPath();
  ctx.arc(pivotX - 10, tower.platform.y - 1, 6, 0, Math.PI * 2);
  ctx.arc(pivotX + 8, tower.platform.y - 1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = armed ? "#5a4a38" : "#3a3228";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pivotX - 10, tower.platform.y - 1, 6, 0, Math.PI * 2);
  ctx.arc(pivotX + 8, tower.platform.y - 1, 6, 0, Math.PI * 2);
  ctx.stroke();

  // barrel
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(ang);
  ctx.translate(armed ? -recoil : 0, 0);

  ctx.fillStyle = barrel;
  ctx.fillRect(0, -5, 30, 10);
  ctx.fillStyle = barrelDark;
  ctx.fillRect(22, -6, 10, 12);
  ctx.fillStyle = ring;
  ctx.fillRect(28, -7, 4, 14);
  ctx.fillStyle = breech;
  ctx.fillRect(-8, -7, 10, 14);

  // open muzzle when empty — dark bore, no flash
  if (!armed) {
    ctx.fillStyle = "#0c0a08";
    ctx.fillRect(30, -3, 3, 6);
  }

  if (armed && tower.muzzleFlash > 0) {
    // reduced motion: half-size, dimmer flash
    const flash = (tower.muzzleFlash / 0.12) * muzzleFlashScale(getReducedMotion());
    ctx.fillStyle = `rgba(255, 200, 80, ${0.55 + flash * 0.45})`;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(32 + 10 + flash * 8, -6 - flash * 4);
    ctx.lineTo(32 + 16 + flash * 10, 0);
    ctx.lineTo(32 + 10 + flash * 8, 6 + flash * 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 240, 180, ${flash})`;
    ctx.beginPath();
    ctx.arc(34, 0, 4 + flash * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle = armed ? "#8a7a60" : "#5a5044";
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

export function drawSupplies(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const s of state.world.supplies) {
    if (s.kind === "ammo") {
      ctx.fillStyle = "#8a5a28";
      ctx.fillRect(s.body.x, s.body.y, s.body.w, s.body.h);
      ctx.fillStyle = "#c4a060";
      ctx.fillRect(s.body.x + 6, s.body.y + 8, s.body.w - 12, 8);
      withTextBoost(ctx, s.body.x + 4, s.body.y - 6, () => {
        ctx.fillStyle = "#e8dcc8";
        ctx.font = "600 11px IBM Plex Sans, sans-serif";
        ctx.fillText("AMMO", 0, 0);
      });
    } else {
      ctx.fillStyle = "#7a7468";
      ctx.beginPath();
      ctx.moveTo(s.body.x, s.body.y + s.body.h);
      ctx.lineTo(s.body.x + 10, s.body.y);
      ctx.lineTo(s.body.x + s.body.w - 8, s.body.y + 6);
      ctx.lineTo(s.body.x + s.body.w, s.body.y + s.body.h);
      ctx.fill();
      withTextBoost(ctx, s.body.x + 2, s.body.y - 6, () => {
        ctx.fillStyle = "#e8dcc8";
        ctx.font = "600 11px IBM Plex Sans, sans-serif";
        ctx.fillText("STONE", 0, 0);
      });
    }
  }
}
