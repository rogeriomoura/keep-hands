import { createInput, type KeyState } from "./input";
import {
  spawnHelper,
  updateHelpers,
  type Helper,
} from "./helpers";
import {
  HIRE_DEFS,
  canHire,
  freshCrew,
  hireCost,
  type Crew,
  type HireId,
} from "./hires";
import {
  UPGRADE_DEFS,
  canBuy,
  freshUpgrades,
  upgradeCost,
  type UpgradeId,
  type Upgrades,
} from "./upgrades";
import { getShopLayout, hitTestShop } from "./shopLayout";
import {
  createWorld,
  expand,
  rectsOverlap,
  type Rect,
  type World,
  worldZoom,
} from "./world";
import { render } from "./render";
import {
  ARM_READY,
  marchArm,
  swingTiming,
  type AttackPhase,
} from "./enemyPose";

export type CarryKind = "ammo" | "stone";

export type Player = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  onLadder: boolean;
  facing: 1 | -1;
  carrying: CarryKind | null;
  interactCooldown: number;
  jumpLocked: boolean;
  // Animation-only state (never read by physics)
  walkPhase: number;
  /** 0 idle → 1 full stride; eases so legs settle instead of snapping */
  stride: number;
  climbPhase: number;
  /** 0..1 squash after a hard landing */
  landSquash: number;
};

export type Enemy = {
  id: number;
  kind: "raider" | "brute";
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  speed: number;
  attacking: boolean;
  /** Melee swing phase; pose is derived from phase + phaseT in enemyPose.ts */
  attackPhase: AttackPhase;
  phaseT: number;
  /** Per-swing tempo jitter (~0.9–1.1) so a crowd doesn't hammer in lockstep */
  swingScale: number;
  /** Arm angle when the windup began, so the raise starts from the march pose */
  swingFrom: number;
  damage: number;
  walkPhase: number;
};

export type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
};

/** Short-lived impact effects: stone chips, dust puffs, strike sparks */
export type Debris = {
  kind: "chip" | "dust" | "spark";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  color: string;
};

export type Floater = {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  vy: number;
};

export type GameState = {
  world: World;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  floaters: Floater[];
  debris: Debris[];
  helpers: Helper[];
  camera: { x: number; y: number };
  shake: number;
  prompt: string;
  banner: string;
  bannerLife: number;
  wave: number;
  waveTimer: number;
  dayDuration: number;
  /** Day is split: shop (paused) → prep (timed repairs) → night */
  dayPhase: "shop" | "prep" | null;
  betweenWaves: boolean;
  spawnedThisWave: number;
  toSpawn: number;
  spawnTimer: number;
  gold: number;
  upgrades: Upgrades;
  crew: Crew;
  shopCooldown: number;
  shopKeysHeld: Partial<Record<UpgradeId | HireId, boolean>>;
  confirmHeld: boolean;
  lives: number;
  status: "menu" | "playing" | "won" | "lost";
  elapsed: number;
  /** Seconds of actual play (prep + nights); frozen while the shop is open or the run is over */
  runTime: number;
};

const MAX_WAVES = 5;
const PREP_SECONDS = 15;
let nextEnemyId = 1;

