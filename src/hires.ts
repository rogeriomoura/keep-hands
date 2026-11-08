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
