import type { GameState } from "./game";
import { REPAIR_HIT, REPAIR_SWING, type Helper } from "./helpers";
import { enemyPose } from "./enemyPose";
import { HIRE_DEFS, canHire, hireCost } from "./hires";
import { getShopLayout } from "./shopLayout";
import { worldZoom } from "./world";
import { UPGRADE_DEFS, canBuy, upgradeCost } from "./upgrades";

export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  const { world, camera } = state;
  const viewW = ctx.canvas.clientWidth || ctx.canvas.width;
  const viewH = ctx.canvas.clientHeight || ctx.canvas.height;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;

  ctx.save();
  const zoom = worldZoom(viewW, viewH, world);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

  drawBackdrop(ctx, world.width, world.height, state.betweenWaves);
  drawGround(ctx, world);
  drawWalls(ctx, state);
  drawTowers(ctx, state);
  drawSupplies(ctx, state);
  drawEnemies(ctx, state);
  drawDebris(ctx, state);
  drawProjectiles(ctx, state);
  drawHelpers(ctx, state);
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

/** 0 intact → 4 critical; ruined is handled separately */
function damageStage(ratio: number): number {
  if (ratio >= 0.85) return 0;
  if (ratio >= 0.65) return 1;
  if (ratio >= 0.4) return 2;
  if (ratio >= 0.2) return 3;
  return 4;
}

function stoneTone(stage: number, healthy: string, mid: string, bad: string): string {
  if (stage <= 1) return healthy;
  if (stage === 2) return mid;
  return bad;
}

