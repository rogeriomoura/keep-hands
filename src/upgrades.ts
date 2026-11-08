export type UpgradeId = "power" | "magazine" | "braces" | "boots";

export type Upgrades = Record<UpgradeId, number>;

export type UpgradeDef = {
  id: UpgradeId;
  key: string;
  name: string;
  blurb: string;
  maxLevel: number;
  cost(level: number): number;
};

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: "power",
    key: "1",
    name: "Ballistics",
    blurb: "Tower damage",
    maxLevel: 5,
    cost: (level) => 20 + level * 15,
  },
  {
    id: "magazine",
    key: "2",
    name: "Magazines",
    blurb: "Ammo capacity",
    maxLevel: 5,
    cost: (level) => 18 + level * 12,
  },
  {
    id: "braces",
    key: "3",
    name: "Masonry",
    blurb: "Wall strength",
    maxLevel: 5,
    cost: (level) => 22 + level * 14,
  },
  {
    id: "boots",
    key: "4",
    name: "Boots",
    blurb: "Move speed",
    maxLevel: 5,
    cost: (level) => 16 + level * 12,
  },
];

export function freshUpgrades(): Upgrades {
  return { power: 0, magazine: 0, braces: 0, boots: 0 };
}

export function upgradeCost(id: UpgradeId, level: number): number {
  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  return def.cost(level);
}

export function canBuy(id: UpgradeId, upgrades: Upgrades, gold: number): boolean {
  const def = UPGRADE_DEFS.find((d) => d.id === id)!;
  const level = upgrades[id];
  if (level >= def.maxLevel) return false;
  return gold >= def.cost(level);
}
