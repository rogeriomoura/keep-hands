import type { GameState } from "./game/types";
import { drawHelpers } from "./render/crew";
import { drawCorpses, drawEnemies } from "./render/enemies";
import { drawDebris, drawFloaters, drawProjectiles, drawPrompt } from "./render/fx";
import { drawBanner, drawDayTimer } from "./render/hud";
import { drawPlayer } from "./render/player";
import { drawBackdrop, drawGround, drawSupplies, drawTowers, drawWalls } from "./render/scenery";
import { setTextBoost } from "./render/shared";
import { worldZoom } from "./world";

export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  const { world, camera } = state;
  const viewW = ctx.canvas.clientWidth || ctx.canvas.width;
  const viewH = ctx.canvas.clientHeight || ctx.canvas.height;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;

  ctx.save();
  const zoom = worldZoom(viewW, viewH, world);
  // when zoomed out, world-space labels grow back so they stay readable
  setTextBoost(1 / Math.min(1, zoom));
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

  drawBackdrop(ctx, world.width, world.height, state.nightBlend);
  drawGround(ctx, world);
  drawWalls(ctx, state);
  drawTowers(ctx, state);
  drawSupplies(ctx, state);
  drawCorpses(ctx, state);
  drawEnemies(ctx, state);
  drawDebris(ctx, state);
  drawProjectiles(ctx, state);
  drawHelpers(ctx, state);
  drawPlayer(ctx, state);
  drawFloaters(ctx, state);
  drawPrompt(ctx, state);

  ctx.restore();

  drawDayTimer(ctx, state, viewW, viewH);
  drawBanner(ctx, state, viewW, viewH);
}