function drawWalls(ctx: CanvasRenderingContext2D, state: GameState) {
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

function drawRuinedWall(
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

function drawTowers(ctx: CanvasRenderingContext2D, state: GameState) {
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

    ctx.fillStyle = empty ? "#e8a050" : "#e8dcc8";
    ctx.font = "600 11px IBM Plex Sans, sans-serif";
    ctx.fillText(
      empty ? "NEED AMMO" : `${tower.ammo}/${tower.maxAmmo}`,
      tower.platform.x + 10,
      tower.platform.y - 62,
    );
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function drawDamageCracks(
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

function drawRubbleChips(
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

function drawCannon(
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
    const flash = tower.muzzleFlash / 0.12;
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
    const brute = e.kind === "brute";
    const body = brute ? "#5a2a28" : "#3a4a38";
    const shade = brute ? "#3a1814" : "#243028";
    const skin = brute ? "#8a5a48" : "#6a7a68";
    const pose = enemyPose(e);
    const lx = pose.leanX;
    const ly = pose.leanY;
    const sq = pose.squash;

    // legs — planted while swinging; front foot steps into the strike
    const walk = e.attacking ? 0 : Math.sin(e.walkPhase) * 3;
    ctx.fillStyle = shade;
    ctx.fillRect(e.x + 3 - pose.step - Math.max(0, -walk) * 0.5, e.y + e.h - 12, 6, 12);
    ctx.fillRect(e.x + e.w - 9, e.y + e.h - 12 + walk, 6, 12 - Math.abs(walk) * 0.2);

    const armLen = brute ? 16 : 13;
    const armW = brute ? 5 : 4;
    const shoulderY = e.y + 13 + ly + sq * 1.5;
    const frontSX = e.x + 5 + lx;
    const backSX = e.x + e.w - 5 + lx;

    // back arm sits behind the torso; brutes grip the maul two-handed
    let backAngle = pose.back;
    let backLen = armLen - 1;
    if (brute && e.attacking) {
      const handR = armLen - 1;
      const hx = frontSX - Math.sin(pose.front) * handR;
      const hy = shoulderY + Math.cos(pose.front) * handR;
      const vx = hx - backSX;
      const vy = hy - (shoulderY + 1);
      backAngle = Math.atan2(-vx, vy);
      backLen = Math.min(armLen + 6, Math.hypot(vx, vy) + 1);
    }
    drawEnemyArm(ctx, backSX, shoulderY + 1, backAngle, backLen, armW, shade, skin, null);

    // torso (squashes wide/short on impact)
    ctx.fillStyle = body;
    ctx.fillRect(
      e.x + 3 + lx - sq,
      e.y + 10 + ly + sq * 2,
      e.w - 6 + sq * 2,
      e.h - 20 - sq * 2,
    );

    // head leads the lean a little
    ctx.fillStyle = skin;
    const headW = brute ? 14 : 11;
    const hx = e.x + (e.w - headW) / 2 + lx * 1.25;
    const hy = e.y + 1 + ly * 1.3 + sq * 2;
    ctx.fillRect(hx, hy, headW, 11);
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(e.x + 4 + lx * 1.25, hy + 4, 4, 3);

    // swing smear trailing the weapon head
    if (pose.smear > 0.01 && pose.smearSpan > 0.05) {
      // the strike rotates counter-clockwise (over the head), so the trail sits at larger angles
      const r = armLen + (brute ? 14 : 9);
      const tip = pose.front + Math.PI / 2;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(240, 228, 204, ${pose.smear * 0.4})`;
      ctx.lineWidth = brute ? 10 : 7;
      ctx.beginPath();
      ctx.arc(frontSX, shoulderY, r, tip + pose.smearSpan, tip, true);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 246, 228, ${pose.smear * 0.55})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(frontSX, shoulderY, r + (brute ? 3 : 2), tip + Math.min(0.9, pose.smearSpan), tip, true);
      ctx.stroke();
      ctx.restore();
    }

    drawEnemyArm(
      ctx,
      frontSX,
      shoulderY,
      pose.front,
      armLen,
      armW,
      shade,
      skin,
      brute ? "maul" : "club",
    );

    ctx.fillStyle = "#c45c2a";
    ctx.fillRect(e.x + 4, e.y - 8, (e.w - 8) * (e.hp / e.maxHp), 4);
  }
}

function drawEnemyArm(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  angle: number,
  len: number,
  width: number,
  sleeve: string,
  hand: string,
  weapon: "club" | "maul" | null,
) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  ctx.fillStyle = sleeve;
  ctx.fillRect(-width / 2, 0, width, len - 3);
  if (weapon === "club") {
    ctx.fillStyle = "#4a3a28";
    ctx.fillRect(-1.5, len - 3, 3, 9);
    ctx.fillStyle = "#3a2c1e";
    ctx.fillRect(-3, len + 4, 6, 6);
    ctx.fillStyle = "#6a5440";
    ctx.fillRect(-3, len + 4, 2, 6);
  } else if (weapon === "maul") {
    ctx.fillStyle = "#4a3a28";
    ctx.fillRect(-1.5, len - 3, 3, 13);
    ctx.fillStyle = "#5a564e";
    ctx.fillRect(-6, len + 8, 12, 8);
    ctx.fillStyle = "#7a766c";
    ctx.fillRect(-6, len + 8, 12, 2);
  }
  ctx.fillStyle = hand;
  ctx.fillRect(-width / 2 - 0.5, len - 4, width + 1, 5);
  ctx.restore();
}

function drawDebris(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const d of state.debris) {
    const t = Math.max(0, d.life / d.maxLife);
    if (d.kind === "chip") {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life / 0.2);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin * (d.maxLife - d.life));
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    } else if (d.kind === "dust") {
      ctx.fillStyle = `rgba(${d.color}, ${0.35 * t})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // strike spark: a quick star burst at the contact point
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin);
      ctx.globalAlpha = t;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      const r = d.size * (1.2 - t * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const inner = i % 2 === 0 ? 0.25 : 0.4;
        ctx.moveTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner);
        ctx.lineTo(Math.cos(a) * r * (i % 2 === 0 ? 1 : 0.6), Math.sin(a) * r * (i % 2 === 0 ? 1 : 0.6));
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const p of state.projectiles) {
    ctx.fillStyle = "#2a2a28";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a6a60";
    ctx.beginPath();
    ctx.arc(p.x - 1.2, p.y - 1.2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState) {
  const p = state.player;
  const tunic = "#3d5c4a";
  const tunicDark = "#2e4a3a";
  const skin = "#c9b28a";
  const hair = "#5a4430";
  const boot = "#2a241c";
  const bootBack = "#1e1a14";
  const belt = "#5a4630";

  ctx.save();
  // local space: x −11..11 around the body centre, y 0 (head) → 40 (feet)
  ctx.translate(p.x + p.w / 2, p.y);

  // stepping sideways off a ladder still counts as "on ladder" — show a walk, not the back view
  const sideStep = p.onLadder && Math.abs(p.vx) > 1 && Math.abs(p.vy) < 1;

  if (p.onLadder && !sideStep) {
    drawPlayerClimbing(ctx, p, { tunic, tunicDark, skin, hair, boot, belt });
    ctx.restore();
    return;
  }

  ctx.scale(sideStep ? Math.sign(p.vx) : p.facing, 1);

  const airborne = !p.onGround && !sideStep;
  const s = p.stride;
  const sq = p.landSquash;
  let legFront: number;
  let legBack: number;
  let armFront: number;
  let armBack: number;
  let bob: number;

  if (airborne) {
    if (p.vy < 0) {
      // rising: knees tucked, arms thrown up
      legFront = -0.75;
      legBack = 0.35;
      armFront = -2.5;
      armBack = 2.3;
    } else {
      // falling: legs reach for the ground, arms out for balance
      legFront = -0.3;
      legBack = 0.25;
      armFront = -1.9;
      armBack = 1.7;
    }
    bob = 0;
  } else {
    const swing = Math.sin(p.walkPhase) * 0.6 * s;
    legFront = -swing;
    legBack = swing;
    armFront = swing * 0.8 + 0.08;
    armBack = -swing * 0.8 - 0.08;
    const breathe = Math.sin(state.elapsed * 2.4) * 0.5 * (1 - s);
    bob = -Math.abs(Math.cos(p.walkPhase)) * 1.5 * s + breathe + 0.75 * s;
  }

  if (p.carrying) {
    // both hands out front, gripping the load
    armFront = -1.3 + Math.sin(p.walkPhase * 2) * 0.05 * s;
    armBack = -1.2;
  }

  const bodyY = bob + sq * 3;
  const hipY = 30 + sq * 2;

  // back limbs sit behind the torso
  drawLimb(ctx, -3, 14 + bodyY, armBack, 11, 4, tunicDark, skin);
  drawLeg(ctx, -4, hipY, legBack, 10 - sq * 2, bootBack);

  // torso (squashes wide on a hard landing)
  ctx.fillStyle = tunic;
  ctx.fillRect(-8 - sq, 12 + bodyY, 16 + sq * 2, 18 - sq);
  ctx.fillStyle = belt;
  ctx.fillRect(-8 - sq, 25 + bodyY, 16 + sq * 2, 2);

  drawLeg(ctx, 4, hipY, legFront, 10 - sq * 2, boot);

  // head
  const headY = 2 + bodyY + sq;
  ctx.fillStyle = skin;
  ctx.fillRect(-6, headY, 12, 12);
  ctx.fillStyle = hair;
  ctx.fillRect(-6, headY, 12, 3);
  ctx.fillRect(-6, headY, 3, 7);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(2, headY + 5, 3, 3);

  if (p.carrying) {
    const iy = 13 + bodyY + Math.sin(p.walkPhase * 2) * 0.8 * s;
    drawCarried(ctx, p.carrying, 5, iy);
  }

  drawLimb(ctx, 4, 14 + bodyY, armFront, 11, 4, tunic, skin);

  ctx.restore();
}

type PlayerPalette = {
  tunic: string;
  tunicDark: string;
  skin: string;
  hair: string;
  boot: string;
  belt: string;
};

/** Back view on the ladder: hands and feet alternate on the rungs. */
function drawPlayerClimbing(
  ctx: CanvasRenderingContext2D,
  p: GameState["player"],
  c: PlayerPalette,
) {
  const k = Math.sin(p.climbPhase);
  const liftL = Math.max(0, k) * 3;
  const liftR = Math.max(0, -k) * 3;

  // legs (raised leg bends, so it's shorter)
  ctx.fillStyle = c.boot;
  ctx.fillRect(-7, 30 - liftL, 6, 10 - liftL * 0.6);
  ctx.fillRect(1, 30 - liftR, 6, 10 - liftR * 0.6);

  // arms reach up past the head, alternating
  ctx.fillStyle = c.tunicDark;
  const handL = 3 - k * 4;
  const handR = 3 + k * 4;
  ctx.fillRect(-11, handL + 3, 4, 16 - handL);
  ctx.fillRect(7, handR + 3, 4, 16 - handR);
  ctx.fillStyle = c.skin;
  ctx.fillRect(-11.5, handL, 5, 4);
  ctx.fillRect(6.5, handR, 5, 4);

  ctx.fillStyle = c.tunic;
  ctx.fillRect(-8, 12, 16, 18);
  ctx.fillStyle = c.belt;
  ctx.fillRect(-8, 25, 16, 2);

  // back of the head
  ctx.fillStyle = c.skin;
  ctx.fillRect(-6, 2, 12, 12);
  ctx.fillStyle = c.hair;
  ctx.fillRect(-6, 2, 12, 8);

  // load slung on the back while climbing
  if (p.carrying) drawCarried(ctx, p.carrying, -6, 14);
}

function drawCarried(
  ctx: CanvasRenderingContext2D,
  kind: "ammo" | "stone",
  x: number,
  y: number,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  x = 0;
  y = 0;
  if (kind === "ammo") {
    ctx.fillStyle = "#d8b45a";
    ctx.fillRect(x, y, 14, 10);
    ctx.fillStyle = "#a8843a";
    ctx.fillRect(x, y + 4, 14, 2);
    ctx.fillRect(x + 6, y, 2, 10);
  } else {
    ctx.fillStyle = "#9a9488";
    ctx.fillRect(x, y + 1, 14, 9);
    ctx.fillStyle = "#b4aea2";
    ctx.fillRect(x + 1, y, 9, 3);
    ctx.fillStyle = "#7a7468";
    ctx.fillRect(x + 8, y + 6, 6, 4);
  }
  ctx.restore();
}

/** Arm hanging from a shoulder; angle 0 = straight down, − swings forward. */
function drawLimb(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  angle: number,
  len: number,
  width: number,
  sleeve: string,
  hand: string,
  tool: "hammer" | null = null,
) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  ctx.fillStyle = sleeve;
  ctx.fillRect(-width / 2, 0, width, len - 3);
  if (tool === "hammer") {
    ctx.fillStyle = "#6a5440";
    ctx.fillRect(-1, len - 2, 2, 8);
    ctx.fillStyle = "#5a5a58";
    ctx.fillRect(-3.5, len + 5, 7, 4);
    ctx.fillStyle = "#7a7a76";
    ctx.fillRect(-3.5, len + 5, 7, 1);
  }
  ctx.fillStyle = hand;
  ctx.fillRect(-width / 2, len - 4, width, 4);
  ctx.restore();
}

/** Leg from the hip with a small boot toe pointing forward. */
function drawLeg(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  angle: number,
  len: number,
  color: string,
  width = 6,
) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-width / 2, 0, width, len);
  ctx.fillRect(-width / 2, len - 3, width + 2, 3);
  ctx.restore();
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

  if (state.dayPhase === "shop") {
    drawShopPhase(ctx, state, viewW, viewH);
    return;
  }

  drawPrepPhase(ctx, state, viewW, viewH);
}

function drawShopPhase(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  const layout = getShopLayout(viewW, viewH);
  const { cx, panelW, panelH, top, upgradeY, hireY } = layout;

  ctx.save();
  ctx.fillStyle = "rgba(12, 10, 8, 0.45)";
  ctx.fillRect(0, 0, viewW, viewH);
  // layout is in design units; shrink the whole panel on short/narrow screens
  ctx.scale(layout.scale, layout.scale);

  ctx.fillStyle = "rgba(18, 14, 10, 0.9)";
  roundRect(ctx, cx - panelW / 2, top, panelW, panelH, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 220, 200, 0.4)";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - panelW / 2, top, panelW, panelH, 12);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#f0e6d4";
  ctx.font = "700 28px Cormorant Garamond, serif";
  ctx.fillText("Quartermaster", cx, top + 40);

  ctx.fillStyle = "#a89880";
  ctx.font = "500 13px IBM Plex Sans, sans-serif";
  ctx.fillText(
    `Paused · Night ${state.wave} waiting · Gold ${state.gold}`,
    cx,
    top + 64,
  );

  ctx.fillStyle = "#cbb89a";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("UPGRADES — click or tap a card", cx, upgradeY);

  layout.upgrades.forEach((slot, i) => {
    const def = UPGRADE_DEFS[i]!;
    const level = state.upgrades[def.id];
    const maxed = level >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(def.id, level);
    const affordable = canBuy(def.id, state.upgrades, state.gold);
    drawShopCard(
      ctx,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      def.key,
      def.name,
      def.blurb,
      maxed ? `MAX · Lv ${level}` : `Lv ${level} → ${level + 1}`,
      maxed ? "Owned" : `${cost} gold`,
      maxed,
      affordable,
    );
  });

  ctx.fillStyle = "#cbb89a";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("HIRE HELP", cx, hireY);

  layout.hires.forEach((slot, i) => {
    const def = HIRE_DEFS[i]!;
    const owned = state.crew[def.id];
    const affordable = canHire(def.id, state.crew, state.gold);
    drawShopCard(
      ctx,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      def.key,
      def.name,
      def.blurb,
      def.detail,
      owned ? "On payroll" : `${hireCost(def.id)} gold`,
      owned,
      affordable,
    );
  });

  const r = layout.ready;
  ctx.fillStyle = "rgba(140, 80, 36, 0.95)";
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 180, 90, 0.7)";
  ctx.lineWidth = 2;
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.stroke();
  ctx.fillStyle = "#fff6e8";
  ctx.font = "700 15px IBM Plex Sans, sans-serif";
  ctx.fillText("Ready — begin 15s prep", cx, r.y + 26);

  ctx.textAlign = "left";
  ctx.restore();
}

function drawShopCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  key: string,
  name: string,
  blurb: string,
  line: string,
  price: string,
  owned: boolean,
  affordable: boolean,
) {
  ctx.fillStyle = affordable
    ? "rgba(60, 48, 32, 0.9)"
    : "rgba(36, 30, 24, 0.9)";
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = owned
    ? "rgba(106, 143, 106, 0.7)"
    : affordable
      ? "rgba(216, 180, 90, 0.55)"
      : "rgba(90, 78, 64, 0.5)";
  ctx.stroke();

  const mid = x + w / 2;
  ctx.fillStyle = "#d8b45a";
  ctx.font = "700 17px Cormorant Garamond, serif";
  ctx.fillText(key, mid, y + 22);

  ctx.fillStyle = "#f0e6d4";
  ctx.font = "700 13px IBM Plex Sans, sans-serif";
  ctx.fillText(name, mid, y + 42);

  ctx.fillStyle = "#a89880";
  ctx.font = "500 11px IBM Plex Sans, sans-serif";
  ctx.fillText(blurb, mid, y + 60);
  ctx.fillText(line, mid, y + 78);

  ctx.fillStyle = owned ? "#6a8f6a" : affordable ? "#e8dcc8" : "#7a6e60";
  ctx.font = "700 12px IBM Plex Sans, sans-serif";
  ctx.fillText(price, mid, y + 98);
}

type HelperLook = {
  tunic: string;
  tunicDark: string;
  skin: string;
  hair: string;
  hat: string;
  boot: string;
  bootBack: string;
  belt: string;
};

const HELPER_LOOKS: Record<Helper["role"], HelperLook> = {
  // runner: light, quick, red headband
  runner: {
    tunic: "#6a4a28",
    tunicDark: "#523820",
    skin: "#c9b28a",
    hair: "#3a2a1a",
    hat: "#b8452a",
    boot: "#2a241c",
    bootBack: "#1e1a14",
    belt: "#3a2a18",
  },
  // mason: stocky, cloth cap, leather apron, hammer
  mason: {
    tunic: "#4a5c68",
    tunicDark: "#384854",
    skin: "#b89c78",
    hair: "#4a3a2a",
    hat: "#8a8478",
    boot: "#2a241c",
    bootBack: "#1e1a14",
    belt: "#7a6248",
  },
};

function drawHelpers(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const h of state.helpers) {
    ctx.save();
    // local space: x −9..9 around the body centre, y 0 (head) → 36 (feet)
    ctx.translate(h.x + h.w / 2, h.y);
    if (h.onLadder) drawHelperClimbing(ctx, h, HELPER_LOOKS[h.role]);
    else drawHelperSide(ctx, h, HELPER_LOOKS[h.role], state.elapsed);
    ctx.restore();

    ctx.fillStyle = "rgba(20, 16, 12, 0.75)";
    const label = h.label;
    ctx.font = "600 10px IBM Plex Sans, sans-serif";
    const tw = ctx.measureText(label).width + 8;
    ctx.fillRect(h.x + h.w / 2 - tw / 2, h.y - 16, tw, 14);
    ctx.fillStyle = "#e8dcc8";
    ctx.textAlign = "center";
    ctx.fillText(label, h.x + h.w / 2, h.y - 5);
    ctx.textAlign = "left";
  }
}

