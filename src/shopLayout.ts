import { HIRE_DEFS, type HireId } from "./hires";
import { UPGRADE_DEFS, type UpgradeId } from "./upgrades";

export type ShopHit =
  | { kind: "upgrade"; id: UpgradeId }
  | { kind: "hire"; id: HireId }
  | { kind: "ready" };

export type ShopCardRect = { x: number; y: number; w: number; h: number };

export type ShopLayout = {
  cx: number;
  panelW: number;
  panelH: number;
  top: number;
  cardH: number;
  upgradeY: number;
  hireY: number;
  upgrades: { id: UpgradeId; rect: ShopCardRect }[];
  hires: { id: HireId; rect: ShopCardRect }[];
  ready: ShopCardRect;
};

export function getShopLayout(viewW: number, viewH: number): ShopLayout {
  const cx = viewW / 2;
  const panelW = Math.min(680, viewW - 24);
  const panelH = Math.min(460, viewH - 24);
  const top = Math.max(12, (viewH - panelH) / 2);
  const cardH = 110;

  const upgradeY = top + 98;
  const slotW = Math.min(140, (panelW - 40) / UPGRADE_DEFS.length);
  const startX = cx - (UPGRADE_DEFS.length * slotW) / 2;
  const upgrades = UPGRADE_DEFS.map((def, i) => ({
    id: def.id,
    rect: {
      x: startX + i * slotW + 8,
      y: upgradeY + 12,
      w: slotW - 16,
      h: cardH,
    },
  }));

  const hireY = upgradeY + 12 + cardH + 36;
  const hireW = Math.min(200, (panelW - 40) / HIRE_DEFS.length);
  const hireStart = cx - (HIRE_DEFS.length * hireW) / 2;
  const hires = HIRE_DEFS.map((def, i) => ({
    id: def.id,
    rect: {
      x: hireStart + i * hireW + 8,
      y: hireY + 12,
      w: hireW - 16,
      h: cardH,
    },
  }));

  const readyW = Math.min(320, panelW - 80);
  const readyH = 40;
  const ready: ShopCardRect = {
    x: cx - readyW / 2,
    y: hireY + 12 + cardH + 18,
    w: readyW,
    h: readyH,
  };

  return {
    cx,
    panelW,
    panelH,
    top,
    cardH,
    upgradeY,
    hireY,
    upgrades,
    hires,
    ready,
  };
}

function pointIn(r: ShopCardRect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function hitTestShop(
  layout: ShopLayout,
  x: number,
  y: number,
): ShopHit | null {
  for (const u of layout.upgrades) {
    if (pointIn(u.rect, x, y)) return { kind: "upgrade", id: u.id };
  }
  for (const h of layout.hires) {
    if (pointIn(h.rect, x, y)) return { kind: "hire", id: h.id };
  }
  if (pointIn(layout.ready, x, y)) return { kind: "ready" };
  return null;
}
