export type HireId = "runner" | "mason";

export type HireDef = {
  id: HireId;
  key: string;
  name: string;
  blurb: string;
  detail: string;
  cost: number;
};

export const HIRE_DEFS: HireDef[] = [
  {
    id: "runner",
    key: "5",
    name: "Powder Runner",
    blurb: "Reloads towers",
    detail: "Hauls ammo up the ladders for you",
    cost: 40,
  },
  {
    id: "mason",
    key: "6",
    name: "Wall Mason",
    blurb: "Repairs stonework",
    detail: "Patches walls and tower bases",
    cost: 45,
  },
];

export type Crew = Record<HireId, boolean>;

export function freshCrew(): Crew {
  return { runner: false, mason: false };
}

export function hireCost(id: HireId): number {
  return HIRE_DEFS.find((d) => d.id === id)!.cost;
}

export function canHire(id: HireId, crew: Crew, gold: number): boolean {
  if (crew[id]) return false;
  return gold >= hireCost(id);
}

/**
 * Act 2 only: once hired, each helper can be promoted one time. The card in the
 * shop's hire slot turns into this promotion (same key, 5 or 6).
 */
export const PROMOTE_DEFS: Record<HireId, { name: string; blurb: string; detail: string; cost: number }> = {
  runner: {
    name: "Veteran Runner",
    blurb: "Faster on foot and ladders",
    detail: "Loads 5 shot per trip (was 3)",
    cost: 35,
  },
  mason: {
    name: "Master Mason",
    blurb: "Faster on foot",
    detail: "Repairs +30 walls / +24 towers",
    cost: 40,
  },
};

export function freshVeterans(): Crew {
  return { runner: false, mason: false };
}

export function canPromote(id: HireId, crew: Crew, veterans: Crew, gold: number): boolean {
  return crew[id] && !veterans[id] && gold >= PROMOTE_DEFS[id].cost;
}
