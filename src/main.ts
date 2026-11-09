import "./style.css";
import { createGame, formatRunTime } from "./game";
import {
  browserStore,
  loadBest,
  lossMessage,
  recordLoss,
  recordWin,
  saveBest,
  titleLine,
  winMessage,
} from "./personalBest";
import { getReducedMotion, onSettingsChange, setReducedMotion } from "./settings";
import { isMuted, setMuted, unlockAudio } from "./audio";
import { sfx } from "./sfx";
import {
  describeSubmitError,
  fetchTop,
  leaderboardEnabled,
  startRun,
  submitScore,
  type ScoreEntry,
} from "./leaderboard";
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
      <button type="button" class="pause-btn" id="pause-btn" aria-label="Pause game" aria-pressed="false" title="Pause (Esc or P)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      </button>
    </div>
    <button type="button" class="mute-btn" id="mute-btn" aria-label="Mute sound" aria-pressed="false" title="Mute sound (M)">
      <svg class="icon-sound" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>
      <svg class="icon-muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="wave" d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>
    </button>
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
        <p class="personal-best" id="title-best" hidden></p>

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

        <div class="settings-row">
          <label class="setting-toggle">
            <input type="checkbox" id="reduce-motion" />
            <span><strong>Reduce motion</strong>: no screen shake, calmer effects</span>
          </label>
        </div>

        <div class="board title-board" id="title-board" hidden>
          <h2>Fastest keepers</h2>
          <ol class="board-list" id="title-board-list"></ol>
        </div>

        <div class="title-actions">
          <button type="button" id="start" class="start-btn">Start game</button>
          <button type="button" id="board-btn" class="board-btn" hidden>Top 10</button>
        </div>
      </div>
    </div>

    <div class="overlay board-modal" id="board-modal" hidden>
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="board-modal-title">
        <h2 id="board-modal-title">Fastest keepers</h2>
        <p class="board-modal-sub">Quickest wins of all 5 nights (shop time not counted)</p>
        <div class="board">
          <ol class="board-list" id="board-modal-list"></ol>
        </div>
        <p class="submit-status" id="board-modal-status" role="status"></p>
        <button type="button" id="board-modal-close">Close</button>
      </div>
    </div>

    <div class="overlay" id="overlay" hidden>
      <div class="panel">
        <h2 id="end-title">Keep fallen</h2>
        <p id="end-body">The raiders broke through.</p>
        <p class="end-time" id="end-time"></p>
        <p class="pb-note" id="end-best" hidden></p>
        <form class="submit-form" id="submit-form" hidden>
          <label for="initials">Your initials</label>
          <div class="submit-row">
            <input id="initials" name="initials" maxlength="3" autocomplete="off"
              autocapitalize="characters" spellcheck="false" enterkeyhint="send"
              placeholder="AAA" aria-describedby="submit-status" />
            <button type="submit" id="submit-btn">Post time</button>
          </div>
        </form>
        <p class="submit-status" id="submit-status" role="status"></p>
        <div class="board" id="end-board" hidden>
          <h3>Fastest keepers</h3>
          <ol class="board-list" id="end-board-list"></ol>
        </div>
        <button type="button" id="restart">Try again</button>
      </div>
    </div>

    <div class="overlay pause-overlay" id="pause-overlay" hidden>
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">Paused</h2>
        <p class="pause-time">Run time <strong id="pause-run-time">0:00.0</strong>. The clock is stopped.</p>
        <div class="pause-actions">
          <button type="button" id="pause-resume" class="pause-resume">Resume</button>
          <button type="button" id="pause-restart" class="pause-secondary">Restart run</button>
          <button type="button" id="pause-mute" class="pause-secondary" aria-pressed="false">Sound: on</button>
          <button type="button" id="pause-motion" class="pause-secondary" aria-pressed="false"
            title="No screen shake, calmer effects">Reduce motion: off</button>
        </div>
        <p class="pause-hint">Esc or P to resume</p>
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
// dev-only console handle for testing (stripped from production builds)
if (import.meta.env.DEV) (window as unknown as { __game: typeof game }).__game = game;

// —— Reduce motion (title screen toggle; defaults to the OS preference) ——
const reduceMotionInput = document.querySelector<HTMLInputElement>("#reduce-motion")!;
// same setting, mirrored in the pause menu
const pauseMotionBtn = document.querySelector<HTMLButtonElement>("#pause-motion")!;

