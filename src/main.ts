import "./style.css";
import { createGame } from "./game";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      Keep Hands
      <span>Maintain the walls. Feed the guns. Survive the night.</span>
    </div>
    <div class="hud" id="hud" hidden>
      <div>Phase <strong id="phase">Shop</strong></div>
      <div>Night <strong id="wave">1</strong>/5</div>
      <div>Lives <strong id="lives">3</strong></div>
      <div>Gold <strong id="gold">0</strong></div>
      <div>Carry <strong id="carry">—</strong></div>
      <div>Crew <strong id="crew">—</strong></div>
    </div>
  </header>
  <div class="stage">
    <canvas id="game"></canvas>

    <div class="overlay title-overlay" id="title">
      <div class="title-panel">
        <p class="eyebrow">A keep crew shift</p>
        <h1>Keep Hands</h1>
        <p class="lede">
          You are not the general. You haul powder, patch stone, and keep the guns fed while the night tries to tear the walls down.
        </p>

        <div class="controls-block">
          <h2>Controls</h2>
          <ul class="controls-list">
            <li><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Move &amp; climb ladders</li>
            <li><kbd>Space</kbd> Jump</li>
            <li><kbd>Z</kbd> Pick up, reload, repair</li>
            <li><kbd>X</kbd> Drop what you’re carrying</li>
            <li><kbd>1</kbd>–<kbd>4</kbd> Buy upgrades (shop)</li>
            <li><kbd>5</kbd>–<kbd>6</kbd> Hire runner / mason (shop)</li>
            <li><kbd>Enter</kbd> Leave shop → 15s prep</li>
          </ul>
        </div>

        <div class="controls-block tip">
          <h2>How a night works</h2>
          <p>
            First night is a clean shift: prep timer, then siege — no shop yet.
            After that: day shop → prep → night. Spend gold on upgrades and hired help between waves.
          </p>
          <p class="landscape-note">Phones: play in landscape (sideways).</p>
        </div>

        <button type="button" id="start" class="start-btn">Start game</button>
      </div>
    </div>

    <div class="overlay" id="overlay" hidden>
      <div class="panel">
        <h2 id="end-title">Keep fallen</h2>
        <p id="end-body">The raiders broke through.</p>
        <button type="button" id="restart">Try again</button>
      </div>
    </div>

    <div class="rotate-gate" id="rotate-gate" hidden>
      <div class="rotate-card">
        <div class="rotate-icon" aria-hidden="true">
          <span class="phone"></span>
          <span class="rotate-arrow">↺</span>
        </div>
        <h2>Turn your phone</h2>
        <p>Keep Hands plays in landscape. Rotate your device sideways to continue.</p>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("canvas missing");

const game = createGame(canvas);

const hud = document.querySelector<HTMLDivElement>("#hud")!;
const phaseEl = document.querySelector("#phase")!;
const waveEl = document.querySelector("#wave")!;
const livesEl = document.querySelector("#lives")!;
const goldEl = document.querySelector("#gold")!;
const carryEl = document.querySelector("#carry")!;
const crewEl = document.querySelector("#crew")!;
const title = document.querySelector<HTMLDivElement>("#title")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const endTitle = document.querySelector("#end-title")!;
const endBody = document.querySelector("#end-body")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart")!;
const rotateGate = document.querySelector<HTMLDivElement>("#rotate-gate")!;

let pendingStart = false;
let pendingRestart = false;

function needsLandscape(): boolean {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  if (!portrait) return false;
  const touch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;
  return touch || window.innerWidth <= 920;
}

async function requestLandscape() {
  try {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      await root.requestFullscreen();
    }
  } catch {
    /* optional */
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: OrientationLockType) => Promise<void>;
    };
    if (typeof orientation?.lock === "function") {
      await orientation.lock("landscape");
    }
  } catch {
    /* many mobile browsers require PWA / fullscreen */
  }
}

function syncRotateGate() {
  const block = needsLandscape();
  rotateGate.hidden = !block;
  document.body.classList.toggle("must-rotate", block);
  game.setOrientationPaused(block);
  return block;
}

function launchRun() {
  game.start();
  title.hidden = true;
  overlay.hidden = true;
  hud.hidden = false;
  pendingStart = false;
}

function launchRestart() {
  game.restart();
  overlay.hidden = true;
  title.hidden = true;
  hud.hidden = false;
  pendingRestart = false;
}

startBtn.addEventListener("click", () => {
  void requestLandscape();
  if (syncRotateGate()) {
    pendingStart = true;
    return;
  }
  launchRun();
});

restartBtn.addEventListener("click", () => {
  void requestLandscape();
  if (syncRotateGate()) {
    pendingRestart = true;
    return;
  }
  launchRestart();
});

window.addEventListener("orientationchange", () => {
  syncRotateGate();
});
window.addEventListener("resize", () => {
  syncRotateGate();
});
syncRotateGate();

function syncHud() {
  const blocked = syncRotateGate();

  if (!blocked) {
    if (pendingStart && game.getState().status === "menu") launchRun();
    if (pendingRestart) launchRestart();
  }

  if (blocked) {
    requestAnimationFrame(syncHud);
    return;
  }

  const s = game.getState();

  if (s.status === "menu") {
    title.hidden = false;
    overlay.hidden = true;
    hud.hidden = true;
  } else {
    phaseEl.textContent =
      s.dayPhase === "shop" ? "Shop" : s.dayPhase === "prep" ? "Prep" : "Night";
    waveEl.textContent = String(Math.min(s.wave, 5));
    livesEl.textContent = String(Math.max(0, s.lives));
    goldEl.textContent = String(s.gold);
    carryEl.textContent = s.player.carrying ?? "—";
    const crewBits = [
      s.crew.runner ? "Runner" : null,
      s.crew.mason ? "Mason" : null,
    ].filter(Boolean);
    crewEl.textContent = crewBits.length ? crewBits.join(" · ") : "—";
    hud.hidden = false;
  }

  if ((s.status === "won" || s.status === "lost") && overlay.hidden) {
    overlay.hidden = false;
    title.hidden = true;
    if (s.status === "won") {
      endTitle.textContent = "Night held";
      endBody.textContent =
        "The keep still stands. Towers fed, walls patched — good work.";
    } else {
      endTitle.textContent = "Keep fallen";
      endBody.textContent =
        "Something went unrepaired. The next shift will remember.";
    }
  }

  requestAnimationFrame(syncHud);
}

syncHud();
