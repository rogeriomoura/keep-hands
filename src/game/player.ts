/** Player movement, collisions and cosmetic animation. */
import type { GameState, Player } from "./types";
import { clamp } from "./util";
import type { KeyState } from "../input";
import { sfx } from "../sfx";
import { expand, type Rect, rectsOverlap } from "../world";

export function moveSpeed(state: GameState, carrying: boolean): number {
  const boots = 1 + state.upgrades.boots * 0.12;
  const base = carrying ? 135 : 185;
  return base * boots;
}

export function updatePlayer(state: GameState, keys: KeyState, dt: number) {
  const p = state.player;
  const baseSpeed = moveSpeed(state, Boolean(p.carrying));
  const climb = 155 * (1 + state.upgrades.boots * 0.06);
  const gravity = 1100;
  const jumpVel = -390;

  const left = keys["ArrowLeft"];
  const right = keys["ArrowRight"];
  const up = keys["ArrowUp"];
  const down = keys["ArrowDown"];
  const jump = keys["Space"];

  const ladder = findLadder(state, playerRect(p));
  const wantClimb = Boolean(ladder && (up || down || p.onLadder));
  p.onLadder = Boolean(ladder && (up || down || (p.onLadder && !jump)));

  if (ladder && (up || down)) {
    p.onLadder = true;
    p.vx = left ? -baseSpeed * 0.35 : right ? baseSpeed * 0.35 : 0;
    p.vy = up ? -climb : down ? climb : 0;
    if (!left && !right) p.x = ladder.x + ladder.w / 2 - p.w / 2;
  } else if (p.onLadder && ladder && !jump) {
    p.vx = left ? -baseSpeed * 0.45 : right ? baseSpeed * 0.45 : 0;
    p.vy = 0;
    if (!left && !right) p.x = ladder.x + ladder.w / 2 - p.w / 2;
  } else {
    p.onLadder = false;
    p.vx = left ? -baseSpeed : right ? baseSpeed : 0;
    if (left) p.facing = -1;
    if (right) p.facing = 1;
    p.vy += gravity * dt;

    if (jump && p.onGround && !p.jumpLocked) {
      p.vy = jumpVel;
      p.onGround = false;
      p.jumpLocked = true;
      sfx.jump(state, p.x + p.w / 2);
    }
  }

  if (!jump) p.jumpLocked = false;

  // leave ladder with jump
  if (jump && ladder && !p.jumpLocked && wantClimb) {
    p.onLadder = false;
    p.vy = jumpVel * 0.75;
    p.jumpLocked = true;
    sfx.jump(state, p.x + p.w / 2);
  }

  p.x += p.vx * dt;
  collideAxes(state, p, "x", dt, down);

  const wasOnGround = p.onGround;
  const fallSpeed = p.vy;
  p.y += p.vy * dt;
  p.onGround = false;
  collideAxes(state, p, "y", dt, down);

  animatePlayer(state, p, dt, wasOnGround, fallSpeed);

  p.x = clamp(p.x, 0, state.world.width - p.w);
  if (p.y > state.world.height) {
    p.y = state.world.groundY - p.h;
    p.vy = 0;
  }
}

/** Purely cosmetic: advances walk/climb cycles and landing squash after physics ran. */
export function animatePlayer(
  state: GameState,
  p: Player,
  dt: number,
  wasOnGround: boolean,
  fallSpeed: number,
) {
  const moving = (p.onGround || p.onLadder) && Math.abs(p.vx) > 1;
  p.stride += ((moving ? 1 : 0) - p.stride) * Math.min(1, dt * 12);
  if (moving) p.walkPhase += dt * Math.abs(p.vx) * 0.075;
  if (p.onLadder && Math.abs(p.vy) > 1) p.climbPhase += dt * Math.abs(p.vy) * 0.07;

  p.landSquash = Math.max(0, p.landSquash - dt * 5);
  if (!wasOnGround && p.onGround && !p.onLadder && fallSpeed > 260) {
    p.landSquash = Math.min(1, (fallSpeed - 160) / 420);
    sfx.land(state, p.x + p.w / 2, p.landSquash);
    for (const dir of [-1, 1]) {
      state.debris.push({
        kind: "dust",
        x: p.x + p.w / 2 + dir * 8,
        y: p.y + p.h - 3,
        vx: dir * (22 + Math.random() * 14),
        vy: -6 - Math.random() * 6,
        life: 0.4,
        maxLife: 0.4,
        size: 4 + p.landSquash * 3,
        spin: 0,
        color: "200, 186, 164",
      });
    }
  }
}

export function collideAxes(
  state: GameState,
  p: Player,
  axis: "x" | "y",
  dt: number,
  dropThrough: boolean,
) {
  const solids = state.world.platforms;

  for (const s of solids) {
    const body = playerRect(p);
    if (!rectsOverlap(body, s)) continue;

    const oneWay = s.kind === "floor" || s.kind === "wallTop";

    if (axis === "x") {
      if (oneWay) continue;
      if (p.vx > 0) p.x = s.x - p.w;
      else if (p.vx < 0) p.x = s.x + s.w;
      p.vx = 0;
      continue;
    }

    // vertical
    if (oneWay) {
      if (dropThrough || p.vy <= 0 || p.onLadder) continue;
      const prevFeet = p.y + p.h - p.vy * dt;
      if (prevFeet > s.y + 6) continue;
      p.y = s.y - p.h;
      p.vy = 0;
      p.onGround = true;
      continue;
    }

    if (p.vy > 0) {
      p.y = s.y - p.h;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = s.y + s.h;
      p.vy = 0;
    }
  }
}

export function findLadder(state: GameState, body: Rect) {
  return state.world.towers
    .map((t) => t.ladder)
    .find((l) => rectsOverlap(body, expand(l, 8)));
}

export function playerRect(p: Player): Rect {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}
