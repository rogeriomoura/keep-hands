/**
 * Game events → sounds. Purely a side effect: gameplay calls these and never
 * reads anything back. Each function is one hook in game/effects/helpers code.
 *
 * Positional sounds pan with where the source is on screen and get quieter the
 * further off-screen it is. Frequent sounds are throttled so a crowd (or the
 * sub-stepped update loop running several times per frame) can't stack them.
 */
import {
  panForScreenX,
  playSfx,
  startAmbience,
  stopAmbience,
  type SfxName,
} from "./audio";
import { worldZoom, type World } from "./world";

/** What a positional sound needs to know about the view */
type View = { camera: { x: number; y: number }; world: World };

let viewW = 0;
let viewH = 0;

/** Called by the game whenever the stage is resized (CSS px). */
export function setSfxViewport(width: number, height: number): void {
  viewW = width;
  viewH = height;
}

/** Minimum seconds between two plays of the same sound */
const MIN_GAP: Partial<Record<SfxName, number>> = {
  cannon: 0.07,
  impact: 0.06,
  clubHit: 0.06,
  maulHit: 0.08,
  enemyDeath: 0.05,
  hammer: 0.08,
  emptyClick: 0.25,
  pickup: 0.1,
  reload: 0.1,
  jump: 0.12,
  land: 0.12,
  coins: 0.1,
  uiClick: 0.05,
};

const lastPlayed = new Map<SfxName, number>();

function throttled(name: SfxName): boolean {
  const now = performance.now() / 1000;
  const gap = MIN_GAP[name] ?? 0;
  const last = lastPlayed.get(name) ?? -Infinity;
  if (now - last < gap) return true;
  lastPlayed.set(name, now);
  return false;
}

/** Play `name` as if it came from world x. */
function at(view: View, name: SfxName, worldX: number, volume = 1) {
  if (throttled(name)) return;
  let pan = 0;
  let vol = volume;
  if (viewW > 0) {
    const zoom = worldZoom(viewW, viewH, view.world);
    const screenX = (worldX - view.camera.x) * zoom;
    pan = panForScreenX(screenX, viewW);
    // off-screen sources fade with distance: 35% at one screen-width away
    const off = screenX < 0 ? -screenX : screenX > viewW ? screenX - viewW : 0;
    vol *= Math.max(0.35, 1 - (off / viewW) * 0.65);
  }
  playSfx(name, { pan, volume: vol });
}

function plain(name: SfxName, volume = 1) {
  if (throttled(name)) return;
  playSfx(name, { volume });
}

export const sfx = {
  // —— combat ——
  cannonFired: (view: View, x: number) => at(view, "cannon", x, 0.8),
  ballImpact: (view: View, x: number) => at(view, "impact", x, 0.7),
  enemyKilled: (view: View, x: number) => at(view, "enemyDeath", x),
  meleeHit: (view: View, kind: "raider" | "brute" | "bomber", x: number) =>
    at(view, kind === "brute" ? "maulHit" : "clubHit", x, kind === "brute" ? 1 : 0.8),
  /** tower bases are taller than wide; curtain walls are wider than tall */
  structureCollapsed: (view: View, body: { x: number; w: number; h: number }) =>
    at(view, body.h > body.w ? "towerRuin" : "wallCollapse", body.x + body.w / 2),
  cannonEmpty: (view: View, x: number) => at(view, "emptyClick", x, 0.8),

  // —— hauling & repairs (crew are a bit quieter than the player) ——
  pickup: (view: View, x: number, byCrew = false) => at(view, "pickup", x, byCrew ? 0.6 : 1),
  reload: (view: View, x: number, byCrew = false) => at(view, "reload", x, byCrew ? 0.65 : 1),
  hammer: (view: View, x: number, byCrew = false) => at(view, "hammer", x, byCrew ? 0.7 : 1),

  // —— player movement ——
  jump: (view: View, x: number) => at(view, "jump", x),
  /** strength 0..1 from the landing squash */
  land: (view: View, x: number, strength: number) => at(view, "land", x, 0.5 + strength * 0.5),

  // —— shop & UI ——
  purchase: () => plain("coins"),
  denied: () => plain("emptyClick", 0.5),
  uiClick: () => plain("uiClick"),

  // —— run flow ——
  nightStarted: () => {
    playSfx("nightHorn");
    startAmbience(2.5);
  },
  nightEnded: () => stopAmbience(2),
  runStarted: () => stopAmbience(0.3),
  runEnded: (won: boolean) => {
    stopAmbience(1);
    playSfx(won ? "victory" : "defeat");
  },
};
