/** Shared game state types. */
import type { Corpse } from "../effects";
import type { AttackPhase } from "../enemyPose";
import type { Helper } from "../helpers";
import type { Crew, HireId } from "../hires";
import type { UpgradeId, Upgrades } from "../upgrades";
import type { World } from "../world";

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
  /** Seconds left knocked down by a bomb blast (no input while > 0) */
  stunTimer: number;
};

export type Enemy = {
  id: number;
  kind: "raider" | "brute" | "bomber";
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
  /** Swings taken so far; seeds the deterministic tempo jitter */
  swingCount: number;
  /** Arm angle when the windup began, so the raise starts from the march pose */
  swingFrom: number;
  damage: number;
  walkPhase: number;
  /** Bombers only: seconds until the next bomb may drop */
  bombTimer: number;
};

/** A bomb dropped by a bomber: falls straight down, bursts on a structure or the ground */
export type Bomb = {
  x: number;
  y: number;
  vy: number;
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
  kind: "chip" | "dust" | "spark" | "smoke" | "fire";
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
  /** Act 2: bombs in flight */
  bombs: Bomb[];
  floaters: Floater[];
  debris: Debris[];
  /** Cosmetic only: felled enemies playing their fall (never part of `enemies`) */
  corpses: Corpse[];
  /** Cosmetic only: 0 = day sky, 1 = night sky; eases across wave changes */
  nightBlend: number;
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
  /** Act 2: hired helpers promoted once (faster; runner loads more, mason repairs more) */
  veterans: Crew;
  shopCooldown: number;
  shopKeysHeld: Partial<Record<UpgradeId | HireId, boolean>>;
  confirmHeld: boolean;
  lives: number;
  status: "menu" | "playing" | "won" | "lost";
  elapsed: number;
  /** Seconds of actual play (prep + nights); frozen while the shop is open or the run is over */
  runTime: number;
  /** Which act this run plays (separate layout, roster and leaderboard) */
  act: ActId;
};

export type ActId = 1 | 2;

export type ViewInsets = { left: number; right: number };

/** Stage size in CSS px (what the camera and zoom are computed from) */
export type ViewSize = { width: number; height: number };