export function createGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const input = createInput();
  let state = freshState();
  let last = performance.now();
  let raf = 0;
  let pausedForOrientation = false;
  let pausedForUi = false;
  /** Screen px covered by on-screen controls; the camera may scroll past the world edge by this much */
  const insets = { left: 0, right: 0 };

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    const cssW = rect?.width ?? window.innerWidth;
    const cssH = rect?.height ?? window.innerHeight - 72;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener("resize", resize);
  // Layout can change without a window resize (header reflow, fullscreen transitions
  // measured mid-animation) — track the stage itself so the buffer never stretches
  if (canvas.parentElement && "ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas.parentElement);
  }

  const canvasPoint = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * (canvas.clientWidth || rect.width),
      y: ((e.clientY - rect.top) / rect.height) * (canvas.clientHeight || rect.height),
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (state.status !== "playing" || state.dayPhase !== "shop") return;
    if (pausedForOrientation) return;
    const { x, y } = canvasPoint(e);
    const viewW = canvas.clientWidth || canvas.width;
    const viewH = canvas.clientHeight || canvas.height;
    const hit = hitTestShop(getShopLayout(viewW, viewH), x, y);
    if (!hit) return;
    e.preventDefault();
    if (hit.kind === "upgrade") tryBuyUpgrade(state, hit.id);
    else if (hit.kind === "hire") tryHire(state, hit.id);
    else confirmShopReady(state);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (state.status !== "playing" || state.dayPhase !== "shop") {
      canvas.style.cursor = "default";
      return;
    }
    const { x, y } = canvasPoint(e);
    const viewW = canvas.clientWidth || canvas.width;
    const viewH = canvas.clientHeight || canvas.height;
    const hit = hitTestShop(getShopLayout(viewW, viewH), x, y);
    canvas.style.cursor = hit ? "pointer" : "default";
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);

  const frame = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state.status === "playing" && !pausedForOrientation && !pausedForUi) {
      update(state, input.keys, dt, canvas, insets);
    } else {
      state.bannerLife = Math.max(0, state.bannerLife - dt);
      updateFloaters(state, dt);
      state.shake = Math.max(0, state.shake - dt * 8);
    }
    render(ctx, state);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);

  return {
    getState: () => state,
    start() {
      state = freshState("playing");
      pausedForOrientation = false;
      input.clearKeys();
    },
    restart() {
      state = freshState("playing");
      pausedForOrientation = false;
      input.clearKeys();
    },
    /** CSS px of the stage covered by touch controls (0 when hidden) */
    setViewInsets(next: ViewInsets) {
      insets.left = Math.max(0, next.left);
      insets.right = Math.max(0, next.right);
    },
    /** Freeze the world while a DOM dialog (e.g. fullscreen help) is open */
    setUiPaused(paused: boolean) {
      pausedForUi = paused;
      input.clearKeys();
    },
    setOrientationPaused(paused: boolean) {
      pausedForOrientation = paused;
    },
    setKey(code: string, down: boolean) {
      input.setKey(code, down);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      input.dispose();
    },
  };
}

function freshState(status: GameState["status"] = "menu"): GameState {
  const world = createWorld();
  return {
    world,
    player: {
      x: 140,
      y: world.groundY - 40,
      w: 22,
      h: 40,
      vx: 0,
      vy: 0,
      onGround: true,
      onLadder: false,
      facing: 1,
      carrying: null,
      interactCooldown: 0,
      jumpLocked: false,
      walkPhase: 0,
      stride: 0,
      climbPhase: 0,
      landSquash: 0,
    },
    enemies: [],
    projectiles: [],
    floaters: [],
    debris: [],
    helpers: [],
    camera: { x: 0, y: 0 },
    shake: 0,
    prompt: "",
    // First night: skip shop — straight into prep with no upgrades
    banner: status === "playing" ? "First night — repair & reload before sundown" : "",
    bannerLife: status === "playing" ? 2.8 : 0,
    wave: 1,
    waveTimer: PREP_SECONDS,
    dayDuration: PREP_SECONDS,
    dayPhase: status === "playing" ? "prep" : "shop",
    betweenWaves: true,
    spawnedThisWave: 0,
    toSpawn: 4,
    spawnTimer: 0,
    gold: 0,
    upgrades: freshUpgrades(),
    crew: freshCrew(),
    shopCooldown: 0,
    shopKeysHeld: {},
    confirmHeld: true,
    lives: 3,
    status,
    elapsed: 0,
    runTime: 0,
  };
}