function drawHelperSide(
  ctx: CanvasRenderingContext2D,
  h: Helper,
  c: HelperLook,
  elapsed: number,
) {
  ctx.scale(h.facing, 1);
  const runner = h.role === "runner";
  const s = h.stride;
  const loadStone = h.carrying === "stone";

  const swing =
    Math.sin(h.walkPhase) * (runner ? 0.7 : 0.5) * (loadStone ? 0.8 : 1) * s;
  let legF = -swing;
  let legB = swing;
  let armF = swing * 0.8 + 0.08;
  let armB = -swing * 0.8 - 0.08;
  const breathe = Math.sin(elapsed * 2.2 + (runner ? 0 : 1.3)) * 0.45 * (1 - s);
  let bodyY =
    -Math.abs(Math.cos(h.walkPhase)) * (runner ? 1.6 : 1.2) * s +
    (runner ? 0.8 : 0.6) * s +
    breathe;
  let lean = runner ? s * 0.8 : 0; // runner leans into the jog
  let crouch = 0;
  let hammerArm: number | null = runner ? null : armF;
  let showLoad: "ammo" | null = null;

  const p = h.task ? Math.min(1, h.taskT / Math.max(0.01, h.taskDur)) : 0;

  if (h.task === "pickup") {
    // dip down to grab the load, then straighten
    crouch = Math.sin(Math.PI * p) * 4;
    armF = -0.5 - Math.sin(Math.PI * p) * 0.4;
    armB = armF + 0.15;
  } else if (h.task === "load") {
    // shove the powder into the gun
    const push = Math.sin(Math.PI * Math.min(1, p * 1.4));
    armF = -1.55;
    armB = -1.45;
    lean = push * 2.5;
    if (p < 0.55) showLoad = "ammo";
  } else if (h.task === "repair") {
    // hammer: raise forward-up and back over the head, strike down, settle
    const k = (h.taskT % REPAIR_SWING) / REPAIR_SWING;
    const rest = 5.68;
    const top = 2.6;
    const hit = 5.08;
    if (k < 0.65) hammerArm = rest + (top - rest) * (1 - (1 - k / 0.65) ** 2);
    else if (k < REPAIR_HIT) hammerArm = top + (hit - top) * ((k - 0.65) / (REPAIR_HIT - 0.65)) ** 2;
    else hammerArm = hit + (rest - hit) * ((k - REPAIR_HIT) / (1 - REPAIR_HIT));
    armF = hammerArm;
    armB = -0.7; // off hand braces the stone
    lean = k >= 0.65 && k < 0.95 ? 1.2 : 0;
  }

  if (h.carrying === "ammo" && !h.task) {
    // runner shoulders the crate: back hand up holding it steady
    armB = 2.75;
  } else if (loadStone && h.task !== "pickup") {
    // mason hugs the stone in front
    armF = -1.25 + Math.sin(h.walkPhase * 2) * 0.05 * s;
    armB = -1.15;
    lean = -0.6;
  }
  if (h.carrying) hammerArm = null;

  const torsoY = 10 + bodyY + crouch;
  const hipY = 26 + crouch * 0.6;
  const legLen = 10 - crouch * 0.6;
  const shoulderY = 12 + bodyY + crouch;

  // back limbs
  drawLimb(ctx, -2 + lean, shoulderY, armB, 10, 3.5, c.tunicDark, c.skin);
  drawLeg(ctx, -3, hipY, legB, legLen, c.bootBack, 5);

  // shouldered crate sits behind the head
  if (h.carrying === "ammo" && !h.task) {
    drawCarried(ctx, "ammo", -14 + lean, 2 + bodyY, 0.85);
  }

  // torso
  ctx.fillStyle = c.tunic;
  ctx.fillRect(-7 + lean, torsoY, 14, 16 - crouch * 0.4);
  ctx.fillStyle = c.belt;
  if (runner) {
    ctx.fillRect(-7 + lean, torsoY + 11, 14, 2);
  } else {
    // leather apron
    ctx.fillRect(-5 + lean, torsoY + 6, 10, 10 - crouch * 0.4);
    ctx.fillStyle = "#5a4630";
    ctx.fillRect(-5 + lean, torsoY + 6, 10, 1.5);
  }

  drawLeg(ctx, 3, hipY, legF, legLen, c.boot, 5);

  // head
  const headY = 2 + bodyY + crouch;
  const hx = -5 + lean * 1.2;
  ctx.fillStyle = c.skin;
  ctx.fillRect(hx, headY, 10, 10);
  ctx.fillStyle = c.hair;
  ctx.fillRect(hx, headY, 3, 6);
  ctx.fillStyle = c.hat;
  if (runner) {
    ctx.fillRect(hx, headY + 1, 10, 2.5); // headband
    ctx.fillRect(hx - 3, headY + 1.5, 3, 1.5); // trailing tail
  } else {
    ctx.fillRect(hx - 0.5, headY - 1, 11, 4); // cap
    ctx.fillRect(hx + 6, headY + 2, 6, 1.5); // brim
  }
  // blink now and then
  const blinking = (elapsed + (runner ? 0 : 1.7)) % 3.4 < 0.12;
  ctx.fillStyle = "#1a1612";
  if (!blinking) ctx.fillRect(hx + 6, headY + 4.5, 2.5, 2.5);
  else ctx.fillRect(hx + 6, headY + 5.5, 2.5, 1);

  if (loadStone) {
    const iy = 12 + bodyY + crouch + Math.sin(h.walkPhase * 2) * 0.8 * s;
    drawCarried(ctx, "stone", 3 + lean, iy, 0.85);
  }
  if (h.task === "pickup" && h.carrying === "ammo") {
    drawCarried(ctx, "ammo", 2 + lean, 14 + bodyY + crouch, 0.75);
  }
  if (showLoad) drawCarried(ctx, showLoad, 7 + lean + (1 - p) * -3, 11 + bodyY, 0.75);

  if (hammerArm !== null) {
    drawLimb(ctx, 3 + lean, shoulderY, hammerArm, 10, 3.5, c.tunic, c.skin, "hammer");
  } else {
    drawLimb(ctx, 3 + lean, shoulderY, armF, 10, 3.5, c.tunic, c.skin);
  }
}

