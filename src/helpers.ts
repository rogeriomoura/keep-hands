import type { Debris } from "./game";
import { sfx } from "./sfx";
import { expand, rectsOverlap, type Rect, type World } from "./world";

export type CarryKind = "ammo" | "stone";

export type Helper = {
  id: string;
  role: "runner" | "mason";
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  onLadder: boolean;
  carrying: CarryKind | null;
  workTimer: number;
  label: string;
  /** Tower the runner is currently servicing */
  targetTowerId: string | null;
  /** Act 2 promotion: faster, and the runner loads more / the mason repairs more */
  veteran: boolean;
  // Animation-only state (never read by the AI or physics)
  walkPhase: number;
  stride: number;
  climbPhase: number;
  /** What the current workTimer pause is for, so it can get its own pose */
  task: HelperTask | null;
  taskT: number;
  taskDur: number;
};

export type HelperTask = "pickup" | "load" | "repair";

/** Promoted (veteran) crew. Unpromoted crew use exactly the original numbers. */
export const VETERAN_SPEED = { runner: 1.35, mason: 1.3 } as const;
const VETERAN_RUNNER_LOAD = 5;
const VETERAN_MASON = { wall: 30, tower: 24, wallRebuild: 0.5, towerRebuild: 0.45, pause: 0.9 } as const;

/** Movement multiplier: 1 for regular crew, faster once promoted */
function pace(h: Helper): number {
  return h.veteran ? VETERAN_SPEED[h.role] : 1;
}

/** Promote a hired helper (Act 2 shop). Their label gains a star. */
export function promoteHelper(h: Helper) {
  h.veteran = true;
  h.label = h.role === "runner" ? "Runner ★" : "Mason ★";
}

/** Seconds per hammer blow while the mason repairs (cosmetic) */
export const REPAIR_SWING = 0.36;
/** Fraction of each swing where the hammer lands */
export const REPAIR_HIT = 0.8;

type HelperState = {
  world: World;
  /** only used to pan crew sounds */
  camera: { x: number; y: number };
  helpers: Helper[];
  floaters: {
    x: number;
    y: number;
    text: string;
    life: number;
    maxLife: number;
    color: string;
    vy: number;
  }[];
  debris: Debris[];
};

export function spawnHelper(
  state: HelperState,
  role: "runner" | "mason",
): Helper {
  const groundY = state.world.groundY;
  const offset = role === "runner" ? 160 : 210;
  return {
    id: role,
    role,
    x: offset,
    y: groundY - 36,
    w: 18,
    h: 36,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: true,
    onLadder: false,
    carrying: null,
    workTimer: 0,
    label: role === "runner" ? "Runner" : "Mason",
    targetTowerId: null,
    veteran: false,
    walkPhase: 0,
    stride: 0,
    climbPhase: 0,
    task: null,
    taskT: 0,
    taskDur: 0,
  };
}

export function updateHelpers(state: HelperState, dt: number) {
  for (const h of state.helpers) {
    const px = h.x;
    const py = h.y;
    h.workTimer = Math.max(0, h.workTimer - dt);
    if (h.role === "runner") updateRunner(state, h, dt);
    else updateMason(state, h, dt);
    animateHelper(state, h, dt, px, py);
  }
}

/** Same pause as before (`workTimer = dur`), tagged with what it's for. */
function beginWork(h: Helper, task: HelperTask, dur: number) {
  h.workTimer = dur;
  h.task = task;
  h.taskT = 0;
  h.taskDur = dur;
}

/**
 * Cosmetic only: drives walk/climb cycles from how far the helper actually
 * moved this frame, and kicks up stone chips on each hammer blow.
 */