function update(
  state: GameState,
  keys: KeyState,
  dt: number,
  canvas: HTMLCanvasElement,
  insets: ViewInsets,
) {
  state.elapsed += dt;
  state.player.interactCooldown = Math.max(0, state.player.interactCooldown - dt);
  state.shopCooldown = Math.max(0, state.shopCooldown - dt);
  state.bannerLife = Math.max(0, state.bannerLife - dt);
  state.shake = Math.max(0, state.shake - dt * 10);

  updateWaves(state, dt, keys);
  updateShop(state, keys);

  // Shop phase: world paused so you can read/buy; prep/night run normally
  if (state.dayPhase !== "shop") {
    // run clock only advances while the world does (never during the shop)
    state.runTime += dt;
    updatePlayer(state, keys, dt);
    updateHelpers(state, dt);
    updateTowers(state, dt);
    updateProjectiles(state, dt);
    updateEnemies(state, dt);
    updatePrompt(state, keys);
  } else {
    state.prompt = "";
  }

  updateFloaters(state, dt);
  updateDebris(state, dt);
  updateCamera(state, canvas, insets);

  if (state.lives <= 0) {
    state.status = "lost";
    state.banner = "The keep has fallen";
    state.bannerLife = 3;
  }
  if (
    state.wave > MAX_WAVES &&
    state.enemies.length === 0 &&
    !state.betweenWaves
  ) {
    state.status = "won";
    state.banner = "Night held";
    state.bannerLife = 3;
  }
}

function updateWaves(state: GameState, dt: number, keys: KeyState) {
  if (state.wave > MAX_WAVES) return;

  if (state.betweenWaves) {
    if (state.dayPhase === "shop") {
      const confirm = Boolean(keys["Enter"]);
      const was = state.confirmHeld;
      state.confirmHeld = confirm;
      if (confirm && !was) confirmShopReady(state);
      return;
    }

    // Timed repair/reload window
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) {
      state.betweenWaves = false;
      state.dayPhase = null;
      state.spawnedThisWave = 0;
      state.toSpawn = 4 + state.wave * 2;
      state.spawnTimer = 0.35;
      state.banner = `Night ${state.wave} — hold the walls`;
      state.bannerLife = 2.2;
    }
    return;
  }

  if (state.spawnedThisWave < state.toSpawn) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state);
      state.spawnedThisWave += 1;
      state.spawnTimer = Math.max(0.45, 1.05 - state.wave * 0.08);
    }
  } else if (state.enemies.length === 0) {
    state.wave += 1;
    if (state.wave <= MAX_WAVES) {
      beginDayShop(state);
      state.gold += 22 + state.wave * 4;
    } else {
      state.betweenWaves = false;
      state.dayPhase = null;
    }
  }
}

function beginDayShop(state: GameState) {
  state.betweenWaves = true;
  state.dayPhase = "shop";
  state.dayDuration = PREP_SECONDS;
  state.waveTimer = PREP_SECONDS;
  state.confirmHeld = true; // ignore held Space/Enter from jump
  state.banner = "Quartermaster is open — take your time";
  state.bannerLife = 2.5;
}

function confirmShopReady(state: GameState) {
  if (state.dayPhase !== "shop" || state.status !== "playing") return;
  state.dayPhase = "prep";
  state.dayDuration = PREP_SECONDS;
  state.waveTimer = PREP_SECONDS;
  state.banner = "Prep time — repair & reload";
  state.bannerLife = 2;
  state.confirmHeld = true;
  state.player.jumpLocked = true;
}

function spawnEnemy(state: GameState) {
  const brute = state.wave >= 3 && Math.random() < 0.28;
  const h = brute ? 46 : 34;
  state.enemies.push({
    id: nextEnemyId++,
    kind: brute ? "brute" : "raider",
    x: state.world.width - 40,
    y: state.world.groundY - h,
    w: brute ? 28 : 22,
    h,
    hp: brute ? 78 : 28 + state.wave * 2,
    maxHp: brute ? 78 : 28 + state.wave * 2,
    speed: brute ? 40 : 68 + state.wave * 5,
    attacking: false,
    attackPhase: "none",
    phaseT: 0,
    swingScale: 1,
    swingFrom: ARM_READY,
    damage: brute ? 14 : 8,
    walkPhase: Math.random() * Math.PI * 2,
  });
}

