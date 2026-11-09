/** Day/night cycle, the fixed wave roster and enemy spawning. */
import { ARM_READY } from "../enemyPose";
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

/** Prep timer ran out: raiders start coming. (Sound hook: night horn.) */
export function beginNight(state: GameState) {
  state.betweenWaves = false;
  state.dayPhase = null;
  state.spawnedThisWave = 0;
  state.toSpawn = 4 + state.wave * 2;
  state.spawnTimer = 0.35;
  state.banner = `Night ${state.wave} — hold the walls`;
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

/** Share of each night's raiders that are brutes (from night 3 on). */
export const BRUTE_SHARE = 0.28;

/**
 * Fixed wave roster so every run faces the same nights (fair leaderboard).
 * Brutes are spread evenly through the night — same count and order every run:
 * night 3: 3 of 10, night 4: 3 of 12, night 5: 4 of 14 (≈ the old 28% average).
 */
export function isBruteSlot(wave: number, index: number, total: number): boolean {
  if (wave < 3 || total <= 0) return false;
  const brutes = Math.round(total * BRUTE_SHARE);
  return Math.floor(((index + 1) * brutes) / total) > Math.floor((index * brutes) / total);
}

export function spawnEnemy(state: GameState) {
  const brute = isBruteSlot(state.wave, state.spawnedThisWave, state.toSpawn);
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
    swingCount: 0,
    damage: brute ? 14 : 8,
    walkPhase: Math.random() * Math.PI * 2,
  });
}