/** Back view on the ladder, scaled to the smaller crew body. */
function drawHelperClimbing(
  ctx: CanvasRenderingContext2D,
  h: Helper,
  c: HelperLook,
) {
  const k = Math.sin(h.climbPhase);
  const liftL = Math.max(0, k) * 2.5;
  const liftR = Math.max(0, -k) * 2.5;

  ctx.fillStyle = c.boot;
  ctx.fillRect(-6, 26 - liftL, 5, 10 - liftL * 0.6);
  ctx.fillRect(1, 26 - liftR, 5, 10 - liftR * 0.6);

  ctx.fillStyle = c.tunicDark;
  const handL = 2 - k * 3.5;
  const handR = 2 + k * 3.5;
  ctx.fillRect(-9.5, handL + 3, 3.5, 13 - handL);
  ctx.fillRect(6, handR + 3, 3.5, 13 - handR);
  ctx.fillStyle = c.skin;
  ctx.fillRect(-10, handL, 4.5, 3.5);
  ctx.fillRect(5.5, handR, 4.5, 3.5);

  ctx.fillStyle = c.tunic;
  ctx.fillRect(-7, 10, 14, 16);
  ctx.fillStyle = c.belt;
  ctx.fillRect(-7, 21, 14, 2);

  ctx.fillStyle = c.skin;
  ctx.fillRect(-5, 2, 10, 10);
  ctx.fillStyle = c.hair;
  ctx.fillRect(-5, 2, 10, 7);
  ctx.fillStyle = c.hat;
  if (h.role === "runner") ctx.fillRect(-5, 3, 10, 2.5);
  else ctx.fillRect(-5.5, 1, 11, 4);

  if (h.carrying) drawCarried(ctx, h.carrying, -5, 12, 0.75);
}