function animateHelper(
  state: HelperState,
  h: Helper,
  dt: number,
  px: number,
  py: number,
) {
  if (dt <= 0) return;
  const mx = (h.x - px) / dt;
  const my = (h.y - py) / dt;
  const walking = !h.onLadder && Math.abs(mx) > 5;
  h.stride += ((walking ? 1 : 0) - h.stride) * Math.min(1, dt * 12);
  if (walking) h.walkPhase += dt * Math.abs(mx) * 0.085;
  if (h.onLadder && Math.abs(my) > 5) h.climbPhase += dt * Math.abs(my) * 0.08;

  if (!h.task) return;
  if (h.workTimer <= 0) {
    h.task = null;
    return;
  }
  const before = h.taskT;
  h.taskT += dt;
  if (h.task === "repair") {
    const blows = (t: number) => Math.floor(t / REPAIR_SWING + (1 - REPAIR_HIT));
    if (blows(h.taskT) > blows(before)) {
      sfx.hammer(state, h.x + h.w / 2 + h.facing * 18, true);
      // where the hammer head lands (shoulder + arm + handle, angled down-forward)
      const x = h.x + h.w / 2 + h.facing * 18;
      const y = h.y + 18;
      for (let i = 0; i < 4; i++) {
        const ang = -Math.PI / 2 - h.facing * (0.4 + Math.random() * 0.9);
        const spd = 60 + Math.random() * 70;
        state.debris.push({
          kind: "chip",
          x,
          y: y + (Math.random() - 0.5) * 4,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          size: 1.5 + Math.random() * 1.5,
          spin: (Math.random() - 0.5) * 18,
          color: Math.random() < 0.5 ? "#958675" : "#b4aea2",
        });
      }
      state.debris.push({
        kind: "dust",
        x,
        y,
        vx: -h.facing * 10,
        vy: -8,
        life: 0.35,
        maxLife: 0.35,
        size: 4,
        spin: 0,
        color: "200, 186, 164",
      });
    }
  }
}

function updateRunner(state: HelperState, h: Helper, dt: number) {
  if (h.workTimer > 0) {
    h.vx = 0;
    h.vy = 0;
    applyHelperPhysics(state, h, dt);
    return;
  }

  // Always clear bogus ladder state when standing in the courtyard away from ladders
  if (onCourtyard(state, h) && !nearAnyLadder(state, h, 18)) {
    h.onLadder = false;
  }

  if (!h.carrying) {
    const needy = neediestTower(state);
    if (!needy) {
      h.targetTowerId = null;
      idleNear(state, h, 150, dt);
      return;
    }
    h.targetTowerId = needy.id;

    if (!onCourtyard(state, h)) {
      climbTowardGround(state, h, dt);
      return;
    }

    const ammo = state.world.supplies.find((s) => s.kind === "ammo");
    if (!ammo) return;
    if (near(h, ammo.body, 12)) {
      h.carrying = "ammo";
      sfx.pickup(state, h.x + h.w / 2, true);
      addHelperFloater(state, h, "AMMO", "#d8b45a");
      beginWork(h, "pickup", 0.3);
      return;
    }
    walkOnGround(state, h, ammo.body.x + ammo.body.w / 2 - h.w / 2, dt);
    return;
  }

  // Carrying ammo — walk to chosen tower ladder, then climb
  let tower =
    (h.targetTowerId &&
      state.world.towers.find((t) => t.id === h.targetTowerId)) ||
    neediestTower(state) ||
    state.world.towers.find((t) => t.hp > 0 && t.ammo < t.maxAmmo) ||
    null;

  if (!tower || tower.hp <= 0) {
    h.carrying = null;
    h.targetTowerId = null;
    return;
  }
  h.targetTowerId = tower.id;

  const platform = tower.platform;
  const ladder = tower.ladder;
  const ladderCx = ladder.x + ladder.w / 2;
  const atPlatform =
    h.y + h.h >= platform.y - 2 &&
    h.y + h.h <= platform.y + 16 &&
    h.x + h.w > platform.x - 6 &&
    h.x < platform.x + platform.w + 6;

  if (atPlatform) {
    if (tower.ammo >= tower.maxAmmo) {
      h.carrying = null;
      h.targetTowerId = null;
      return;
    }
    const add = Math.min(h.veteran ? VETERAN_RUNNER_LOAD : 3, tower.maxAmmo - tower.ammo);
    tower.ammo += add;
    h.carrying = null;
    h.targetTowerId = null;
    beginWork(h, "load", 0.5);
    sfx.reload(state, h.x + h.w / 2, true);
    // face the cannon while loading (facing is cosmetic for helpers)
    h.facing = tower.base.x + tower.base.w / 2 < h.x + h.w / 2 ? -1 : 1;
    h.onLadder = false;
    addHelperFloater(state, h, `+${add}`, "#d8b45a");
    return;
  }

  // Climb only when actually close to this tower's ladder
  if (nearLadder(h, ladder, 14) || h.onLadder) {
    if (!nearLadder(h, ladder, 22) && h.onLadder) {
      // Lost the ladder — drop the flag, walk again
      h.onLadder = false;
      walkOnGround(state, h, ladderCx - h.w / 2, dt);
      return;
    }

    h.onLadder = true;
    h.x = ladderCx - h.w / 2;
    h.vx = 0;
    const targetY = platform.y - h.h;
    if (h.y > targetY + 2) {
      h.vy = -125 * pace(h);
      applyHelperPhysics(state, h, dt);
      h.x = ladderCx - h.w / 2;
      return;
    }
    h.y = targetY;
    h.vy = 0;
    h.onLadder = false;
    h.onGround = true;
    return;
  }

  // Walk the courtyard to the ladder — never snap
  if (!onCourtyard(state, h)) {
    climbTowardGround(state, h, dt);
    return;
  }
  walkOnGround(state, h, ladderCx - h.w / 2, dt);
}

