import { describe, expect, it } from "vitest";
import { formatRunTime } from "../src/game/format";
import { isBruteSlot } from "../src/game/waves";
import { updateCamera } from "../src/game/camera";
import { createWorld, worldZoom } from "../src/world";
import { getShopLayout, hitTestShop } from "../src/shopLayout";
import { ARM_COCKED, enemyPose, swingTiming } from "../src/enemyPose";
import { newRun } from "./harness";

describe("formatRunTime", () => {
  it("formats minutes, seconds and tenths", () => {
    expect(formatRunTime(0)).toBe("0:00.0");
    expect(formatRunTime(59.99)).toBe("0:59.9");
    expect(formatRunTime(83.47)).toBe("1:23.4");
    expect(formatRunTime(600)).toBe("10:00.0");
  });
  it("adds hours past 60 minutes", () => {
    expect(formatRunTime(3723.4)).toBe("1:02:03.4");
  });
  it("never shows negative time", () => {
    expect(formatRunTime(-5)).toBe("0:00.0");
  });
});

describe("worldZoom", () => {
  const world = createWorld();
  it("zooms in to cover tall stages", () => {
    expect(worldZoom(1713, 865, world)).toBeCloseTo(865 / 720, 5);
  });
  it("stays 1:1 on mid-size stages", () => {
    expect(worldZoom(1100, 575, world)).toBe(1);
    expect(worldZoom(1280, 520, world)).toBe(1);
  });
  it("zooms out on short (phone) stages", () => {
    expect(worldZoom(844, 349, world)).toBeCloseTo(349 / 520, 5);
  });
  it("never goes below cover, so the world always fills the stage", () => {
    // very wide and short: width cover (2000/1600) wins over the short-stage zoom-out
    expect(worldZoom(2000, 300, world)).toBeCloseTo(2000 / 1600, 5);
  });
});

describe("camera clamping", () => {
  function settle(view: { width: number; height: number }, insets: { left: number; right: number }, playerX: number) {
    const s = newRun();
    s.player.x = playerX;
    s.camera.x = 0;
    for (let i = 0; i < 400; i++) updateCamera(s, view, insets);
    return s.camera.x;
  }

  it("stops at the world's left edge without insets", () => {
    expect(settle({ width: 1100, height: 575 }, { left: 0, right: 0 }, 140)).toBeCloseTo(0, 3);
  });

  it("scrolls past the left edge by the touch-control inset (in world units)", () => {
    const view = { width: 844, height: 349 };
    const zoom = worldZoom(view.width, view.height, createWorld());
    expect(settle(view, { left: 162, right: 0 }, 140)).toBeCloseTo(-162 / zoom, 3);
  });

  it("scrolls past the right edge by the right inset", () => {
    const view = { width: 844, height: 349 };
    const world = createWorld();
    const zoom = worldZoom(view.width, view.height, world);
    const expected = world.width - view.width / zoom + 171 / zoom;
    expect(settle(view, { left: 0, right: 171 }, world.width - 30)).toBeCloseTo(expected, 3);
  });
});

describe("wave roster (fixed for every run)", () => {
  const roster = (wave: number) => {
    const n = 4 + wave * 2;
    let row = "";
    for (let i = 0; i < n; i++) row += isBruteSlot(wave, i, n) ? "B" : "r";
    return row;
  };
  it("has no brutes in the first two nights", () => {
    expect(roster(1)).toBe("rrrrrr");
    expect(roster(2)).toBe("rrrrrrrr");
  });
  it("spreads brutes evenly from night 3", () => {
    expect(roster(3)).toBe("rrrBrrBrrB");
    expect(roster(4)).toBe("rrrBrrrBrrrB");
    expect(roster(5)).toBe("rrrBrrBrrrBrrB");
  });
  it("is a pure function of (wave, index, total)", () => {
    expect(isBruteSlot(3, 3, 10)).toBe(isBruteSlot(3, 3, 10));
    expect(isBruteSlot(3, 0, 0)).toBe(false);
  });
});

describe("shop layout", () => {
  it("is full size when it fits", () => {
    expect(getShopLayout(1100, 575).scale).toBe(1);
  });
  it("scales down to fit short screens", () => {
    expect(getShopLayout(760, 330).scale).toBeCloseTo((330 - 24) / 460, 5);
  });
  it("hit-tests in screen px through the scale", () => {
    for (const [w, h] of [[1100, 575], [760, 330]] as const) {
      const L = getShopLayout(w, h);
      const r = L.ready;
      expect(hitTestShop(L, (r.x + r.w / 2) * L.scale, (r.y + r.h / 2) * L.scale)).toEqual({ kind: "ready" });
      const card = L.upgrades[1]!.rect;
      expect(hitTestShop(L, (card.x + 4) * L.scale, (card.y + 4) * L.scale)).toEqual({ kind: "upgrade", id: "magazine" });
      const hire = L.hires[0]!.rect;
      expect(hitTestShop(L, (hire.x + 4) * L.scale, (hire.y + 4) * L.scale)).toEqual({ kind: "hire", id: "runner" });
      expect(hitTestShop(L, 2, 2)).toBeNull();
    }
  });
});

describe("raider strike pose", () => {
  it("swings overhead (through straight up, −π), never under the feet", () => {
    for (const kind of ["raider", "brute"] as const) {
      const t = swingTiming(kind);
      const angles: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const pose = enemyPose({
          kind,
          attackPhase: "strike",
          phaseT: (t.strike * i) / 20,
          swingScale: 1,
          swingFrom: 0.35,
          walkPhase: 0,
        });
        angles.push(pose.front);
      }
      // starts cocked behind the head, decreases monotonically through −π
      expect(angles[0]).toBeCloseTo(ARM_COCKED - 0.12, 5);
      for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeLessThanOrEqual(angles[i - 1]!);
      expect(angles.some((a) => a < -Math.PI)).toBe(true);
      // the hand (direction (−sin a, cos a)) is never pointing down at the feet mid-swing
      for (const a of angles.slice(0, 16)) expect(Math.cos(a)).toBeLessThan(0.5);
      // ends forward (toward the keep, −x)
      expect(-Math.sin(angles[angles.length - 1]!)).toBeLessThan(-0.8);
    }
  });
});