function syncMotionSetting() {
  const on = getReducedMotion();
  reduceMotionInput.checked = on;
  pauseMotionBtn.textContent = on ? "Reduce motion: on" : "Reduce motion: off";
  pauseMotionBtn.setAttribute("aria-pressed", String(on));
  // CSS hook: drops button press scaling, transitions and looping animations
  document.body.classList.toggle("reduce-motion", on);
}

reduceMotionInput.addEventListener("change", () => {
  setReducedMotion(reduceMotionInput.checked);
  // don't leave focus on the checkbox, or game keys would be treated as form input
  reduceMotionInput.blur();
});
pauseMotionBtn.addEventListener("click", () => setReducedMotion(!getReducedMotion()));
onSettingsChange(syncMotionSetting);
syncMotionSetting();

const hud = document.querySelector<HTMLDivElement>("#hud")!;
const phaseEl = document.querySelector("#phase")!;
const waveEl = document.querySelector("#wave")!;
const livesEl = document.querySelector("#lives")!;
const goldEl = document.querySelector("#gold")!;
const carryEl = document.querySelector("#carry")!;
const crewEl = document.querySelector("#crew")!;
const runTimeEl = document.querySelector<HTMLElement>("#run-time")!;
const endTimeEl = document.querySelector<HTMLElement>("#end-time")!;
const endBestEl = document.querySelector<HTMLParagraphElement>("#end-best")!;
const titleBestEl = document.querySelector<HTMLParagraphElement>("#title-best")!;
const titleBoard = document.querySelector<HTMLDivElement>("#title-board")!;
const titleBoardList = document.querySelector<HTMLOListElement>("#title-board-list")!;
const submitForm = document.querySelector<HTMLFormElement>("#submit-form")!;
const initialsInput = document.querySelector<HTMLInputElement>("#initials")!;
const submitBtn = document.querySelector<HTMLButtonElement>("#submit-btn")!;
const submitStatus = document.querySelector<HTMLParagraphElement>("#submit-status")!;
const endBoard = document.querySelector<HTMLDivElement>("#end-board")!;
const endBoardList = document.querySelector<HTMLOListElement>("#end-board-list")!;

// —— Leaderboard ——
const INITIALS_KEY = "keep-hands:initials";
/** Server-stamped start of the current run; resolves to null if the API is unreachable */
let runToken: Promise<string | null> = Promise.resolve(null);

function renderBoard(list: HTMLOListElement, top: ScoreEntry[], mine?: { initials: string; timeMs: number }) {
  list.replaceChildren();
  if (top.length === 0) {
    const li = document.createElement("li");
    li.className = "board-empty";
    li.textContent = "No times yet. Be the first.";
    list.append(li);
    return;
  }
  let marked = false;
  for (const entry of top) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "board-name";
    name.textContent = entry.initials;
    const time = document.createElement("span");
    time.className = "board-time";
    time.textContent = formatRunTime(entry.timeMs / 1000);
    li.append(name, time);
    if (!marked && mine && entry.initials === mine.initials && entry.timeMs === mine.timeMs) {
      li.classList.add("is-mine");
      marked = true;
    }
    list.append(li);
  }
}

async function loadTitleBoard() {
  if (!leaderboardEnabled) return;
  const top = await fetchTop(5);
  if (!top) return;
  renderBoard(titleBoardList, top);
  titleBoard.hidden = false;
  boardBtn.hidden = false; // API reachable — offer the full top 10
}

// —— Top 10 window (title menu) ——
const boardBtn = document.querySelector<HTMLButtonElement>("#board-btn")!;
const boardModal = document.querySelector<HTMLDivElement>("#board-modal")!;
const boardModalList = document.querySelector<HTMLOListElement>("#board-modal-list")!;
const boardModalStatus = document.querySelector<HTMLParagraphElement>("#board-modal-status")!;
const boardModalClose = document.querySelector<HTMLButtonElement>("#board-modal-close")!;

async function openBoardModal() {
  boardModal.hidden = false;
  boardModalList.replaceChildren();
  boardModalStatus.textContent = "Loading…";
  boardModalClose.focus();
  const top = await fetchTop(10);
  if (boardModal.hidden) return;
  if (top) {
    renderBoard(boardModalList, top);
    boardModalStatus.textContent = "";
  } else {
    boardModalStatus.textContent = "Couldn't load the leaderboard. Check your connection.";
  }
}