function updateMason(state: HelperState, h: Helper, dt: number) {
  if (h.workTimer > 0) {
    h.vx = 0;
    h.vy = 0;
    applyHelperPhysics(state, h, dt);
    return;
  }

  const target = neediestStructure(state);
  if (!target) {
    idleNear(state, h, 180, dt);
    return;
  }

  if (!h.carrying) {
    const stone = nearestStone(state, h.x);
    if (!stone) return;
    if (near(h, stone.body, 14)) {
      h.carrying = "stone";
      sfx.pickup(state, h.x + h.w / 2, true);
      addHelperFloater(state, h, "STONE", "#9a9488");
      beginWork(h, "pickup", 0.35);
      return;
    }
    walkOnGround(state, h, stone.body.x + stone.body.w / 2 - h.w / 2, dt);
    return;
  }

  if (near(h, target.body, 16)) {
    if (target.kind === "wall") {
      const wall = state.world.walls.find((w) => w.id === target.id)!;
      if (wall.hp <= 0) {
        wall.hp = Math.floor(wall.maxHp * (h.veteran ? VETERAN_MASON.wallRebuild : 0.35));
        restoreWallPlatform(state, wall);
        addHelperFloater(state, h, "REBUILT", "#8fbc8f");
      } else {
        const before = wall.hp;
        wall.hp = Math.min(wall.maxHp, wall.hp + (h.veteran ? VETERAN_MASON.wall : 18));
        addHelperFloater(state, h, `+${wall.hp - before}`, "#8fbc8f");
      }
    } else {
      const tower = state.world.towers.find((t) => t.id === target.id)!;
      const before = Math.max(0, tower.hp);
      if (tower.hp <= 0) tower.hp = Math.floor(tower.maxHp * (h.veteran ? VETERAN_MASON.towerRebuild : 0.3));
      else tower.hp = Math.min(tower.maxHp, tower.hp + (h.veteran ? VETERAN_MASON.tower : 14));
      addHelperFloater(state, h, `+${tower.hp - before}`, "#8fbc8f");
    }
    h.carrying = null;
    // face the stonework being patched (cosmetic)
    h.facing = target.body.x + target.body.w / 2 < h.x + h.w / 2 ? -1 : 1;
    beginWork(h, "repair", h.veteran ? VETERAN_MASON.pause : 1.1);
    return;
  }

  walkOnGround(state, h, target.body.x + target.body.w / 2 - h.w / 2, dt);
}

function neediestTower(state: HelperState) {
  let best = null as (typeof state.world.towers)[number] | null;
  let bestRatio = 1;
  for (const t of state.world.towers) {
    if (t.hp <= 0 || t.ammo >= t.maxAmmo) continue;
    const ratio = t.ammo / t.maxAmmo;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = t;
    }
  }
  return best;
}

function neediestStructure(state: HelperState): {
  id: string;
  kind: "wall" | "tower";
  body: Rect;
  ratio: number;
} | null {
  let best: {
    id: string;
    kind: "wall" | "tower";
    body: Rect;
    ratio: number;
  } | null = null;

  for (const w of state.world.walls) {
    const ratio = w.hp / w.maxHp;
    if (ratio >= 0.92) continue;
    if (!best || ratio < best.ratio) {
      best = { id: w.id, kind: "wall", body: w.body, ratio };
    }
  }
  for (const t of state.world.towers) {
    const ratio = t.hp / t.maxHp;
    if (ratio >= 0.92) continue;
    if (!best || ratio < best.ratio) {
      best = { id: t.id, kind: "tower", body: t.base, ratio };
    }
  }
  return best;
}

function nearestStone(state: HelperState, x: number) {
  const stones = state.world.supplies.filter((s) => s.kind === "stone");
  return [...stones].sort(
    (a, b) => Math.abs(a.body.x - x) - Math.abs(b.body.x - x),
  )[0];
}