function updateShop(state: GameState, keys: KeyState) {
  const upgrades: { code: string; id: UpgradeId }[] = [
    { code: "Digit1", id: "power" },
    { code: "Digit2", id: "magazine" },
    { code: "Digit3", id: "braces" },
    { code: "Digit4", id: "boots" },
  ];
  const hires: { code: string; id: HireId }[] = [
    { code: "Digit5", id: "runner" },
    { code: "Digit6", id: "mason" },
  ];

  for (const { code, id } of upgrades) {
    const down = Boolean(keys[code]);
    const was = Boolean(state.shopKeysHeld[id]);
    state.shopKeysHeld[id] = down;

    if (state.dayPhase !== "shop" || state.status !== "playing") continue;
    if (state.shopCooldown > 0) continue;
    if (down && !was) tryBuyUpgrade(state, id);
  }

  for (const { code, id } of hires) {
    const down = Boolean(keys[code]);
    const was = Boolean(state.shopKeysHeld[id]);
    state.shopKeysHeld[id] = down;

    if (state.dayPhase !== "shop" || state.status !== "playing") continue;
    if (state.shopCooldown > 0) continue;
    if (down && !was) tryHire(state, id);
  }
}

function tryHire(state: GameState, id: HireId) {
  if (!canHire(id, state.crew, state.gold)) {
    state.shopCooldown = 0.2;
    return;
  }

  state.gold -= hireCost(id);
  state.crew[id] = true;
  state.shopCooldown = 0.35;
  state.helpers.push(spawnHelper(state, id));

  const def = HIRE_DEFS.find((d) => d.id === id)!;
  state.banner = `Hired ${def.name}`;
  state.bannerLife = 1.6;
  addFloater(
    state,
    state.player.x + state.player.w / 2,
    state.player.y - 20,
    def.name,
    "#8fbc8f",
  );
}

function tryBuyUpgrade(state: GameState, id: UpgradeId) {
  if (!canBuy(id, state.upgrades, state.gold)) {
    state.shopCooldown = 0.2;
    return;
  }

  const cost = upgradeCost(id, state.upgrades[id]);
  state.gold -= cost;
  state.upgrades[id] += 1;
  state.shopCooldown = 0.35;
  applyUpgrade(state, id);

  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  state.banner = `${def.name} Lv ${state.upgrades[id]}`;
  state.bannerLife = 1.4;
  addFloater(
    state,
    state.player.x + state.player.w / 2,
    state.player.y - 20,
    `${def.name}!`,
    "#d8b45a",
  );
}

function applyUpgrade(state: GameState, id: UpgradeId) {
  if (id === "power") {
    for (const t of state.world.towers) t.damage += 5;
    return;
  }
  if (id === "magazine") {
    for (const t of state.world.towers) {
      t.maxAmmo += 2;
      t.ammo = Math.min(t.maxAmmo, t.ammo + 2);
    }
    return;
  }
  if (id === "braces") {
    for (const w of state.world.walls) {
      w.maxHp += 22;
      if (w.hp > 0) w.hp = Math.min(w.maxHp, w.hp + 22);
    }
    for (const t of state.world.towers) {
      t.maxHp += 12;
      if (t.hp > 0) t.hp = Math.min(t.maxHp, t.hp + 12);
    }
  }
  // boots applied via speed multiplier in movement
}

function moveSpeed(state: GameState, carrying: boolean): number {
  const boots = 1 + state.upgrades.boots * 0.12;
  const base = carrying ? 135 : 185;
  return base * boots;
}

