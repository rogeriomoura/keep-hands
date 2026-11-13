/** Particles, cannonballs, floating text and the action prompt. */
import type { GameState } from "../game/types";
import { withTextBoost } from "./shared";

export function drawDebris(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const d of state.debris) {
    const t = Math.max(0, d.life / d.maxLife);
    if (d.kind === "chip") {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life / 0.2);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin * (d.maxLife - d.life));
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    } else if (d.kind === "smoke") {
      ctx.fillStyle = `rgba(${d.color}, ${0.42 * t})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "fire") {
      // quick fireball: bright core inside an orange bloom
      ctx.fillStyle = `rgba(${d.color}, ${0.75 * t})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 245, 210, ${0.9 * t})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "dust") {
      ctx.fillStyle = `rgba(${d.color}, ${0.35 * t})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // strike spark: a quick star burst at the contact point
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin);
      ctx.globalAlpha = t;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      const r = d.size * (1.2 - t * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const inner = i % 2 === 0 ? 0.25 : 0.4;
        ctx.moveTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner);
        ctx.lineTo(Math.cos(a) * r * (i % 2 === 0 ? 1 : 0.6), Math.sin(a) * r * (i % 2 === 0 ? 1 : 0.6));
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** Act 2 bombs: a black ball with a fizzing fuse. */
export function drawBombs(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const b of state.bombs) {
    ctx.fillStyle = "#1a1a18";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a4a44";
    ctx.beginPath();
    ctx.arc(b.x - 1.5, b.y - 1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    const flick = 0.6 + 0.4 * Math.sin(state.elapsed * 40 + b.x);
    ctx.fillStyle = `rgba(255, 190, 90, ${flick})`;
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y - 7, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const p of state.projectiles) {
    ctx.fillStyle = "#2a2a28";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a6a60";
    ctx.beginPath();
    ctx.arc(p.x - 1.2, p.y - 1.2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFloaters(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const f of state.floaters) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    withTextBoost(ctx, f.x, f.y, () => {
      ctx.fillStyle = f.color;
      ctx.font = "700 13px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, 0, 0);
      ctx.textAlign = "left";
    });
    ctx.globalAlpha = 1;
  }
}

export function drawPrompt(ctx: CanvasRenderingContext2D, state: GameState) {
  if (!state.prompt) return;
  const p = state.player;
  const text = state.prompt;
  // anchored just above the head; the box grows upward when text is boosted
  withTextBoost(ctx, p.x + p.w / 2, p.y - 12, () => {
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = "rgba(20, 16, 12, 0.82)";
    ctx.fillRect(-w / 2, -24, w, 24);
    ctx.fillStyle = "#f0e6d4";
    ctx.fillText(text, -w / 2 + 8, -8);
  });
}
