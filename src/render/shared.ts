/** Rendering helpers shared by the draw modules. */

/** Scale for world-space text (labels, prompts, floaters); > 1 when the view is zoomed out */
let textBoost = 1;

export function setTextBoost(value: number) {
  textBoost = value;
}

/** Run `draw` in a local frame at (x, y) scaled by textBoost, so text keeps its on-screen size. */
export function withTextBoost(ctx: CanvasRenderingContext2D, x: number, y: number, draw: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(textBoost, textBoost);
  draw();
  ctx.restore();
}

/** Screen-space overlays (prep clock, banner) shrink on short stages so they don't hide the towers */
export function overlayScale(viewH: number) {
  return Math.max(0.62, Math.min(1, viewH / 560));
}

/** How far past the world edges to paint sky/ground (camera can scroll there on touch) */
export const EDGE_BLEED = 1200;

/** Mix two #rrggbb colours: t = 0 → a, 1 → b */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
) {
  ctx.fillStyle = "rgba(20, 16, 12, 0.7)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * ratio), h);
}