function restoreWallPlatform(state: HelperState, wall: { body: Rect }) {
  const exists = state.world.platforms.some(
    (p) =>
      p.kind === "wallTop" && p.x === wall.body.x && p.y === wall.body.y,
  );
  if (!exists) {
    state.world.platforms.push({
      kind: "wallTop",
      x: wall.body.x,
      y: wall.body.y,
      w: wall.body.w,
      h: 12,
    });
  }
}

function climbTowardGround(state: HelperState, h: Helper, dt: number) {
  const ladder = state.world.towers
    .map((t) => t.ladder)
    .sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];

  if (!ladder) {
    h.vy = 160;
    h.onLadder = false;
    applyHelperPhysics(state, h, dt);
    return;
  }

  const ladderCx = ladder.x + ladder.w / 2;
  if (!nearLadder(h, ladder, 18) && !h.onLadder) {
    // Walk toward ladder on current platform first
    const speed = 110 * pace(h);
    const dx = ladderCx - h.w / 2 - h.x;
    h.vx = Math.abs(dx) > 2 ? Math.sign(dx) * speed : 0;
    h.facing = dx >= 0 ? 1 : -1;
    if (!h.onLadder) h.vy += 1100 * dt;
    applyHelperPhysics(state, h, dt);
    return;
  }

  h.onLadder = true;
  h.x = ladderCx - h.w / 2;
  h.vx = 0;
  h.vy = 145 * pace(h);
  applyHelperPhysics(state, h, dt);
  h.x = ladderCx - h.w / 2;

  if (h.y + h.h >= state.world.groundY - 4) {
    h.onLadder = false;
    h.y = state.world.groundY - h.h;
    h.vy = 0;
    h.onGround = true;
  }
}

function idleNear(state: HelperState, h: Helper, x: number, dt: number) {
  if (!onCourtyard(state, h)) {
    climbTowardGround(state, h, dt);
    return;
  }
  h.onLadder = false;
  if (Math.abs(h.x - x) > 8) {
    walkOnGround(state, h, x, dt);
  } else {
    h.vx = 0;
    h.vy = 0;
    applyHelperPhysics(state, h, dt);
  }
}

/** Ground-only walk — never teleports, never engages ladders */
function walkOnGround(state: HelperState, h: Helper, tx: number, dt: number) {
  h.onLadder = false;
  const speed = (h.carrying ? 88 : 115) * pace(h);
  const dx = tx - h.x;
  if (Math.abs(dx) > 2) {
    h.vx = Math.sign(dx) * speed;
    h.facing = dx > 0 ? 1 : -1;
  } else {
    h.vx = 0;
    h.x = tx;
  }
  h.vy += 1100 * dt;
  applyHelperPhysics(state, h, dt);
}

function applyHelperPhysics(state: HelperState, h: Helper, dt: number) {
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.onGround = false;

  for (const s of state.world.platforms) {
    const body = helperRect(h);
    if (!rectsOverlap(body, s)) continue;
    const oneWay = s.kind === "floor" || s.kind === "wallTop";
    if (oneWay) {
      if (h.vy <= 0 || h.onLadder) continue;
      const prevFeet = h.y + h.h - h.vy * dt;
      if (prevFeet > s.y + 6) continue;
      h.y = s.y - h.h;
      h.vy = 0;
      h.onGround = true;
      continue;
    }
    if (h.vy > 0) {
      h.y = s.y - h.h;
      h.vy = 0;
      h.onGround = true;
    }
  }

  h.x = Math.max(0, Math.min(state.world.width - h.w, h.x));
  if (h.y > state.world.height) {
    h.y = state.world.groundY - h.h;
    h.vy = 0;
  }
}

function onCourtyard(state: HelperState, h: Helper) {
  return h.y + h.h >= state.world.groundY - 8;
}

function nearLadder(h: Helper, ladder: Rect, pad: number) {
  return rectsOverlap(helperRect(h), expand(ladder, pad));
}

function nearAnyLadder(state: HelperState, h: Helper, pad: number) {
  return state.world.towers.some((t) => nearLadder(h, t.ladder, pad));
}

function near(h: Helper, body: Rect, pad: number) {
  return rectsOverlap(helperRect(h), expand(body, pad));
}

function helperRect(h: Helper): Rect {
  return { x: h.x, y: h.y, w: h.w, h: h.h };
}

function addHelperFloater(
  state: HelperState,
  h: Helper,
  text: string,
  color: string,
) {
  state.floaters.push({
    x: h.x + h.w / 2,
    y: h.y - 8,
    text,
    life: 0.8,
    maxLife: 0.8,
    color,
    vy: -26,
  });
}
