/** A fresh run's starting state. */
import { PREP_SECONDS } from "./constants";
import type { GameState } from "./types";
import { resetEnemyIds } from "./waves";
import { freshCrew } from "../hires";
import { freshUpgrades } from "../upgrades";
import { createWorld } from "../world";

export function freshState(status: GameState["status"] = "menu"): GameState {
  // ids seed per-enemy timing jitter; restart them so every run is identical
  resetEnemyIds();
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
    corpses: [],
    nightBlend: 0,
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
