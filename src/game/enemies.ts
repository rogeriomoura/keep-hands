/** Raider movement, the melee swing state machine and structure damage. */
import { structureCollapsed } from "../effects";
import { ARM_READY, marchArm, swingTiming } from "../enemyPose";
import { addFloater } from "./particles";
import type { Enemy, GameState } from "./types";
import { sfx } from "../sfx";

export function updateEnemies(state: GameState, dt: number) {
  const gate = state.world.gateX;

  for (const e of state.enemies) {
    const target = easternStructure(state);

    if (!target) {
      e.x -= e.speed * dt;
      // last structure fell mid-swing — drop the pose and march for the gate
      e.attacking = false;
      e.attackPhase = "none";
      e.phaseT = 0;
      e.walkPhase += dt * (e.speed * 0.08);
      if (e.x + e.w < gate - 40) {
        state.lives -= 1;
        e.hp = 0;
        state.shake = Math.max(state.shake, 6);
        state.banner = "Breach! A raider got through";
        state.bannerLife = 1.8;
      }
      continue;
    }

    if (e.x > target.edge + 2) {
      e.x -= e.speed * dt;
      e.attacking = false;
      e.attackPhase = "none";
      e.phaseT = 0;
      e.walkPhase += dt * (e.speed * 0.08);
    } else {
      if (!e.attacking) {
        e.attacking = true;
        beginWindup(e);
      }
      e.phaseT += dt;
      const timing = swingTiming(e.kind, e.swingScale);
      if (e.attackPhase === "windup" && e.phaseT >= timing.windup) {
        e.attackPhase = "strike";
        e.phaseT -= timing.windup;
      }
      if (e.attackPhase === "strike" && e.phaseT >= timing.strike) {
        // club meets the wall on the last frame of the downswing
        damageStructure(state, target.id, e.damage);
        spawnImpact(state, e, target);
        e.attackPhase = "recover";
        e.phaseT -= timing.strike;
      }
      if (e.attackPhase === "recover" && e.phaseT >= timing.recover) {
        beginWindup(e);
      }
    }
  }

  state.enemies = state.enemies.filter((e) => e.hp > 0);

  for (const wall of state.world.walls) {
    if (wall.hp < 0) wall.hp = 0;
  }
}

export function beginWindup(e: Enemy) {
  e.swingFrom =
    e.attackPhase === "none" ? marchArm(e.walkPhase) : ARM_READY;
  e.attackPhase = "windup";
  e.phaseT = 0;
  // tempo varies per swing so a crowd doesn't hammer in lockstep, but it's
  // derived from the enemy id + swing number, so every run plays out the same
  e.swingScale = 0.9 + (((e.id * 7 + e.swingCount * 13) % 21) / 20) * 0.2;
  e.swingCount += 1;
}

export function spawnImpact(
  state: GameState,
  e: Enemy,
  target: { id: string; edge: number },
) {
  const brute = e.kind === "brute";
  sfx.meleeHit(state, e.kind, target.edge);
  const isWall = state.world.walls.some((w) => w.id === target.id);
  const chips = isWall
    ? ["#958675", "#7a6d5c", "#5a4a3a"]
    : ["#6e6458", "#5c5348", "#3a342c"];
  const x = target.edge;
  const y = e.y + (brute ? 25 : 22);

  const chipCount = brute ? 9 : 6;
  for (let i = 0; i < chipCount; i++) {
    // fly back out of the wall face (east) and up, then fall
    const ang = -Math.PI * (0.05 + Math.random() * 0.45);
    const spd = (brute ? 120 : 90) + Math.random() * 90;
    state.debris.push({
      kind: "chip",
      x: x + Math.random() * 3,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
      size: 1.5 + Math.random() * (brute ? 3 : 2),
      spin: (Math.random() - 0.5) * 20,
      color: chips[Math.floor(Math.random() * chips.length)],
    });
  }
  for (let i = 0; i < (brute ? 3 : 2); i++) {
    state.debris.push({
      kind: "dust",
      x: x + 4 + Math.random() * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: 18 + Math.random() * 22,
      vy: -10 - Math.random() * 14,
      life: 0.5 + Math.random() * 0.2,
      maxLife: 0.7,
      size: brute ? 9 : 7,
      spin: 0,
      color: "200, 186, 164",
    });
  }
  state.debris.push({
    kind: "spark",
    x: x + 1,
    y,
    vx: 0,
    vy: 0,
    life: 0.1,
    maxLife: 0.1,
    size: brute ? 13 : 10,
    spin: Math.random() * Math.PI,
    color: "#fff2d0",
  });
}

export function easternStructure(state: GameState): { id: string; edge: number } | null {
  let best: { id: string; edge: number } | null = null;

  for (const w of state.world.walls) {
    if (w.hp <= 0) continue;
    const edge = w.body.x + w.body.w;
    if (!best || edge > best.edge) best = { id: w.id, edge };
  }
  for (const t of state.world.towers) {
    if (t.hp <= 0) continue;
    const edge = t.base.x + t.base.w;
    if (!best || edge > best.edge) best = { id: t.id, edge };
  }

  return best;
}

export function damageStructure(state: GameState, id: string, amount: number) {
  const wall = state.world.walls.find((w) => w.id === id);
  if (wall) {
    wall.hp -= amount;
    state.shake = Math.max(state.shake, 3.5);
    addFloater(
      state,
      wall.body.x + wall.body.w / 2,
      wall.body.y,
      `-${amount}`,
      "#c45c2a",
    );
    if (wall.hp <= 0) {
      wall.hp = 0;
      addFloater(
        state,
        wall.body.x + wall.body.w / 2,
        wall.body.y - 10,
        "WALL DOWN",
        "#e8dcc8",
      );
      structureCollapsed(state, wall.body, ["#958675", "#7a6d5c", "#5a4a3a", "#6a5a48"]);
      // remove wall-top platform so path opens / can't stand on ghost wall
      state.world.platforms = state.world.platforms.filter(
        (p) =>
          !(
            p.kind === "wallTop" &&
            p.x === wall.body.x &&
            p.y === wall.body.y
          ),
      );
    }
    return;
  }

  const tower = state.world.towers.find((t) => t.id === id);
  if (tower) {
    tower.hp -= amount;
    state.shake = Math.max(state.shake, 4);
    addFloater(
      state,
      tower.base.x + tower.base.w / 2,
      tower.platform.y,
      `-${amount}`,
      "#c45c2a",
    );
    if (tower.hp <= 0) {
      tower.hp = 0;
      tower.ammo = 0;
      addFloater(
        state,
        tower.base.x + tower.base.w / 2,
        tower.platform.y - 10,
        "TOWER RUINED",
        "#e8dcc8",
      );
      structureCollapsed(state, tower.base, ["#6e6458", "#5c5348", "#4a4238", "#3a342c"]);
    }
  }
}
