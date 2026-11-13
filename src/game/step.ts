/**
 * Headless simulation entry points (no canvas/DOM): the browser loop in
 * src/game.ts and the tests both drive the game through these.
 */
import { capDebris, updateCorpses, updateSky } from "../effects";
import { updateHelpers } from "../helpers";
import type { KeyState } from "../input";
import { sfx } from "../sfx";
import { updateBombs } from "./bombers";
import { updateCamera } from "./camera";
import { MAX_STEP_SECONDS, MAX_WAVES } from "./constants";
import { updateEnemies } from "./enemies";
import { updatePrompt } from "./interact";
import { updateDebris, updateFloaters } from "./particles";
import { updatePlayer } from "./player";
import { updateShop } from "./shop";
import { updateProjectiles, updateTowers } from "./towers";
import type { GameState, ViewInsets, ViewSize } from "./types";
import { updateWaves } from "./waves";

/** Input while the player is knocked down (never mutated) */
const NO_KEYS: KeyState = Object.freeze({}) as KeyState;

/**
 * Simulate one rendered frame. Slow devices run the same game speed as fast ones:
 * long frames are split into ≤20ms sub-steps instead of being clamped (which used
 * to slow the game and the run clock below 30fps). The caller caps elapsedSec.
 */
export function advance(
  state: GameState,
  keys: KeyState,
  elapsedSec: number,
  view: ViewSize,
  insets: ViewInsets,
) {
  const steps = Math.max(1, Math.ceil(elapsedSec / MAX_STEP_SECONDS));
  const dt = elapsedSec / steps;
  for (let i = 0; i < steps && state.status === "playing"; i++) {
    update(state, keys, dt, view, insets);
  }
}

/** One simulation step of `dt` seconds (≤ MAX_STEP_SECONDS when driven by advance). */
export function update(
  state: GameState,
  keys: KeyState,
  dt: number,
  view: ViewSize,
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
    // knocked down by a bomb: no movement or actions until it wears off
    const p = state.player;
    const playerKeys = p.stunTimer > 0 ? NO_KEYS : keys;
    p.stunTimer = Math.max(0, p.stunTimer - dt);
    updatePlayer(state, playerKeys, dt);
    updateHelpers(state, dt);
    updateTowers(state, dt);
    updateProjectiles(state, dt);
    updateEnemies(state, dt);
    updateBombs(state, dt);
    updatePrompt(state, playerKeys);
  } else {
    state.prompt = "";
  }

  updateFloaters(state, dt);
  updateDebris(state, dt);
  updateCorpses(state, dt);
  updateSky(state, dt);
  capDebris(state);
  updateCamera(state, view, insets);

  if (state.lives <= 0) {
    state.status = "lost";
    sfx.runEnded(false);
    state.banner = "The keep has fallen";
    state.bannerLife = 3;
  }
  if (
    state.wave > MAX_WAVES &&
    state.enemies.length === 0 &&
    !state.betweenWaves
  ) {
    state.status = "won";
    sfx.runEnded(true);
    state.banner = state.act === 2 ? "The ridge held" : "Night held";
    state.bannerLife = 3;
  }
}
