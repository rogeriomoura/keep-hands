/** Screen-space overlays: prep clock, shop, banner. */
import type { GameState } from "../game/types";
import { canHire, HIRE_DEFS, hireCost } from "../hires";
import { overlayScale, roundRect } from "./shared";
import { getShopLayout } from "../shopLayout";
import { canBuy, UPGRADE_DEFS, upgradeCost } from "../upgrades";

export function drawDayTimer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  if (!state.betweenWaves || state.status !== "playing") return;
  if (state.wave > 5) return;

  if (state.dayPhase === "shop") {
    drawShopPhase(ctx, state, viewW, viewH);
    return;
  }

  drawPrepPhase(ctx, state, viewW, viewH);
}

export function drawShopPhase(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  const layout = getShopLayout(viewW, viewH);
  const { cx, panelW, panelH, top, upgradeY, hireY } = layout;

  ctx.save();
  ctx.fillStyle = "rgba(12, 10, 8, 0.45)";
  ctx.fillRect(0, 0, viewW, viewH);
  // layout is in design units; shrink the whole panel on short/narrow screens
  ctx.scale(layout.scale, layout.scale);

  ctx.fillStyle = "rgba(18, 14, 10, 0.9)";
  roundRect(ctx, cx - panelW / 2, top, panelW, panelH, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 220, 200, 0.4)";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - panelW / 2, top, panelW, panelH, 12);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#f0e6d4";
  ctx.font = "700 28px Cormorant Garamond, serif";
  ctx.fillText("Quartermaster", cx, top + 40);

  ctx.fillStyle = "#a89880";
  ctx.font = "500 13px IBM Plex Sans, sans-serif";
  ctx.fillText(
    `Paused · Night ${state.wave} waiting · Gold ${state.gold}`,
    cx,
    top + 64,
  );

  ctx.fillStyle = "#cbb89a";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("UPGRADES — click or tap a card", cx, upgradeY);

  layout.upgrades.forEach((slot, i) => {
    const def = UPGRADE_DEFS[i]!;
    const level = state.upgrades[def.id];
    const maxed = level >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(def.id, level);
    const affordable = canBuy(def.id, state.upgrades, state.gold);
    drawShopCard(
      ctx,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      def.key,
      def.name,
      def.blurb,
      maxed ? `MAX · Lv ${level}` : `Lv ${level} → ${level + 1}`,
      maxed ? "Owned" : `${cost} gold`,
      maxed,
      affordable,
    );
  });

  ctx.fillStyle = "#cbb89a";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("HIRE HELP", cx, hireY);

  layout.hires.forEach((slot, i) => {
    const def = HIRE_DEFS[i]!;
    const owned = state.crew[def.id];
    const affordable = canHire(def.id, state.crew, state.gold);
    drawShopCard(
      ctx,
      slot.rect.x,
      slot.rect.y,
      slot.rect.w,
      slot.rect.h,
      def.key,
      def.name,
      def.blurb,
      def.detail,
      owned ? "On payroll" : `${hireCost(def.id)} gold`,
      owned,
      affordable,
    );
  });

  const r = layout.ready;
  ctx.fillStyle = "rgba(140, 80, 36, 0.95)";
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 180, 90, 0.7)";
  ctx.lineWidth = 2;
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.stroke();
  ctx.fillStyle = "#fff6e8";
  ctx.font = "700 15px IBM Plex Sans, sans-serif";
  ctx.fillText("Ready — begin 15s prep", cx, r.y + 26);

  ctx.textAlign = "left";
  ctx.restore();
}

export function drawShopCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  key: string,
  name: string,
  blurb: string,
  line: string,
  price: string,
  owned: boolean,
  affordable: boolean,
) {
  ctx.fillStyle = affordable
    ? "rgba(60, 48, 32, 0.9)"
    : "rgba(36, 30, 24, 0.9)";
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = owned
    ? "rgba(106, 143, 106, 0.7)"
    : affordable
      ? "rgba(216, 180, 90, 0.55)"
      : "rgba(90, 78, 64, 0.5)";
  ctx.stroke();

  const mid = x + w / 2;
  ctx.fillStyle = "#d8b45a";
  ctx.font = "700 17px Cormorant Garamond, serif";
  ctx.fillText(key, mid, y + 22);

  ctx.fillStyle = "#f0e6d4";
  ctx.font = "700 13px IBM Plex Sans, sans-serif";
  ctx.fillText(name, mid, y + 42);

  ctx.fillStyle = "#a89880";
  ctx.font = "500 11px IBM Plex Sans, sans-serif";
  ctx.fillText(blurb, mid, y + 60);
  ctx.fillText(line, mid, y + 78);

  ctx.fillStyle = owned ? "#6a8f6a" : affordable ? "#e8dcc8" : "#7a6e60";
  ctx.font = "700 12px IBM Plex Sans, sans-serif";
  ctx.fillText(price, mid, y + 98);
}