function updatePlayer(state: GameState, keys: KeyState, dt: number) {
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
    }
  }

  if (!jump) p.jumpLocked = false;

  // leave ladder with jump
  if (jump && ladder && !p.jumpLocked && wantClimb) {
    p.onLadder = false;
    p.vy = jumpVel * 0.75;
    p.jumpLocked = true;
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
function animatePlayer(
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

function collideAxes(
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

function cannonPivot(tower: { platform: { x: number; y: number; w: number } }) {
  return {
    x: tower.platform.x + tower.platform.w * 0.55,
    y: tower.platform.y - 6,
  };
}

function slewAim(tower: { aimAngle: number }, desired: number, dt: number, rate: number) {
  let delta = desired - tower.aimAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  tower.aimAngle += delta * Math.min(1, dt * rate);
}

function updateTowers(state: GameState, dt: number) {
  for (const tower of state.world.towers) {
    tower.muzzleFlash = Math.max(0, tower.muzzleFlash - dt);
    tower.recoil = Math.max(0, tower.recoil - dt * 4);

    if (tower.hp <= 0) continue;

    const pivot = cannonPivot(tower);
    const armed = tower.ammo > 0;

    // Empty guns go dormant — droop and stop tracking
    if (!armed) {
      slewAim(tower, 0.52, dt, 2.4);
      continue;
    }

    let best: Enemy | null = null;
    let bestDist = tower.range * 1.05;

    for (const e of state.enemies) {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const dist = Math.hypot(cx - pivot.x, cy - pivot.y);
      // Any raider in range — including those under the tower base
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }

    if (best) {
      // Lead moving raiders so the barrel visibly tracks them
      const lead = 0.18;
      const tx = best.x + best.w / 2 - best.speed * lead;
      const ty = best.y + best.h * 0.45;
      const desired = Math.atan2(ty - pivot.y, tx - pivot.x);
      slewAim(tower, desired, dt, 10);
    } else {
      // Armed but idle — stay ready, slightly elevated downrange
      slewAim(tower, -0.18, dt, 2.2);
    }

    tower.fireTimer -= dt;
    if (tower.fireTimer > 0 || !best) continue;

    // Fire along the true line to the target so near-base shots aren't blocked by lag
    const aimTx = best.x + best.w / 2;
    const aimTy = best.y + best.h * 0.45;
    const ang = Math.atan2(aimTy - pivot.y, aimTx - pivot.x);
    tower.aimAngle = ang;

    const barrelLen = 28;
    const muzzleX = pivot.x + Math.cos(ang) * barrelLen;
    const muzzleY = pivot.y + Math.sin(ang) * barrelLen;
    const speed = 440;
    state.projectiles.push({
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      damage: tower.damage,
      life: 1.4,
    });
    tower.ammo -= 1;
    tower.fireTimer = tower.fireCooldown;
    tower.muzzleFlash = 0.12;
    tower.recoil = 1;

    if (tower.ammo === 0) {
      addFloater(state, pivot.x, pivot.y - 24, "EMPTY!", "#e8a050");
    }
  }
}

function updateProjectiles(state: GameState, dt: number) {
  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }

  state.projectiles = state.projectiles.filter((p) => {
    if (p.life <= 0) return false;
    for (const e of state.enemies) {
      if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) {
        e.hp -= p.damage;
        addFloater(state, e.x + e.w / 2, e.y, `-${p.damage}`, "#f0d080");
        return false;
      }
    }
    return true;
  });

  const before = state.enemies.length;
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  const killed = before - state.enemies.length;
  if (killed > 0) state.gold += killed * 4;
}

function updateEnemies(state: GameState, dt: number) {
  const gate = state.world.gateX;

  for (const e of state.enemies) {
    const target = easternStructure(state);

    if (!target) {
      e.x -= e.speed * dt;
      // last structure fell mid-swing — drop the pose and march for the gate
      e.attacking = false;
      e.attackPhase = "none";
      e.phaseT = 0;
      e.walkPhase += dt * (e.speed * 0.08);
      if (e.x + e.w < gate - 40) {
        state.lives -= 1;
        e.hp = 0;
        state.shake = Math.max(state.shake, 6);
        state.banner = "Breach! A raider got through";
        state.bannerLife = 1.8;
      }
      continue;
    }

    if (e.x > target.edge + 2) {
      e.x -= e.speed * dt;
      e.attacking = false;
      e.attackPhase = "none";
      e.phaseT = 0;
      e.walkPhase += dt * (e.speed * 0.08);
    } else {
      if (!e.attacking) {
        e.attacking = true;
        beginWindup(e);
      }
      e.phaseT += dt;
      const timing = swingTiming(e.kind, e.swingScale);
      if (e.attackPhase === "windup" && e.phaseT >= timing.windup) {
        e.attackPhase = "strike";
        e.phaseT -= timing.windup;
      }
      if (e.attackPhase === "strike" && e.phaseT >= timing.strike) {
        // club meets the wall on the last frame of the downswing
        damageStructure(state, target.id, e.damage);
        spawnImpact(state, e, target);
        e.attackPhase = "recover";
        e.phaseT -= timing.strike;
      }
      if (e.attackPhase === "recover" && e.phaseT >= timing.recover) {
        beginWindup(e);
      }
    }
  }

  state.enemies = state.enemies.filter((e) => e.hp > 0);

  for (const wall of state.world.walls) {
    if (wall.hp < 0) wall.hp = 0;
  }
}

function beginWindup(e: Enemy) {
  e.swingFrom =
    e.attackPhase === "none" ? marchArm(e.walkPhase) : ARM_READY;
  e.attackPhase = "windup";
  e.phaseT = 0;
  e.swingScale = 0.9 + Math.random() * 0.2;
}

function spawnImpact(
  state: GameState,
  e: Enemy,
  target: { id: string; edge: number },
) {
  const brute = e.kind === "brute";
  const isWall = state.world.walls.some((w) => w.id === target.id);
  const chips = isWall
    ? ["#958675", "#7a6d5c", "#5a4a3a"]
    : ["#6e6458", "#5c5348", "#3a342c"];
  const x = target.edge;
  const y = e.y + (brute ? 25 : 22);

  const chipCount = brute ? 9 : 6;
  for (let i = 0; i < chipCount; i++) {
    // fly back out of the wall face (east) and up, then fall
    const ang = -Math.PI * (0.05 + Math.random() * 0.45);
    const spd = (brute ? 120 : 90) + Math.random() * 90;
    state.debris.push({
      kind: "chip",
      x: x + Math.random() * 3,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
      size: 1.5 + Math.random() * (brute ? 3 : 2),
      spin: (Math.random() - 0.5) * 20,
      color: chips[Math.floor(Math.random() * chips.length)],
    });
  }
  for (let i = 0; i < (brute ? 3 : 2); i++) {
    state.debris.push({
      kind: "dust",
      x: x + 4 + Math.random() * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: 18 + Math.random() * 22,
      vy: -10 - Math.random() * 14,
      life: 0.5 + Math.random() * 0.2,
      maxLife: 0.7,
      size: brute ? 9 : 7,
      spin: 0,
      color: "200, 186, 164",
    });
  }
  state.debris.push({
    kind: "spark",
    x: x + 1,
    y,
    vx: 0,
    vy: 0,
    life: 0.1,
    maxLife: 0.1,
    size: brute ? 13 : 10,
    spin: Math.random() * Math.PI,
    color: "#fff2d0",
  });
}

function updateDebris(state: GameState, dt: number) {
  const ground = state.world.groundY;
  for (const d of state.debris) {
    d.life -= dt;
    if (d.kind === "chip") {
      d.vy += 620 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > ground - d.size) {
        // bounce once, then skid to a stop
        d.y = ground - d.size;
        d.vy *= -0.3;
        d.vx *= 0.55;
      }
    } else if (d.kind === "dust") {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - Math.min(1, dt * 3);
      d.size += dt * 16;
    }
  }
  state.debris = state.debris.filter((d) => d.life > 0);
}

