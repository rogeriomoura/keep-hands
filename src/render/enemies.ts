/** Raiders, brutes, bombers and their falling bodies. */
import { enemyPose } from "../enemyPose";
import type { Enemy, GameState } from "../game/types";

export function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const e of state.enemies) {
    if (e.kind === "bomber") {
      drawBomber(ctx, e);
      continue;
    }
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

/**
 * Act 2 bomber: a patched balloon with a raider in the basket and a bomb slung
 * below. The bob is drawn only — the hitbox (e.x, e.y, e.w, e.h) doesn't move.
 */
function drawBomber(ctx: CanvasRenderingContext2D, e: Enemy) {
  const bob = Math.sin(e.walkPhase) * 2;
  const cx = e.x + e.w / 2;
  const top = e.y + bob;

  // ropes from the envelope to the basket
  ctx.strokeStyle = "#4a3a28";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 10, top + 22);
  ctx.lineTo(cx - 6, top + 31);
  ctx.moveTo(cx + 10, top + 22);
  ctx.lineTo(cx + 6, top + 31);
  ctx.stroke();

  // envelope: dark patched cloth with red stripes
  ctx.fillStyle = "#6a2e24";
  ctx.beginPath();
  ctx.ellipse(cx, top + 12, 15, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b8452a";
  ctx.fillRect(cx - 3, top - 1, 6, 26);
  ctx.fillStyle = "#4a2018";
  ctx.fillRect(cx - 12, top + 9, 5, 5);
  ctx.fillStyle = "rgba(255, 220, 180, 0.18)";
  ctx.beginPath();
  ctx.ellipse(cx - 6, top + 6, 4, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // raider peeking over the basket, facing the keep (left)
  ctx.fillStyle = "#6a7a68";
  ctx.fillRect(cx - 4, top + 26, 8, 7);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(cx - 3, top + 28, 2, 2);
  // basket
  ctx.fillStyle = "#6a5440";
  ctx.fillRect(cx - 8, top + 31, 16, 9);
  ctx.fillStyle = "#4a3a28";
  ctx.fillRect(cx - 8, top + 34, 16, 2);
  // the next bomb, slung under the basket
  ctx.fillStyle = "#1a1a18";
  ctx.beginPath();
  ctx.arc(cx, top + 43, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c45c2a";
  ctx.fillRect(e.x + 4, top - 8, (e.w - 8) * (e.hp / e.maxHp), 4);
}

/** Felled raiders topple backwards around a heel, slide a little, and fade out. */
export function drawCorpses(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const c of state.corpses) {
    const brute = c.kind === "brute";
    const body = brute ? "#5a2a28" : "#3a4a38";
    const shade = brute ? "#3a1814" : "#243028";
    const skin = brute ? "#8a5a48" : "#6a7a68";
    const p = Math.min(1, c.t / (c.life * 0.45));
    const fall = p * p; // accelerate into the ground
    const fade = 1 - Math.max(0, (c.t - c.life * 0.55) / (c.life * 0.45));
    // pivot on the heel on the side it falls toward
    const px = c.x + c.w / 2 + c.dir * c.w * 0.35;
    const py = c.y + c.h;

    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(px, py);
    ctx.rotate(c.dir * fall * Math.PI * 0.48);
    ctx.translate(-px, -py);

    ctx.fillStyle = shade;
    ctx.fillRect(c.x + 3, c.y + c.h - 12, 6, 12);
    ctx.fillRect(c.x + c.w - 9, c.y + c.h - 12, 6, 12);
    ctx.fillStyle = body;
    ctx.fillRect(c.x + 3, c.y + 10, c.w - 6, c.h - 20);
    const headW = brute ? 14 : 11;
    ctx.fillStyle = skin;
    ctx.fillRect(c.x + (c.w - headW) / 2, c.y + 1, headW, 11);
    // arms flung up as it goes over
    const armLen = brute ? 16 : 13;
    const armW = brute ? 5 : 4;
    const fling = 0.55 + fall * 2.2;
    drawEnemyArm(ctx, c.x + 5, c.y + 13, fling, armLen, armW, shade, skin, null);
    drawEnemyArm(ctx, c.x + c.w - 5, c.y + 14, fling + 0.3, armLen - 1, armW, shade, skin, null);
    ctx.restore();
  }
}

export function drawEnemyArm(
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
