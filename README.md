# Keep Hands

A small castle-defense game where you aren't the general — you're the crew. Haul powder up
the ladders, patch the stonework and keep the cannons fed while raiders try to tear the
walls down. Survive five nights per act and race the clock for the leaderboard.

**Play:** https://rogeriomoura.github.io/keep-hands/
(installable: on iPhone use Share → Add to Home Screen for fullscreen; plays offline after the first visit)

## Contents

- [Features](#features)
- [Controls](#controls)
- [Running locally](#running-locally)
- [Tests](#tests)
- [Project layout](#project-layout)
- [How the game works](#how-the-game-works)
- [Leaderboard API](#leaderboard-api)
- [Deploying](#deploying)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)

## Features

- **Two acts.** Act 1, the valley keep: five nights of raiders and brutes. Act 2, the ridge
  keep (unlocked by winning Act 1): a wider map with three towers and balloon **bombers** that
  drop bombs on the stonework and knock you down.
- **Shop between nights:** tower upgrades, and hireable crew (a powder runner and a mason).
  In Act 2 each hired helper can be promoted once (Veteran Runner, Master Mason).
- **Fair, timed runs.** The run clock counts only prep and night time (never the shop or a
  pause). Rosters are fixed and the simulation is deterministic, so every run of an act faces
  the same nights on any device.
- **Global leaderboards** (one per act) plus a personal best kept in the browser.
- **Phone-ready:** landscape layout with on-screen controls, zoomed-out view on short screens,
  pause and auto-pause when the app is backgrounded.
- **Accessibility and comfort:** reduced-motion setting (follows the OS preference), mute (M),
  readable text at any zoom.
- **Offline play** through a service worker, with an in-game "new version" prompt.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move / climb ladders | Arrow keys | D-pad |
| Jump | Space | Jump |
| Pick up, reload, repair | Z | Act |
| Drop what you carry | X | Drop |
| Shop: buy / hire | 1–6 or click a card | Tap a card |
| Shop: start the prep | Enter or Ready | Ready |
| Pause / resume | Esc or P | Pause button |
| Mute | M | Speaker button |

## Running locally

Requirements: Node 22 (what CI uses) and npm.

```bash
npm ci
npm run dev          # game at http://localhost:5173
```

The dev build talks to a **local** leaderboard (see `.env.development`). To run it:

```bash
cd leaderboard
npm ci
printf 'RUN_SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars   # local signing secret (git-ignored)
npm run db:migrate:local                                         # create the local D1 tables
npm run dev                                                      # API at http://127.0.0.1:8787
```

Without the local Worker the game still runs; the leaderboard simply hides itself.

Handy for testing in development only: the game object is exposed as `window.__game` in dev
builds (stripped from production), e.g. `__game.getState().waveTimer = 0.05` to skip a prep.

Other scripts: `npm run build` (type-check + production build into `dist/`) and
`npm run preview` (serve that build; the only way to try the service worker locally).

## Tests

```bash
npm test                    # game logic (Vitest, headless — no browser needed)
cd leaderboard && npm test  # Worker API, run inside the Workers runtime against a local D1
```

What the game tests guard, beyond the basics:

- **Determinism:** two runs fed the same inputs end in identical states (both acts), and frame
  sub-stepping gives the same result whatever the frame rate.
- **No soft-locks:** a perfectly defended Act 2 always ends in a win; an undefended one in a loss.
- **Leaderboard floors:** the Worker's minimum accepted times stay below the fastest
  theoretically possible run of each act (`theoreticalMinSeconds` in `src/game/acts.ts`).
- **Act 1 is frozen:** its roster and numbers are pinned, so Act 2 work can't change it.
- **Stylesheet sanity:** `style.css` has balanced braces (a lost `}` once silently disabled
  half the stylesheet).

## Project layout

```
src/
  main.ts            DOM: title, HUD, end screen, pause menu, leaderboard UI, touch controls
  game.ts            createGame(): browser loop, input, pause; public game API
  game/              headless simulation (no DOM) — what the tests drive
    step.ts            advance()/update(): one frame / one step of the world
    acts.ts            per-act rules: rosters, enemy stats, starting kit, floors
    waves.ts           day/night cycle and spawning
    enemies.ts         raider movement, melee swing, structure damage
    bombers.ts         Act 2 bombers, bombs and the knock-down
    towers.ts          cannon aiming, firing, cannonballs
    player.ts shop.ts interact.ts camera.ts pause.ts state.ts types.ts …
  world.ts           map layouts (Act 1 valley, Act 2 ridge) and world zoom
  helpers.ts         crew AI (runner, mason) and promotions
  render.ts, render/ canvas drawing (scenery, actors, effects, HUD overlays)
  effects.ts         cosmetic particles, bodies, dusk/dawn (never read by gameplay)
  audio.ts, sfx.ts   Web Audio engine and the event → sound mapping
  leaderboard.ts     client for the leaderboard API
  personalBest.ts    per-act personal bests and the Act 2 unlock (localStorage)
  settings.ts, motion.ts  reduced-motion setting and its effects
  sw/                service worker (precache list, registration + update prompt)
build/serviceWorker.ts  Vite plugin that bundles the service worker with the asset list
tests/               Vitest suites for the game
leaderboard/         Cloudflare Worker + D1 (its own package, tests and migrations)
public/              icons, manifest, sound files (public/sfx, see CREDITS.md)
```

## How the game works

- **Simulation vs. rendering.** Everything that affects the outcome lives in `src/game/` and
  runs headlessly. Cosmetic state (particles, bodies, sky blend, screen shake, poses) is written
  by `effects.ts`/render code and never read back by gameplay, so effects and the
  reduced-motion setting can't change results.
- **Frame-rate independence.** `advance()` splits long frames into ≤20 ms sub-steps, so a slow
  phone plays at the same speed (and the same run clock) as a fast desktop.
- **Fixed rosters.** Act 1 spreads brutes evenly (`isBruteSlot`); Act 2 uses explicit roster
  strings (`r` raider, `B` brute, `b` bomber) in `src/game/acts.ts`. Remaining variety (swing
  tempo) is derived from enemy ids, which restart every run.
- **Acts.** `freshState(status, act)` builds a run; Act 1 numbers are the original ones. Act 2
  opens in the shop with a fixed 60-gold kit so times are comparable.

## Leaderboard API

A Cloudflare Worker (`leaderboard/src/index.ts`) backed by D1, at
`https://leaderboard.keep-hands.workers.dev`.

| Endpoint | Purpose |
|---|---|
| `POST /runs` `{ act }` | Start a run: returns a signed token (call when the run starts) |
| `POST /scores` `{ token, initials, timeMs }` | Post a winning time; returns `{ rank, act, entry, top }` |
| `GET /scores?act=1&limit=10` | Top times for an act (default act 1, limit 1–50) |

A run can't be fully trusted (the game runs on the player's device), so the server makes
casual cheating impractical:

- **Signed run tokens** (HMAC-SHA256 with `RUN_SECRET`): `<runId>.<startedAt>.<sig>` for Act 1,
  `<runId>.<startedAt>.<act>.<sig>` for Act 2+. The act comes from the token, never from the
  client at posting time, so a run can only land on its own board.
- **Single use:** `run_id` is unique; a replay gets 409.
- **Time checks:** the claimed time must be ≥ the act's floor (105 s Act 1, 120 s Act 2) and
  can't exceed the real time since the token was issued; tokens expire after 12 h.
- **Initials:** exactly three letters A–Z.
- **Rate limit:** 5 posts per 10 minutes per client, keyed by a salted hash of the IP
  (the only thing stored about a player).
- **CORS:** only the game's origins (`ALLOWED_ORIGINS` in `wrangler.jsonc`).

Schema changes are numbered SQL files in `leaderboard/migrations/` (`0002_act.sql` added the
`act` column; existing rows are Act 1).

## Deploying

Both deploys run from GitHub Actions on pushes to `main`:

| Workflow | Triggers | Does |
|---|---|---|
| `deploy.yml` → GitHub Pages | every push to `main` | `npm test`, `npm run build`, publish `dist/` |
| `deploy-worker.yml` → Cloudflare | pushes touching `leaderboard/**` | typecheck, tests, apply D1 migrations (remote), `wrangler deploy` |

Repository secrets used by the Worker workflow: `CLOUDFLARE_API_TOKEN` (an account token with
only *Workers Scripts: Edit* and *D1: Edit*) and `CLOUDFLARE_ACCOUNT_ID`. The Worker's own
`RUN_SECRET` lives only in Cloudflare (`wrangler secret put RUN_SECRET`); deploys keep it.

**Release order matters when the API contract changes:** push the `leaderboard/` change
first, wait for the Worker deploy (and its migration) to finish, then push the game. A new
game talking to an old Worker could, for example, post an Act 2 time to the Act 1 board.

The production build reads the API address from `.env.production`
(`VITE_LEADERBOARD_URL`, public, not a secret).

To deploy the Worker by hand: `cd leaderboard && npx wrangler login && npm run db:migrate:remote && npm run deploy`.

## Troubleshooting

- **Leaderboard hidden in dev:** the local Worker isn't running, or its tables are missing
  (`npm run db:migrate:local`). Changing `database_id` in `wrangler.jsonc` starts a fresh,
  empty local database.
- **Worker tests print "Using secrets defined in .dev.vars":** harmless; the test bindings in
  `leaderboard/vitest.config.ts` take precedence.
- **A new `*.workers.dev` address doesn't resolve yet:** new or renamed subdomains can take a
  few minutes, and your machine may cache the "not found" answer a bit longer than public DNS.
- **Testing on a phone over the LAN:** the dev server listens on your network address
  (`npx vite --host`); add that origin to `ALLOWED_ORIGINS` if the phone should reach the
  local leaderboard.

## Credits

- Sound effects: [Kenney](https://www.kenney.nl) audio packs (CC0); the cannon, explosions,
  collapses, horn, stings and night wind are synthesized in `src/audio.ts`. Details in
  `public/sfx/CREDITS.md`.
- Fonts: Cormorant Garamond and IBM Plex Sans via Google Fonts.