function easternStructure(state: GameState): { id: string; edge: number } | null {
  let best: { id: string; edge: number } | null = null;

  for (const w of state.world.walls) {
    if (w.hp <= 0) continue;
    const edge = w.body.x + w.body.w;
    if (!best || edge > best.edge) best = { id: w.id, edge };
  }
  for (const t of state.world.towers) {
    if (t.hp <= 0) continue;
    const edge = t.base.x + t.base.w;
    if (!best || edge > best.edge) best = { id: t.id, edge };
  }

  return best;
}

function damageStructure(state: GameState, id: string, amount: number) {
  const wall = state.world.walls.find((w) => w.id === id);
  if (wall) {
    wall.hp -= amount;
    state.shake = Math.max(state.shake, 3.5);
    addFloater(
      state,
      wall.body.x + wall.body.w / 2,
      wall.body.y,
      `-${amount}`,
      "#c45c2a",
    );
    if (wall.hp <= 0) {
      wall.hp = 0;
      addFloater(
        state,
        wall.body.x + wall.body.w / 2,
        wall.body.y - 10,
        "WALL DOWN",
        "#e8dcc8",
      );
      // remove wall-top platform so path opens / can't stand on ghost wall
      state.world.platforms = state.world.platforms.filter(
        (p) =>
          !(
            p.kind === "wallTop" &&
            p.x === wall.body.x &&
            p.y === wall.body.y
          ),
      );
    }
    return;
  }

  const tower = state.world.towers.find((t) => t.id === id);
  if (tower) {
    tower.hp -= amount;
    state.shake = Math.max(state.shake, 4);
    addFloater(
      state,
      tower.base.x + tower.base.w / 2,
      tower.platform.y,
      `-${amount}`,
      "#c45c2a",
    );
    if (tower.hp <= 0) {
      tower.hp = 0;
      tower.ammo = 0;
      addFloater(
        state,
        tower.base.x + tower.base.w / 2,
        tower.platform.y - 10,
        "TOWER RUINED",
        "#e8dcc8",
      );
    }
  }
}