function closeBoardModal() {
  if (boardModal.hidden) return;
  boardModal.hidden = true;
  boardBtn.focus();
}

boardBtn.addEventListener("click", openBoardModal);
boardModalClose.addEventListener("click", closeBoardModal);
// click/tap outside the panel closes it
boardModal.addEventListener("click", (e) => {
  if (e.target === boardModal) closeBoardModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBoardModal();
});

async function showEndBoard() {
  endBoard.hidden = true;
  if (!leaderboardEnabled) return;
  const top = await fetchTop(10);
  if (!top) return;
  renderBoard(endBoardList, top);
  endBoard.hidden = false;
}

function resetEndScreen() {
  endBestEl.hidden = true;
  submitForm.hidden = true;
  submitStatus.textContent = "";
  endBoard.hidden = true;
  submitBtn.disabled = false;
  initialsInput.disabled = false;
}

function savedInitials(): string {
  try {
    return localStorage.getItem(INITIALS_KEY) ?? "";
  } catch {
    return "";
  }
}

initialsInput.addEventListener("input", () => {
  // letters only, uppercase, max 3
  initialsInput.value = initialsInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
});

submitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const initials = initialsInput.value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(initials)) {
    submitStatus.textContent = "Use exactly 3 letters.";
    initialsInput.focus();
    return;
  }
  try {
    localStorage.setItem(INITIALS_KEY, initials);
  } catch {
    /* private mode */
  }
  const timeMs = Math.round(game.getState().runTime * 1000);
  submitBtn.disabled = true;
  initialsInput.disabled = true;
  submitStatus.textContent = "Posting…";
  const result = await submitScore(await runToken, initials, timeMs);
  if (result.ok) {
    submitForm.hidden = true;
    submitStatus.textContent = `You placed #${result.rank}.`;
    renderBoard(endBoardList, result.top, { initials, timeMs });
    endBoard.hidden = false;
  } else {
    submitStatus.textContent = describeSubmitError(result.error);
    // a retry can help only for connection problems
    const retryable = result.error === "offline" || result.error === "server_error";
    submitBtn.disabled = !retryable;
    initialsInput.disabled = !retryable;
    if (!retryable) submitForm.hidden = true;
  }
});

loadTitleBoard();

// —— Personal best (this browser only; works without the leaderboard API) ——
function showTitleBest() {
  const line = titleLine(loadBest(browserStore()));
  titleBestEl.textContent = line ?? "";
  titleBestEl.hidden = !line;
}

function showEndBest(message: { text: string; isNew: boolean }) {
  endBestEl.textContent = message.text;
  endBestEl.classList.toggle("is-new", message.isNew);
  endBestEl.hidden = false;
}

showTitleBest();
const title = document.querySelector<HTMLDivElement>("#title")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const endTitle = document.querySelector("#end-title")!;
const endBody = document.querySelector("#end-body")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart")!;
const rotateGate = document.querySelector<HTMLDivElement>("#rotate-gate")!;
const touchUi = document.querySelector<HTMLDivElement>("#touch-ui")!;
const fsBtn = document.querySelector<HTMLButtonElement>("#fs-btn")!;

// —— Sound: unlock on first gesture, mute toggle (button + M), menu clicks ——
const muteBtn = document.querySelector<HTMLButtonElement>("#mute-btn")!;
const pauseMuteBtn = document.querySelector<HTMLButtonElement>("#pause-mute")!;

// Browsers (iOS especially) only allow audio after a user gesture; keep listening so an
// interrupted context (phone call, app switch) resumes on the next tap or key.
for (const type of ["pointerdown", "touchstart", "keydown"] as const) {
  window.addEventListener(type, () => unlockAudio(), { capture: true, passive: true });
}

function syncMuteButton() {
  const muted = isMuted();
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.classList.toggle("is-muted", muted);
  muteBtn.title = muted ? "Unmute sound (M)" : "Mute sound (M)";
  pauseMuteBtn.textContent = muted ? "Sound: off" : "Sound: on";
  pauseMuteBtn.setAttribute("aria-pressed", String(muted));
}

function toggleMute() {
  setMuted(!isMuted());
  syncMuteButton();
  if (!isMuted()) sfx.uiClick(); // audible confirmation when sound comes back
}

muteBtn.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMute();
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  // typing initials etc. must not toggle sound (mirrors input.ts)
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  if (t instanceof HTMLElement && t.isContentEditable) return;
  toggleMute();
});

