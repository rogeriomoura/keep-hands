import "./style.css";
import { createGame } from "./game";
import {
  bindTouchControls,
  enterImmersive,
  isFullscreenActive,
  isTouchPlayDevice,
} from "./touch";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

const touchPlay = isTouchPlayDevice();
if (touchPlay) document.body.classList.add("touch-play");

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
      <button type="button" class="fs-btn" id="fs-btn" aria-label="Fullscreen">Fullscreen</button>
    </div>
  </header>
  <div class="stage">
    <canvas id="game"></canvas>

    <div class="touch-ui" id="touch-ui" hidden>
      <div class="touch-dpad" aria-label="Movement">
        <button type="button" class="touch-btn touch-pad" data-key="ArrowUp" aria-label="Up">▲</button>
        <button type="button" class="touch-btn touch-pad" data-key="ArrowLeft" aria-label="Left">◀</button>
        <button type="button" class="touch-btn touch-pad touch-pad-center" disabled tabindex="-1"></button>
        <button type="button" class="touch-btn touch-pad" data-key="ArrowRight" aria-label="Right">▶</button>
        <button type="button" class="touch-btn touch-pad" data-key="ArrowDown" aria-label="Down">▼</button>
      </div>
      <div class="touch-actions" aria-label="Actions">
        <button type="button" class="touch-btn touch-act" data-key="KeyZ">Act</button>
        <button type="button" class="touch-btn touch-jump" data-key="Space">Jump</button>
        <button type="button" class="touch-btn touch-drop" data-key="KeyX">Drop</button>
      </div>
    </div>

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
            <li><kbd>Space</kbd> / Jump button — jump</li>
            <li><kbd>Z</kbd> / Act button — pick up, reload, repair</li>
            <li><kbd>X</kbd> / Drop button — drop carried item</li>
            <li>Click or tap shop cards to buy / hire</li>
            <li><kbd>Enter</kbd> or Ready — start 15s prep</li>
          </ul>
        </div>

        <div class="controls-block tip">
          <h2>How a night works</h2>
          <p>
            First night is a clean shift: prep timer, then siege — no shop yet.
            After that: day shop → prep → night. Spend gold on upgrades and hired help between waves.
          </p>
          <p class="landscape-note">Phones: landscape + on-screen controls. Start enters fullscreen when allowed.</p>
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
const touchUi = document.querySelector<HTMLDivElement>("#touch-ui")!;
const fsBtn = document.querySelector<HTMLButtonElement>("#fs-btn")!;

if (touchPlay) {
  bindTouchControls(touchUi, (code, down) => game.setKey(code, down));
}

function syncFullscreenClass() {
  document.body.classList.toggle("is-fullscreen", isFullscreenActive());
  if (isFullscreenActive()) document.body.classList.add("immersive");
  fsBtn.textContent = isFullscreenActive() ? "Exit FS" : "Fullscreen";
}

fsBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  await enterImmersive(document.documentElement);
  syncFullscreenClass();
});

let pendingStart = false;
let pendingRestart = false;

function needsLandscape(): boolean {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  if (!portrait) return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function syncRotateGate() {
  const block = needsLandscape();
  rotateGate.hidden = !block;
  document.body.classList.toggle("must-rotate", block);
  game.setOrientationPaused(block);
  return block;
}

function syncTouchUi() {
  if (!touchPlay) {
    touchUi.hidden = true;
    return;
  }
  const s = game.getState();
  const show =
    s.status === "playing" &&
    s.dayPhase !== "shop" &&
    !needsLandscape() &&
    Boolean(overlay.hidden);
  touchUi.hidden = !show;
  document.body.classList.toggle("touch-controls-on", show);
}

function launchRun() {
  game.start();
  title.hidden = true;
  overlay.hidden = true;
  hud.hidden = false;
  pendingStart = false;
  syncTouchUi();
}

function launchRestart() {
  game.restart();
  overlay.hidden = true;
  title.hidden = true;
  hud.hidden = false;
  pendingRestart = false;
  syncTouchUi();
}

startBtn.addEventListener("click", async () => {
  // Phones/tablets go immersive on start; desktop browsers stay windowed (use the FS button)
  if (touchPlay) await enterImmersive(document.documentElement);
  if (syncRotateGate()) {
    pendingStart = true;
    return;
  }
  launchRun();
});

restartBtn.addEventListener("click", async () => {
  // Phones/tablets go immersive on start; desktop browsers stay windowed (use the FS button)
  if (touchPlay) await enterImmersive(document.documentElement);
  if (syncRotateGate()) {
    pendingRestart = true;
    return;
  }
  launchRestart();
});

window.addEventListener("orientationchange", () => {
  syncRotateGate();
  syncTouchUi();
});
window.addEventListener("resize", () => {
  syncRotateGate();
  syncTouchUi();
});
document.addEventListener("fullscreenchange", syncFullscreenClass);
document.addEventListener("webkitfullscreenchange", syncFullscreenClass);

syncRotateGate();
syncFullscreenClass();

function syncHud() {
  const blocked = syncRotateGate();

  if (!blocked) {
    if (pendingStart && game.getState().status === "menu") launchRun();
    if (pendingRestart) launchRestart();
  }

  if (blocked) {
    touchUi.hidden = true;
    requestAnimationFrame(syncHud);
    return;
  }

  const s = game.getState();

  if (s.status === "menu") {
    title.hidden = false;
    overlay.hidden = true;
    hud.hidden = true;
    touchUi.hidden = true;
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
    syncTouchUi();
  }

  if ((s.status === "won" || s.status === "lost") && overlay.hidden) {
    overlay.hidden = false;
    title.hidden = true;
    touchUi.hidden = true;
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
