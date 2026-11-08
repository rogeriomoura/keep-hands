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
};

type HelperState = {
  world: World;
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
  };
}

export function updateHelpers(state: HelperState, dt: number) {
  for (const h of state.helpers) {
    h.workTimer = Math.max(0, h.workTimer - dt);
    if (h.role === "runner") updateRunner(state, h, dt);
    else updateMason(state, h, dt);
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
      addHelperFloater(state, h, "AMMO", "#d8b45a");
      h.workTimer = 0.3;
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
    const add = Math.min(3, tower.maxAmmo - tower.ammo);
    tower.ammo += add;
    h.carrying = null;
    h.targetTowerId = null;
    h.workTimer = 0.5;
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
      h.vy = -125;
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
      addHelperFloater(state, h, "STONE", "#9a9488");
      h.workTimer = 0.35;
      return;
    }
    walkOnGround(state, h, stone.body.x + stone.body.w / 2 - h.w / 2, dt);
    return;
  }

  if (near(h, target.body, 16)) {
    if (target.kind === "wall") {
      const wall = state.world.walls.find((w) => w.id === target.id)!;
      if (wall.hp <= 0) {
        wall.hp = Math.floor(wall.maxHp * 0.35);
        restoreWallPlatform(state, wall);
        addHelperFloater(state, h, "REBUILT", "#8fbc8f");
      } else {
        const before = wall.hp;
        wall.hp = Math.min(wall.maxHp, wall.hp + 18);
        addHelperFloater(state, h, `+${wall.hp - before}`, "#8fbc8f");
      }
    } else {
      const tower = state.world.towers.find((t) => t.id === target.id)!;
      const before = Math.max(0, tower.hp);
      if (tower.hp <= 0) tower.hp = Math.floor(tower.maxHp * 0.3);
      else tower.hp = Math.min(tower.maxHp, tower.hp + 14);
      addHelperFloater(state, h, `+${tower.hp - before}`, "#8fbc8f");
    }
    h.carrying = null;
    h.workTimer = 1.1;
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
    const speed = 110;
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
  h.vy = 145;
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
  const speed = h.carrying ? 88 : 115;
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