function updatePrompt(state: GameState, keys: KeyState) {
  const p = state.player;
  const body = expand(playerRect(p), 10);
  let prompt = "";
  let action: (() => void) | null = null;

  if (!p.carrying) {
    for (const s of state.world.supplies) {
      if (rectsOverlap(body, s.body)) {
        prompt = `Act — pick up ${s.kind}`;
        action = () => {
          p.carrying = s.kind;
          addFloater(state, p.x + p.w / 2, p.y, s.kind.toUpperCase(), "#e8dcc8");
        };
        break;
      }
    }
  } else if (p.carrying === "ammo") {
    for (const t of state.world.towers) {
      if (t.hp <= 0) continue;
      if (rectsOverlap(body, expand(t.platform, 8))) {
        if (t.ammo >= t.maxAmmo) {
          prompt = "Tower full";
        } else {
          prompt = "Act — reload tower";
          action = () => {
            const need = t.maxAmmo - t.ammo;
            const add = Math.min(need, 3);
            t.ammo += add;
            p.carrying = null;
            addFloater(
              state,
              t.platform.x + t.platform.w / 2,
              t.platform.y - 20,
              `+${add} ammo`,
              "#d8b45a",
            );
          };
        }
        break;
      }
    }
    if (!prompt) {
      prompt = "Drop — drop ammo";
      if (keys["KeyX"] && p.interactCooldown <= 0) {
        p.carrying = null;
        p.interactCooldown = 0.25;
      }
    }
  } else if (p.carrying === "stone") {
    const wall = state.world.walls.find(
      (w) => w.hp > 0 && w.hp < w.maxHp && rectsOverlap(body, expand(w.body, 16)),
    );
    const ruinedWall = state.world.walls.find(
      (w) => w.hp <= 0 && rectsOverlap(body, expand(w.body, 16)),
    );
    const tower = state.world.towers.find(
      (t) => t.hp < t.maxHp && rectsOverlap(body, expand(t.base, 16)),
    );

    if (wall) {
      prompt = "Act — repair wall";
      action = () => {
        const before = wall.hp;
        wall.hp = Math.min(wall.maxHp, wall.hp + 32);
        p.carrying = null;
        addFloater(
          state,
          wall.body.x + wall.body.w / 2,
          wall.body.y - 12,
          `+${wall.hp - before} hp`,
          "#8fbc8f",
        );
      };
    } else if (ruinedWall) {
      prompt = "Act — rebuild wall";
      action = () => {
        ruinedWall.hp = Math.floor(ruinedWall.maxHp * 0.45);
        p.carrying = null;
        // restore platform if missing
        const exists = state.world.platforms.some(
          (pl) =>
            pl.kind === "wallTop" &&
            pl.x === ruinedWall.body.x &&
            pl.y === ruinedWall.body.y,
        );
        if (!exists) {
          state.world.platforms.push({
            kind: "wallTop",
            x: ruinedWall.body.x,
            y: ruinedWall.body.y,
            w: ruinedWall.body.w,
            h: 12,
          });
        }
        addFloater(
          state,
          ruinedWall.body.x + ruinedWall.body.w / 2,
          ruinedWall.body.y - 12,
          "REBUILT",
          "#8fbc8f",
        );
      };
    } else if (tower) {
      prompt = tower.hp <= 0 ? "Act — rebuild tower" : "Act — repair tower";
      action = () => {
        const before = Math.max(0, tower.hp);
        if (tower.hp <= 0) tower.hp = Math.floor(tower.maxHp * 0.4);
        else tower.hp = Math.min(tower.maxHp, tower.hp + 26);
        p.carrying = null;
        addFloater(
          state,
          tower.base.x + tower.base.w / 2,
          tower.platform.y - 12,
          `+${tower.hp - before} hp`,
          "#8fbc8f",
        );
      };
    } else {
      prompt = "Drop — drop stone";
      if (keys["KeyX"] && p.interactCooldown <= 0) {
        p.carrying = null;
        p.interactCooldown = 0.25;
      }
    }
  }

  if (!prompt) {
    const ladder = findLadder(state, playerRect(p));
    if (ladder) prompt = "↑/↓ climb · Jump to leap off";
  }

  state.prompt = prompt;

  if (action && keys["KeyZ"] && p.interactCooldown <= 0) {
    action();
    p.interactCooldown = 0.28;
  }
}

