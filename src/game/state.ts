/** A fresh run's starting state. */
import { ACTS } from "./acts";
import { PREP_SECONDS } from "./constants";
import type { ActId, GameState } from "./types";
import { resetEnemyIds } from "./waves";
import { freshCrew, freshVeterans } from "../hires";
import { freshUpgrades } from "../upgrades";
import { createWorld } from "../world";

export function freshState(status: GameState["status"] = "menu", act: ActId = 1): GameState {
  // ids seed per-enemy timing jitter; restart them so every run is identical
  resetEnemyIds();
  const world = createWorld(act);
  const info = ACTS[act];
  const playing = status === "playing";
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
      stunTimer: 0,
    },
    enemies: [],
    projectiles: [],
    bombs: [],
    floaters: [],
    debris: [],
    corpses: [],
    nightBlend: 0,
    helpers: [],
    camera: { x: 0, y: 0 },
    shake: 0,
    prompt: "",
    // Act 1's first night skips the shop (straight into prep, no upgrades);
    // Act 2 opens with the shop so its fixed starting purse can be spent
    banner: playing ? info.openingBanner : "",
    bannerLife: playing ? 2.8 : 0,
    wave: 1,
    waveTimer: PREP_SECONDS,
    dayDuration: PREP_SECONDS,
    dayPhase: playing && !info.startsInShop ? "prep" : "shop",
    betweenWaves: true,
    spawnedThisWave: 0,
    toSpawn: 4,
    spawnTimer: 0,
    gold: info.startGold,
    upgrades: freshUpgrades(),
    crew: freshCrew(),
    veterans: freshVeterans(),
    shopCooldown: 0,
    shopKeysHeld: {},
    confirmHeld: true,
    lives: 3,
    status,
    elapsed: 0,
    runTime: 0,
    act,
  };
}
