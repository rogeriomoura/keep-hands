/** Quartermaster: buying upgrades and hiring crew. */
import { addFloater } from "./particles";
import type { GameState } from "./types";
import { spawnHelper } from "../helpers";
import { canHire, HIRE_DEFS, hireCost, type HireId } from "../hires";
import type { KeyState } from "../input";
import { sfx } from "../sfx";
import { canBuy, UPGRADE_DEFS, upgradeCost, type UpgradeId } from "../upgrades";

export function updateShop(state: GameState, keys: KeyState) {
  const upgrades: { code: string; id: UpgradeId }[] = [
    { code: "Digit1", id: "power" },
    { code: "Digit2", id: "magazine" },
    { code: "Digit3", id: "braces" },
    { code: "Digit4", id: "boots" },
  ];
  const hires: { code: string; id: HireId }[] = [
    { code: "Digit5", id: "runner" },
    { code: "Digit6", id: "mason" },
  ];

  for (const { code, id } of upgrades) {
    const down = Boolean(keys[code]);
    const was = Boolean(state.shopKeysHeld[id]);
    state.shopKeysHeld[id] = down;

    if (state.dayPhase !== "shop" || state.status !== "playing") continue;
    if (state.shopCooldown > 0) continue;
    if (down && !was) tryBuyUpgrade(state, id);
  }

  for (const { code, id } of hires) {
    const down = Boolean(keys[code]);
    const was = Boolean(state.shopKeysHeld[id]);
    state.shopKeysHeld[id] = down;

    if (state.dayPhase !== "shop" || state.status !== "playing") continue;
    if (state.shopCooldown > 0) continue;
    if (down && !was) tryHire(state, id);
  }
}

export function tryHire(state: GameState, id: HireId) {
  if (!canHire(id, state.crew, state.gold)) {
    state.shopCooldown = 0.2;
    sfx.denied();
    return;
  }
  sfx.purchase();

  state.gold -= hireCost(id);
  state.crew[id] = true;
  state.shopCooldown = 0.35;
  state.helpers.push(spawnHelper(state, id));

  const def = HIRE_DEFS.find((d) => d.id === id)!;
  state.banner = `Hired ${def.name}`;
  state.bannerLife = 1.6;
  addFloater(
    state,
    state.player.x + state.player.w / 2,
    state.player.y - 20,
    def.name,
    "#8fbc8f",
  );
}

export function tryBuyUpgrade(state: GameState, id: UpgradeId) {
  if (!canBuy(id, state.upgrades, state.gold)) {
    state.shopCooldown = 0.2;
    sfx.denied();
    return;
  }
  sfx.purchase();

  const cost = upgradeCost(id, state.upgrades[id]);
  state.gold -= cost;
  state.upgrades[id] += 1;
  state.shopCooldown = 0.35;
  applyUpgrade(state, id);

  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  state.banner = `${def.name} Lv ${state.upgrades[id]}`;
  state.bannerLife = 1.4;
  addFloater(
    state,
    state.player.x + state.player.w / 2,
    state.player.y - 20,
    `${def.name}!`,
    "#d8b45a",
  );
}

export function applyUpgrade(state: GameState, id: UpgradeId) {
  if (id === "power") {
    for (const t of state.world.towers) t.damage += 5;
    return;
  }
  if (id === "magazine") {
    for (const t of state.world.towers) {
      t.maxAmmo += 2;
      t.ammo = Math.min(t.maxAmmo, t.ammo + 2);
    }
    return;
  }
  if (id === "braces") {
    for (const w of state.world.walls) {
      w.maxHp += 22;
      if (w.hp > 0) w.hp = Math.min(w.maxHp, w.hp + 22);
    }
    for (const t of state.world.towers) {
      t.maxHp += 12;
      if (t.hp > 0) t.hp = Math.min(t.maxHp, t.hp + 12);
    }
  }
  // boots applied via speed multiplier in movement
}
