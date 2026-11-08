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
    <div class="hud">
      <div>Phase <strong id="phase">Shop</strong></div>
      <div>Night <strong id="wave">1</strong>/5</div>
      <div>Lives <strong id="lives">3</strong></div>
      <div>Gold <strong id="gold">0</strong></div>
      <div>Carry <strong id="carry">—</strong></div>
      <div>Crew <strong id="crew">—</strong></div>
      <div class="hint">Shop: 1–4 upgrades · 5–6 hire · Enter prep</div>
    </div>
  </header>
  <div class="stage">
    <canvas id="game"></canvas>
    <div class="overlay" id="overlay" hidden>
      <div class="panel">
        <h2 id="end-title">Keep fallen</h2>
        <p id="end-body">The raiders broke through.</p>
        <button type="button" id="restart">Try again</button>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("canvas missing");

const game = createGame(canvas);

const phaseEl = document.querySelector("#phase")!;
const waveEl = document.querySelector("#wave")!;
const livesEl = document.querySelector("#lives")!;
const goldEl = document.querySelector("#gold")!;
const carryEl = document.querySelector("#carry")!;
const crewEl = document.querySelector("#crew")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const endTitle = document.querySelector("#end-title")!;
const endBody = document.querySelector("#end-body")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart")!;

restartBtn.addEventListener("click", () => {
  game.restart();
  overlay.hidden = true;
});

function syncHud() {
  const s = game.getState();
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

  if (s.status !== "playing" && overlay.hidden) {
    overlay.hidden = false;
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