function drawPrepPhase(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  const secs = Math.max(0, state.waveTimer);
  const whole = Math.ceil(secs);
  const progress = state.dayDuration > 0 ? secs / state.dayDuration : 0;
  const urgent = secs <= 5;

  const cx = viewW / 2;
  const cy = viewH * 0.2;

  ctx.save();
  ctx.fillStyle = "rgba(18, 14, 10, 0.58)";
  roundRect(ctx, cx - 180, cy - 58, 360, 110, 10);
  ctx.fill();

  ctx.strokeStyle = urgent ? "rgba(196, 92, 42, 0.85)" : "rgba(232, 220, 200, 0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - 180, cy - 58, 360, 110, 10);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#a89880";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("PREP — REPAIR & RELOAD", cx, cy - 32);

  ctx.fillStyle = urgent ? "#e8a050" : "#f0e6d4";
  ctx.font = "700 48px Cormorant Garamond, serif";
  ctx.fillText(String(whole), cx, cy + 18);

  ctx.fillStyle = "#cbb89a";
  ctx.font = "500 12px IBM Plex Sans, sans-serif";
  ctx.fillText(`Night ${state.wave} begins when the clock hits zero`, cx, cy + 38);

  const barW = 240;
  const barX = cx - barW / 2;
  const barY = cy + 48;
  ctx.fillStyle = "rgba(20, 16, 12, 0.7)";
  ctx.fillRect(barX, barY, barW, 7);
  ctx.fillStyle = urgent ? "#c45c2a" : "#d8b45a";
  ctx.fillRect(barX, barY, barW * progress, 7);

  ctx.textAlign = "left";
  ctx.restore();
}

function drawBanner(ctx: CanvasRenderingContext2D, state: GameState, viewW: number) {
  if (state.bannerLife <= 0 || !state.banner) return;

  const a = Math.min(1, state.bannerLife);
  const y = state.betweenWaves ? 16 : 28;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(18, 14, 10, 0.7)";
  roundRect(ctx, viewW / 2 - 200, y, 400, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#f0e6d4";
  ctx.font = "600 16px Cormorant Garamond, serif";
  ctx.textAlign = "center";
  ctx.fillText(state.banner, viewW / 2, y + 24);
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
