/** Context prompts and the Act/Drop actions (pick up, reload, repair). */
import { addFloater } from "./particles";
import { findLadder, playerRect } from "./player";
import type { GameState } from "./types";
import type { KeyState } from "../input";
import { sfx } from "../sfx";
import { expand, rectsOverlap } from "../world";

export function updatePrompt(state: GameState, keys: KeyState) {
  const p = state.player;
  const body = expand(playerRect(p), 10);
  let prompt = "";
  let action: (() => void) | null = null;

  if (!p.carrying) {
    for (const s of state.world.supplies) {
      if (rectsOverlap(body, s.body)) {
        prompt = `Act — pick up ${s.kind}`;
        action = () => {
          p.carrying = s.kind;
          sfx.pickup(state, p.x + p.w / 2);
          addFloater(state, p.x + p.w / 2, p.y, s.kind.toUpperCase(), "#e8dcc8");
        };
        break;
      }
    }
  } else if (p.carrying === "ammo") {
    for (const t of state.world.towers) {
      if (t.hp <= 0) continue;
      if (rectsOverlap(body, expand(t.platform, 8))) {
        if (t.ammo >= t.maxAmmo) {
          prompt = "Tower full";
        } else {
          prompt = "Act — reload tower";
          action = () => {
            const need = t.maxAmmo - t.ammo;
            const add = Math.min(need, 3);
            t.ammo += add;
            p.carrying = null;
            sfx.reload(state, t.platform.x + t.platform.w / 2);
            addFloater(
              state,
              t.platform.x + t.platform.w / 2,
              t.platform.y - 20,
              `+${add} ammo`,
              "#d8b45a",
            );
          };
        }
        break;
      }
    }
    if (!prompt) {
      prompt = "Drop — drop ammo";
      if (keys["KeyX"] && p.interactCooldown <= 0) {
        p.carrying = null;
        p.interactCooldown = 0.25;
      }
    }
  } else if (p.carrying === "stone") {
    const wall = state.world.walls.find(
      (w) => w.hp > 0 && w.hp < w.maxHp && rectsOverlap(body, expand(w.body, 16)),
    );
    const ruinedWall = state.world.walls.find(
      (w) => w.hp <= 0 && rectsOverlap(body, expand(w.body, 16)),
    );
    const tower = state.world.towers.find(
      (t) => t.hp < t.maxHp && rectsOverlap(body, expand(t.base, 16)),
    );

    if (wall) {
      prompt = "Act — repair wall";
      action = () => {
        const before = wall.hp;
        wall.hp = Math.min(wall.maxHp, wall.hp + 32);
        p.carrying = null;
        sfx.hammer(state, p.x + p.w / 2);
        addFloater(
          state,
          wall.body.x + wall.body.w / 2,
          wall.body.y - 12,
          `+${wall.hp - before} hp`,
          "#8fbc8f",
        );
      };
    } else if (ruinedWall) {
      prompt = "Act — rebuild wall";
      action = () => {
        ruinedWall.hp = Math.floor(ruinedWall.maxHp * 0.45);
        p.carrying = null;
        sfx.hammer(state, p.x + p.w / 2);
        // restore platform if missing
        const exists = state.world.platforms.some(
          (pl) =>
            pl.kind === "wallTop" &&
            pl.x === ruinedWall.body.x &&
            pl.y === ruinedWall.body.y,
        );
        if (!exists) {
          state.world.platforms.push({
            kind: "wallTop",
            x: ruinedWall.body.x,
            y: ruinedWall.body.y,
            w: ruinedWall.body.w,
            h: 12,
          });
        }
        addFloater(
          state,
          ruinedWall.body.x + ruinedWall.body.w / 2,
          ruinedWall.body.y - 12,
          "REBUILT",
          "#8fbc8f",
        );
      };
    } else if (tower) {
      prompt = tower.hp <= 0 ? "Act — rebuild tower" : "Act — repair tower";
      action = () => {
        const before = Math.max(0, tower.hp);
        if (tower.hp <= 0) tower.hp = Math.floor(tower.maxHp * 0.4);
        else tower.hp = Math.min(tower.maxHp, tower.hp + 26);
        p.carrying = null;
        sfx.hammer(state, p.x + p.w / 2);
        addFloater(
          state,
          tower.base.x + tower.base.w / 2,
          tower.platform.y - 12,
          `+${tower.hp - before} hp`,
          "#8fbc8f",
        );
      };
    } else {
      prompt = "Drop — drop stone";
      if (keys["KeyX"] && p.interactCooldown <= 0) {
        p.carrying = null;
        p.interactCooldown = 0.25;
      }
    }
  }

  if (!prompt) {
    const ladder = findLadder(state, playerRect(p));
    if (ladder) prompt = "↑/↓ climb · Jump to leap off";
  }

  state.prompt = prompt;

  if (action && keys["KeyZ"] && p.interactCooldown <= 0) {
    action();
    p.interactCooldown = 0.28;
  }
}
