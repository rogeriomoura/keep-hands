export type Rect = { x: number; y: number; w: number; h: number };

export type Platform = Rect & { kind: "ground" | "floor" | "wallTop" };

export type Ladder = Rect;

export type Tower = {
  id: string;
  base: Rect;
  platform: Rect;
  ladder: Ladder;
  range: number;
  fireCooldown: number;
  fireTimer: number;
  ammo: number;
  maxAmmo: number;
  damage: number;
  hp: number;
  maxHp: number;
  /** Barrel aim in radians; 0 = right */
  aimAngle: number;
  /** Seconds of muzzle flash remaining */
  muzzleFlash: number;
  /** Visual recoil kick on the carriage */
  recoil: number;
};

export type WallSegment = {
  id: string;
  body: Rect;
  hp: number;
  maxHp: number;
};

export type Supply = {
  id: string;
  kind: "ammo" | "stone";
  body: Rect;
  amount: number;
};

export type World = {
  width: number;
  height: number;
  groundY: number;
  platforms: Platform[];
  towers: Tower[];
  walls: WallSegment[];
  supplies: Supply[];
  gateX: number;
};

export function createWorld(): World {
  const width = 1600;
  const height = 720;
  const groundY = 620;

  const platforms: Platform[] = [
    { kind: "ground", x: 0, y: groundY, w: width, h: height - groundY },
  ];

  const towers: Tower[] = [
    makeTower("west", 220, groundY, 180),
    makeTower("east", 520, groundY, 220),
  ];

  for (const t of towers) {
    platforms.push({ kind: "floor", ...t.platform });
  }

  const walls: WallSegment[] = [
    {
      id: "curtain-1",
      body: { x: 340, y: groundY - 110, w: 160, h: 110 },
      hp: 90,
      maxHp: 90,
    },
    {
      id: "curtain-2",
      body: { x: 640, y: groundY - 100, w: 140, h: 100 },
      hp: 90,
      maxHp: 90,
    },
  ];

  for (const w of walls) {
    platforms.push({
      kind: "wallTop",
      x: w.body.x,
      y: w.body.y,
      w: w.body.w,
      h: 12,
    });
  }

  const supplies: Supply[] = [
    {
      id: "ammo-crate",
      kind: "ammo",
      body: { x: 90, y: groundY - 36, w: 44, h: 36 },
      amount: 99,
    },
    {
      id: "stone-pile",
      kind: "stone",
      // Next to powder so the mason has a real haul to the walls
      body: { x: 150, y: groundY - 28, w: 52, h: 28 },
      amount: 99,
    },
  ];

  return {
    width,
    height,
    groundY,
    platforms,
    towers,
    walls,
    supplies,
    gateX: 780,
  };
}

function makeTower(id: string, x: number, groundY: number, topHeight: number): Tower {
  const baseW = 70;
  const platformH = 18;
  const platformY = groundY - topHeight;
  return {
    id,
    base: { x, y: platformY, w: baseW, h: topHeight },
    platform: { x: x - 10, y: platformY, w: baseW + 20, h: platformH },
    ladder: {
      x: x + baseW - 18,
      y: platformY + platformH,
      w: 16,
      h: topHeight - platformH,
    },
    range: 360,
    fireCooldown: 0.72,
    fireTimer: 0,
    ammo: 3,
    maxAmmo: 6,
    damage: 16,
    hp: 70,
    maxHp: 70,
    aimAngle: -0.15,
    muzzleFlash: 0,
    recoil: 0,
  };
}

/**
 * Uniform world→screen scale. Large stages zoom in so the world covers the view
 * (no empty strips, no stretching); smaller stages stay at 1:1 as before.
 */
export function worldZoom(viewW: number, viewH: number, world: World): number {
  return Math.max(1, viewW / world.width, viewH / world.height);
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function expand(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}