// menu buttons click; on-screen game controls and the mute button don't
document.addEventListener("click", (e) => {
  const button = e.target instanceof Element ? e.target.closest("button") : null;
  if (!button || button === muteBtn || button.classList.contains("touch-btn")) return;
  sfx.uiClick();
});

syncMuteButton();

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
    !game.isPaused() &&
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
  runToken = startRun();
  resetEndScreen();
  title.hidden = true;
  overlay.hidden = true;
  hud.hidden = false;
  pendingStart = false;
  syncTouchUi();
}

function launchRestart() {
  game.restart();
  runToken = startRun();
  resetEndScreen();
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

async function requestRestart() {
  // Phones/tablets go immersive on start; desktop browsers stay windowed (use the FS button)
  if (touchPlay) await enterImmersive(document.documentElement);
  if (syncRotateGate()) {
    pendingRestart = true;
    return;
  }
  launchRestart();
}

restartBtn.addEventListener("click", requestRestart);

// —— Pause: HUD button, Esc/P, auto-pause when the page is hidden ——
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause-btn")!;
const pauseOverlay = document.querySelector<HTMLDivElement>("#pause-overlay")!;
const pauseRunTime = document.querySelector<HTMLElement>("#pause-run-time")!;
const pauseResumeBtn = document.querySelector<HTMLButtonElement>("#pause-resume")!;
const pauseRestartBtn = document.querySelector<HTMLButtonElement>("#pause-restart")!;

/** Pausing only makes sense mid-run with no other screen or dialog on top. */
function canOpenPause(): boolean {
  // `hidden` is typed boolean | "until-found"; only a plain `true` counts as closed
  return (
    game.getState().status === "playing" &&
    [title, overlay, fsHelp, boardModal, rotateGate].every((el) => el.hidden === true)
  );
}

function syncPauseUi() {
  const paused = game.isPaused();
  pauseOverlay.hidden = !paused;
  pauseBtn.setAttribute("aria-pressed", String(paused));
  pauseBtn.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
  if (paused) pauseRunTime.textContent = formatRunTime(game.getState().runTime);
  syncTouchUi();
}

function pauseGame() {
  if (game.isPaused() || !canOpenPause()) return;
  if (!game.setPaused(true)) return;
  syncPauseUi();
  pauseResumeBtn.focus();
}

function resumeGame() {
  if (!game.isPaused()) return;
  game.setPaused(false);
  syncPauseUi();
  // hand keyboard focus back to the page so arrow keys don't scroll or press buttons
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

pauseBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (game.isPaused()) resumeGame();
  else pauseGame();
});
pauseResumeBtn.addEventListener("click", resumeGame);
pauseRestartBtn.addEventListener("click", () => {
  game.setPaused(false);
  syncPauseUi();
  void requestRestart();
});
pauseMuteBtn.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMute();
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "Escape" && e.code !== "KeyP") return;
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  // typing initials etc. must not pause (mirrors input.ts)
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  if (t instanceof HTMLElement && t.isContentEditable) return;
  if (game.isPaused()) {
    e.preventDefault();
    resumeGame();
  } else if (canOpenPause()) {
    e.preventDefault();
    pauseGame();
  }
});

// Switching tabs/apps, locking the phone or a call: freeze the run. No auto-resume —
// the player comes back to the pause menu and resumes when ready.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") pauseGame();
});
window.addEventListener("pagehide", () => pauseGame());

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
      // record right away — independent of the leaderboard post or the API being up
      const store = browserStore();
      const win = recordWin(loadBest(store), Math.round(s.runTime * 1000), Date.now());
      saveBest(store, win.next);
      showEndBest(winMessage(win.outcome));
      showTitleBest();
      if (leaderboardEnabled) {
        submitForm.hidden = false;
        initialsInput.value = savedInitials();
      }
      showEndBoard();
    } else {
      endTitle.textContent = "Keep fallen";
      endBody.textContent =
        "Something went unrepaired. The next shift will remember.";
      endTimeEl.textContent = `Fell on night ${Math.min(s.wave, 5)} after ${formatRunTime(s.runTime)}`;
      const store = browserStore();
      const loss = recordLoss(loadBest(store), Math.min(s.wave, 5));
      saveBest(store, loss.next);
      showEndBest(lossMessage(loss.outcome));
      showTitleBest();
      showEndBoard();
    }
  }

  requestAnimationFrame(syncHud);
}

syncHud();
