/** Hired crew: runner and mason. */
import type { GameState } from "../game/types";
import { type Helper, REPAIR_HIT, REPAIR_SWING } from "../helpers";
import { drawCarried, drawLeg, drawLimb } from "./player";
import { withTextBoost } from "./shared";

export type HelperLook = {
  tunic: string;
  tunicDark: string;
  skin: string;
  hair: string;
  hat: string;
  boot: string;
  bootBack: string;
  belt: string;
};

export const HELPER_LOOKS: Record<Helper["role"], HelperLook> = {
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

export function drawHelpers(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const h of state.helpers) {
    ctx.save();
    // local space: x −9..9 around the body centre, y 0 (head) → 36 (feet)
    ctx.translate(h.x + h.w / 2, h.y);
    if (h.onLadder) drawHelperClimbing(ctx, h, HELPER_LOOKS[h.role]);
    else drawHelperSide(ctx, h, HELPER_LOOKS[h.role], state.elapsed);
    ctx.restore();

    const label = h.label;
    withTextBoost(ctx, h.x + h.w / 2, h.y - 2, () => {
      ctx.font = "600 10px IBM Plex Sans, sans-serif";
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(20, 16, 12, 0.75)";
      ctx.fillRect(-tw / 2, -14, tw, 14);
      ctx.fillStyle = "#e8dcc8";
      ctx.textAlign = "center";
      ctx.fillText(label, 0, -3);
      ctx.textAlign = "left";
    });
  }
}

export function drawHelperSide(
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
export function drawHelperClimbing(
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