function updateFloaters(state: GameState, dt: number) {
  for (const f of state.floaters) {
    f.life -= dt;
    f.y += f.vy * dt;
  }
  state.floaters = state.floaters.filter((f) => f.life > 0);
}

function addFloater(
  state: GameState,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  state.floaters.push({
    x,
    y,
    text,
    life: 0.9,
    maxLife: 0.9,
    color,
    vy: -28,
  });
}

type ViewInsets = { left: number; right: number };

/** 83.4 → "1:23.4", 3723.4 → "1:02:03.4" */
export function formatRunTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const t = tenths % 10;
  const total = Math.floor(tenths / 10);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${ss}.${t}`
    : `${m}:${ss}.${t}`;
}

function updateCamera(state: GameState, canvas: HTMLCanvasElement, insets: ViewInsets) {
  const zoom = worldZoom(
    canvas.clientWidth || canvas.width,
    canvas.clientHeight || canvas.height,
    state.world,
  );
  // camera works in world units: the visible slice shrinks as we zoom in
  const viewW = (canvas.clientWidth || canvas.width) / zoom;
  const viewH = (canvas.clientHeight || canvas.height) / zoom;
  const targetX = state.player.x + state.player.w / 2 - viewW / 2;
  const targetY = state.player.y + state.player.h / 2 - viewH / 2 - 40;
  // Touch controls cover the stage edges: let the camera scroll past the world edge
  // far enough that the crate / far wall sit beside the buttons, not under them
  const minX = -insets.left / zoom;
  const maxX = Math.max(minX, state.world.width - viewW + insets.right / zoom);
  const maxY = Math.max(0, state.world.height - viewH);
  const tx = clamp(targetX, minX, maxX);
  const ty = clamp(targetY, 0, maxY);
  // soft follow
  state.camera.x += (tx - state.camera.x) * Math.min(1, 0.12);
  state.camera.y += (ty - state.camera.y) * Math.min(1, 0.12);
}

function findLadder(state: GameState, body: Rect) {
  return state.world.towers
    .map((t) => t.ladder)
    .find((l) => rectsOverlap(body, expand(l, 8)));
}

function playerRect(p: Player): Rect {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
