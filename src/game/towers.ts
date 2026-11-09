/** Cannon aiming/firing and cannonball flight. */
import { ballImpact, cannonFired, enemyKilled } from "../effects";
import { addFloater } from "./particles";
import type { Enemy, GameState } from "./types";
import { sfx } from "../sfx";

export function cannonPivot(tower: { platform: { x: number; y: number; w: number } }) {
  return {
    x: tower.platform.x + tower.platform.w * 0.55,
    y: tower.platform.y - 6,
  };
}

export function slewAim(tower: { aimAngle: number }, desired: number, dt: number, rate: number) {
  let delta = desired - tower.aimAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  tower.aimAngle += delta * Math.min(1, dt * rate);
}

export function updateTowers(state: GameState, dt: number) {
  for (const tower of state.world.towers) {
    tower.muzzleFlash = Math.max(0, tower.muzzleFlash - dt);
    tower.recoil = Math.max(0, tower.recoil - dt * 4);

    if (tower.hp <= 0) continue;

    const pivot = cannonPivot(tower);
    const armed = tower.ammo > 0;

    // Empty guns go dormant — droop and stop tracking
    if (!armed) {
      slewAim(tower, 0.52, dt, 2.4);
      continue;
    }

    let best: Enemy | null = null;
    let bestDist = tower.range * 1.05;

    for (const e of state.enemies) {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const dist = Math.hypot(cx - pivot.x, cy - pivot.y);
      // Any raider in range — including those under the tower base
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }

    if (best) {
      // Lead moving raiders so the barrel visibly tracks them
      const lead = 0.18;
      const tx = best.x + best.w / 2 - best.speed * lead;
      const ty = best.y + best.h * 0.45;
      const desired = Math.atan2(ty - pivot.y, tx - pivot.x);
      slewAim(tower, desired, dt, 10);
    } else {
      // Armed but idle — stay ready, slightly elevated downrange
      slewAim(tower, -0.18, dt, 2.2);
    }

    tower.fireTimer -= dt;
    if (tower.fireTimer > 0 || !best) continue;

    // Fire along the true line to the target so near-base shots aren't blocked by lag
    const aimTx = best.x + best.w / 2;
    const aimTy = best.y + best.h * 0.45;
    const ang = Math.atan2(aimTy - pivot.y, aimTx - pivot.x);
    tower.aimAngle = ang;

    const barrelLen = 28;
    const muzzleX = pivot.x + Math.cos(ang) * barrelLen;
    const muzzleY = pivot.y + Math.sin(ang) * barrelLen;
    const speed = 440;
    state.projectiles.push({
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      damage: tower.damage,
      life: 1.4,
    });
    tower.ammo -= 1;
    tower.fireTimer = tower.fireCooldown;
    tower.muzzleFlash = 0.12;
    tower.recoil = 1;
    cannonFired(state, muzzleX, muzzleY, ang);

    if (tower.ammo === 0) {
      addFloater(state, pivot.x, pivot.y - 24, "EMPTY!", "#e8a050");
      sfx.cannonEmpty(state, pivot.x);
    }
  }
}

export function updateProjectiles(state: GameState, dt: number) {
  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }

  const groundY = state.world.groundY;
  state.projectiles = state.projectiles.filter((p) => {
    if (p.life <= 0) return false;
    for (const e of state.enemies) {
      if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) {
        const wasAlive = e.hp > 0;
        e.hp -= p.damage;
        addFloater(state, e.x + e.w / 2, e.y, `-${p.damage}`, "#f0d080");
        ballImpact(state, p.x, p.y, false);
        if (wasAlive && e.hp <= 0) enemyKilled(state, e, p.vx);
        return false;
      }
    }
    // Balls fly in straight lines and every enemy stands on the ground, so a ball
    // below ground level can never hit anything again — burst it here (cosmetic).
    if (p.y > groundY) {
      ballImpact(state, p.x, groundY, true);
      return false;
    }
    return true;
  });

  const before = state.enemies.length;
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  const killed = before - state.enemies.length;
  if (killed > 0) state.gold += killed * 4;
}
