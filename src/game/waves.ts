/** Day/night cycle, the fixed wave roster and enemy spawning. */
import { ARM_READY } from "../enemyPose";
import { ACTS, BOMB_FIRST_DELAY, BOMBER_ALTITUDE, enemyStats, nightSize, slotKind, spawnInterval } from "./acts";
import { MAX_WAVES, PREP_SECONDS } from "./constants";
import type { GameState } from "./types";
import type { KeyState } from "../input";
import { sfx } from "../sfx";

let nextEnemyId = 1;

/** Enemy ids seed per-enemy timing jitter; restarting them keeps every run identical. */
export function resetEnemyIds() {
  nextEnemyId = 1;
}

export function updateWaves(state: GameState, dt: number, keys: KeyState) {
  if (state.wave > MAX_WAVES) return;

  if (state.betweenWaves) {
    if (state.dayPhase === "shop") {
      const confirm = Boolean(keys["Enter"]);
      const was = state.confirmHeld;
      state.confirmHeld = confirm;
      if (confirm && !was) {
        sfx.uiClick();
        confirmShopReady(state);
      }
      return;
    }

    // Timed repair/reload window
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) beginNight(state);
    return;
  }

  if (state.spawnedThisWave < state.toSpawn) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state);
      state.spawnedThisWave += 1;
      state.spawnTimer = spawnInterval(state.act, state.wave);
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

/** Prep timer ran out: raiders start coming. (Sound hook: night horn.) */
export function beginNight(state: GameState) {
  state.betweenWaves = false;
  state.dayPhase = null;
  state.spawnedThisWave = 0;
  state.toSpawn = nightSize(state.act, state.wave);
  state.spawnTimer = 0.35;
  state.banner = ACTS[state.act].nightBanner(state.wave);
  state.bannerLife = 2.2;
  sfx.nightStarted();
}

export function beginDayShop(state: GameState) {
  state.betweenWaves = true;
  state.dayPhase = "shop";
  state.dayDuration = PREP_SECONDS;
  state.waveTimer = PREP_SECONDS;
  state.confirmHeld = true; // ignore held Space/Enter from jump
  state.banner = "Quartermaster is open — take your time";
  state.bannerLife = 2.5;
  sfx.nightEnded();
}

export function confirmShopReady(state: GameState) {
  if (state.dayPhase !== "shop" || state.status !== "playing") return;
  state.dayPhase = "prep";
  state.dayDuration = PREP_SECONDS;
  state.waveTimer = PREP_SECONDS;
  state.banner = "Prep time — repair & reload";
  state.bannerLife = 2;
  state.confirmHeld = true;
  state.player.jumpLocked = true;
}

// The fixed rosters live in acts.ts; re-exported for existing importers.
export { BRUTE_SHARE, isBruteSlot } from "./acts";

export function spawnEnemy(state: GameState) {
  const kind = slotKind(state.act, state.wave, state.spawnedThisWave, state.toSpawn);
  const stats = enemyStats(state.act, state.wave, kind);
  const bomber = kind === "bomber";
  state.enemies.push({
    id: nextEnemyId++,
    kind,
    // bombers enter from just past the right edge so they drift into view
    x: bomber ? state.world.width + 10 : state.world.width - 40,
    y: bomber ? state.world.groundY - BOMBER_ALTITUDE : state.world.groundY - stats.h,
    w: stats.w,
    h: stats.h,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    attacking: false,
    attackPhase: "none",
    phaseT: 0,
    swingScale: 1,
    swingFrom: ARM_READY,
    swingCount: 0,
    damage: stats.damage,
    // cosmetic only (march sway / balloon bob)
    walkPhase: Math.random() * Math.PI * 2,
    bombTimer: BOMB_FIRST_DELAY,
  });
}
