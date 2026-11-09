/** The keeper (player) and shared limb/load drawing. */
import type { GameState } from "../game/types";

export function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState) {
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

export type PlayerPalette = {
  tunic: string;
  tunicDark: string;
  skin: string;
  hair: string;
  boot: string;
  belt: string;
};

/** Back view on the ladder: hands and feet alternate on the rungs. */
export function drawPlayerClimbing(
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

export function drawCarried(
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
export function drawLimb(
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
export function drawLeg(
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