export function drawPrepPhase(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  const secs = Math.max(0, state.waveTimer);
  const whole = Math.ceil(secs);
  const progress = state.dayDuration > 0 ? secs / state.dayDuration : 0;
  const urgent = secs <= 5;

  // draw in a scaled frame centred at the top so the clock shrinks on short stages
  const k = overlayScale(viewH);
  const cx = 0;
  const cy = Math.max(110, (viewH * 0.2) / k);

  ctx.save();
  ctx.translate(viewW / 2, 0);
  ctx.scale(k, k);

  if (k < 0.8) {
    // short stage (phone): slim one-panel clock that stays above the tower tops
    const top = 56;
    ctx.fillStyle = "rgba(18, 14, 10, 0.62)";
    roundRect(ctx, -160, top, 320, 64, 10);
    ctx.fill();
    ctx.strokeStyle = urgent ? "rgba(196, 92, 42, 0.85)" : "rgba(232, 220, 200, 0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, -160, top, 320, 64, 10);
    ctx.stroke();
    ctx.fillStyle = "#a89880";
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    ctx.fillText("PREP — REPAIR & RELOAD", -142, top + 24);
    ctx.fillStyle = "rgba(20, 16, 12, 0.7)";
    ctx.fillRect(-142, top + 36, 200, 8);
    ctx.fillStyle = urgent ? "#c45c2a" : "#d8b45a";
    ctx.fillRect(-142, top + 36, 200 * progress, 8);
    ctx.fillStyle = urgent ? "#e8a050" : "#f0e6d4";
    ctx.font = "700 44px Cormorant Garamond, serif";
    ctx.textAlign = "center";
    ctx.fillText(String(whole), 108, top + 48);
    ctx.textAlign = "left";
    ctx.restore();
    return;
  }

  ctx.fillStyle = "rgba(18, 14, 10, 0.58)";
  roundRect(ctx, cx - 180, cy - 58, 360, 110, 10);
  ctx.fill();

  ctx.strokeStyle = urgent ? "rgba(196, 92, 42, 0.85)" : "rgba(232, 220, 200, 0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - 180, cy - 58, 360, 110, 10);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#a89880";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText("PREP — REPAIR & RELOAD", cx, cy - 32);

  ctx.fillStyle = urgent ? "#e8a050" : "#f0e6d4";
  ctx.font = "700 48px Cormorant Garamond, serif";
  ctx.fillText(String(whole), cx, cy + 18);

  ctx.fillStyle = "#cbb89a";
  ctx.font = "500 12px IBM Plex Sans, sans-serif";
  ctx.fillText(`Night ${state.wave} begins when the clock hits zero`, cx, cy + 38);

  const barW = 240;
  const barX = cx - barW / 2;
  const barY = cy + 48;
  ctx.fillStyle = "rgba(20, 16, 12, 0.7)";
  ctx.fillRect(barX, barY, barW, 7);
  ctx.fillStyle = urgent ? "#c45c2a" : "#d8b45a";
  ctx.fillRect(barX, barY, barW * progress, 7);

  ctx.textAlign = "left";
  ctx.restore();
}

export function drawBanner(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewW: number,
  viewH: number,
) {
  if (state.bannerLife <= 0 || !state.banner) return;

  const a = Math.min(1, state.bannerLife);
  const y = state.betweenWaves ? 16 : 28;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(viewW / 2, 0);
  ctx.scale(overlayScale(viewH), overlayScale(viewH));
  ctx.fillStyle = "rgba(18, 14, 10, 0.7)";
  roundRect(ctx, -200, y, 400, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#f0e6d4";
  ctx.font = "600 16px Cormorant Garamond, serif";
  ctx.textAlign = "center";
  ctx.fillText(state.banner, 0, y + 24);
  ctx.textAlign = "left";
  ctx.restore();
}
