import "./style.css";
import { createGame, formatRunTime } from "./game";
import {
  bindTouchControls,
  canFullscreen,
  enterImmersive,
  exitFullscreen,
  isFullscreenActive,
  isStandalone,
  isTouchPlayDevice,
} from "./touch";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

const touchPlay = isTouchPlayDevice();
if (touchPlay) document.body.classList.add("touch-play");
// Home Screen web app: no browser chrome to hide, but respect the notch/safe areas
const standalone = isStandalone();
if (standalone) document.body.classList.add("immersive", "standalone");

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      Keep Hands
      <span>Maintain the walls. Feed the guns. Survive the night.</span>
    </div>
    <div class="hud" id="hud" hidden>
      <div>Phase <strong id="phase">Shop</strong></div>
      <div>Night <strong id="wave">1</strong>/5</div>
      <div>Time <strong id="run-time" class="run-time">0:00.0</strong></div>
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
        <button type="button" class="touch-btn touch-pad pad-up" data-key="ArrowUp" aria-label="Up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5 19.5 16.5h-15z"/></svg></button>
        <button type="button" class="touch-btn touch-pad pad-left" data-key="ArrowLeft" aria-label="Left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5 19.5 16.5h-15z"/></svg></button>
        <span class="touch-pad-center" aria-hidden="true"></span>
        <button type="button" class="touch-btn touch-pad pad-right" data-key="ArrowRight" aria-label="Right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5 19.5 16.5h-15z"/></svg></button>
        <button type="button" class="touch-btn touch-pad pad-down" data-key="ArrowDown" aria-label="Down"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5 19.5 16.5h-15z"/></svg></button>
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
          <p class="landscape-note">Phones: play in landscape with the on-screen controls. On iPhone, use Share → Add to Home Screen for fullscreen.</p>
        </div>

        <button type="button" id="start" class="start-btn">Start game</button>
      </div>
    </div>

    <div class="overlay" id="overlay" hidden>
      <div class="panel">
        <h2 id="end-title">Keep fallen</h2>
        <p id="end-body">The raiders broke through.</p>
        <p class="end-time" id="end-time"></p>
        <button type="button" id="restart">Try again</button>
      </div>
    </div>

    <div class="overlay fs-help" id="fs-help" hidden>
      <div class="panel">
        <h2>Fullscreen on iPhone</h2>
        <p>Safari on iPhone doesn't let web pages go fullscreen.</p>
        <p>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open Keep Hands from your Home Screen. It launches fullscreen.</p>
        <button type="button" id="fs-help-close">Got it</button>
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
const runTimeEl = document.querySelector<HTMLElement>("#run-time")!;
const endTimeEl = document.querySelector<HTMLElement>("#end-time")!;
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

const fsHelp = document.querySelector<HTMLDivElement>("#fs-help")!;
const fsHelpClose = document.querySelector<HTMLButtonElement>("#fs-help-close")!;

function syncFullscreenClass() {
  document.body.classList.toggle("is-fullscreen", isFullscreenActive());
  if (isFullscreenActive()) document.body.classList.add("immersive");
  fsBtn.textContent = isFullscreenActive() ? "Exit FS" : "Fullscreen";
  // Already chrome-free when launched from the Home Screen
  fsBtn.hidden = standalone;
}

fsBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isFullscreenActive()) {
    await exitFullscreen();
  } else if (canFullscreen()) {
    await enterImmersive(document.documentElement);
  } else {
    // iPhone Safari: the Fullscreen API isn't available to pages — explain the Home Screen route
    fsHelp.hidden = false;
    game.setUiPaused(true);
  }
  syncFullscreenClass();
});

fsHelpClose.addEventListener("click", () => {
  fsHelp.hidden = true;
  game.setUiPaused(false);
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

let insetsShown: boolean | null = null;

/** Tell the camera how much of each stage edge the touch controls cover. */
function syncViewInsets(show: boolean) {
  if (!show) {
    game.setViewInsets({ left: 0, right: 0 });
    return;
  }
  const stage = canvas!.getBoundingClientRect();
  const pad = touchUi.querySelector(".touch-dpad")!.getBoundingClientRect();
  const acts = touchUi.querySelector(".touch-actions")!.getBoundingClientRect();
  game.setViewInsets({
    left: pad.right - stage.left + 8,
    right: stage.right - acts.left + 8,
  });
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
  if (show !== insetsShown) {
    insetsShown = show;
    syncViewInsets(show);
  }
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
  // control sizes/positions change with the viewport — re-measure
  if (insetsShown) syncViewInsets(true);
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
    runTimeEl.textContent = formatRunTime(s.runTime);
    // dim the clock while it's stopped (shop open)
    runTimeEl.classList.toggle("is-paused", s.status === "playing" && s.dayPhase === "shop");
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
      endTimeEl.textContent = `All 5 nights in ${formatRunTime(s.runTime)}`;
    } else {
      endTitle.textContent = "Keep fallen";
      endBody.textContent =
        "Something went unrepaired. The next shift will remember.";
      endTimeEl.textContent = `Fell on night ${Math.min(s.wave, 5)} after ${formatRunTime(s.runTime)}`;
    }
  }

  requestAnimationFrame(syncHud);
}

syncHud();
