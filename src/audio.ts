/**
 * Game audio (Web Audio API).
 *
 * - Sampled effects live in public/sfx (Kenney CC0 packs — see public/sfx/CREDITS.md),
 *   all peak-normalized, so the `volume` column below is the mix.
 * - Big/musical effects (cannon, explosions, collapses, horn, stings, wind) are
 *   synthesized into buffers at load time, so there's nothing to license.
 * - Everything fails silently: no audio support, blocked autoplay or a decode
 *   error must never break the game.
 *
 * Usage: call `unlockAudio()` from a user gesture (first tap/click/key — iOS
 * requires it), then `playSfx("cannon", { pan })` anywhere.
 */

export type SfxName =
  | "cannon"
  | "impact"
  | "clubHit"
  | "maulHit"
  | "enemyDeath"
  | "wallCollapse"
  | "towerRuin"
  | "hammer"
  | "pickup"
  | "reload"
  | "emptyClick"
  | "jump"
  | "land"
  | "nightHorn"
  | "victory"
  | "defeat"
  | "coins"
  | "uiClick";

export type SfxOptions = {
  /** 0..1+, multiplied with the sound's default volume */
  volume?: number;
  /** -1 (left) .. 1 (right) */
  pan?: number;
  /** playback rate (pitch); 1 = original */
  rate?: number;
  /** ± random pitch variation, overrides the sound's default (e.g. 0.06 = ±6%) */
  jitter?: number;
};

type Synth = (sampleRate: number) => Float32Array;

type SfxDef = {
  /** files in public/sfx; one is picked at random each play */
  files?: string[];
  synth?: Synth;
  volume: number;
  maxVoices: number;
  jitter: number;
};

const SFX: Record<SfxName, SfxDef> = {
  cannon: { synth: synthCannon, volume: 0.55, maxVoices: 4, jitter: 0.05 },
  impact: { synth: synthExplosion, volume: 0.5, maxVoices: 4, jitter: 0.08 },
  clubHit: { files: ["club-hit-1.m4a", "club-hit-2.m4a"], volume: 0.42, maxVoices: 4, jitter: 0.08 },
  maulHit: { files: ["maul-hit.m4a"], volume: 0.6, maxVoices: 3, jitter: 0.05 },
  enemyDeath: { files: ["enemy-death.m4a"], volume: 0.45, maxVoices: 4, jitter: 0.1 },
  wallCollapse: { synth: synthWallCollapse, volume: 0.8, maxVoices: 2, jitter: 0.04 },
  towerRuin: { synth: synthTowerRuin, volume: 0.85, maxVoices: 2, jitter: 0.03 },
  hammer: { files: ["hammer-1.m4a", "hammer-2.m4a"], volume: 0.3, maxVoices: 3, jitter: 0.06 },
  pickup: { files: ["pickup.m4a"], volume: 0.35, maxVoices: 2, jitter: 0.06 },
  reload: { files: ["reload.m4a"], volume: 0.45, maxVoices: 2, jitter: 0.05 },
  emptyClick: { files: ["empty-click.m4a"], volume: 0.4, maxVoices: 2, jitter: 0.03 },
  jump: { files: ["jump.m4a"], volume: 0.14, maxVoices: 1, jitter: 0.08 },
  land: { files: ["land.m4a"], volume: 0.2, maxVoices: 2, jitter: 0.08 },
  nightHorn: { synth: synthHorn, volume: 0.45, maxVoices: 1, jitter: 0 },
  victory: { synth: synthVictory, volume: 0.5, maxVoices: 1, jitter: 0 },
  defeat: { synth: synthDefeat, volume: 0.5, maxVoices: 1, jitter: 0 },
  coins: { files: ["coins.m4a"], volume: 0.45, maxVoices: 2, jitter: 0.04 },
  uiClick: { files: ["ui-click.m4a"], volume: 0.35, maxVoices: 2, jitter: 0.03 },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

const MUTE_KEY = "keep-hands:muted";
const VOLUME_KEY = "keep-hands:volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readStored(MUTE_KEY) === "1";
let masterVolume = clamp01(Number(readStored(VOLUME_KEY) ?? "0.8") || 0.8);
let loading: Promise<void> | null = null;

/** Decoded/synthesized buffers per sound (variants for sampled ones) */
const buffers = new Map<SfxName, AudioBuffer[]>();
const failed = new Set<string>();
const voices = new Map<SfxName, AudioBufferSourceNode[]>();

let ambience: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

/** Why output is suspended right now ("game" = paused overlay, "hidden" = tab in background) */
const suspendReasons = new Set<string>();

// —— lifecycle ——

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterVolume;
    master.connect(ctx.destination);
    // a backgrounded tab stops the game loop; stop the sound with it
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) suspendReasons.add("hidden");
      else suspendReasons.delete("hidden");
      applySuspend();
    });
    if (document.hidden) suspendReasons.add("hidden");
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/**
 * Call from a user gesture (pointerdown/keydown). Safe to call repeatedly:
 * resumes a suspended/interrupted context and starts loading on first call.
 */
export function unlockAudio(): void {
  const ac = getContext();
  if (!ac) return;
  try {
    if (ac.state !== "running" && suspendReasons.size === 0) {
      void ac.resume().catch(() => {});
      // iOS: playing a silent buffer inside the gesture fully unlocks output
      const silent = ac.createBufferSource();
      silent.buffer = ac.createBuffer(1, 1, ac.sampleRate);
      silent.connect(ac.destination);
      silent.start(0);
    }
  } catch {
    /* ignore */
  }
  void preloadAudio();
}

/** Decode every sampled file and synthesize the generated sounds (once). */
export function preloadAudio(): Promise<void> {
  if (loading) return loading;
  const ac = getContext();
  if (!ac) return Promise.resolve();
  loading = Promise.all(
    SFX_NAMES.map(async (name) => {
      const def = SFX[name];
      const list: AudioBuffer[] = [];
      if (def.synth) {
        try {
          const data = def.synth(ac.sampleRate);
          const buf = ac.createBuffer(1, data.length, ac.sampleRate);
          buf.getChannelData(0).set(data);
          list.push(buf);
        } catch {
          failed.add(name);
        }
      }
      for (const file of def.files ?? []) {
        const buf = await loadFile(ac, file);
        if (buf) list.push(buf);
        else failed.add(file);
      }
      if (list.length) buffers.set(name, list);
    }),
  ).then(() => undefined);
  return loading;
}

async function loadFile(ac: AudioContext, file: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sfx/${file}`);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return await ac.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

// —— playback ——

export function playSfx(name: SfxName, opts: SfxOptions = {}): void {
  const ac = ctx;
  if (!ac || !master || muted || ac.state !== "running") return;
  const def = SFX[name];
  const list = buffers.get(name);
  if (!def || !list?.length) return;
  try {
    const active = (voices.get(name) ?? []).filter((v) => v.buffer !== null);
    // cap simultaneous voices: drop the oldest so rapid fire doesn't stack into noise
    while (active.length >= def.maxVoices) {
      const oldest = active.shift();
      try {
        oldest?.stop();
      } catch {
        /* already ended */
      }
    }

    const source = ac.createBufferSource();
    source.buffer = list[Math.floor(Math.random() * list.length)]!;
    const jitter = opts.jitter ?? def.jitter;
    source.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);

    const gain = ac.createGain();
    gain.gain.value = def.volume * (opts.volume ?? 1);
    let node: AudioNode = source;
    node.connect(gain);
    node = gain;
    if (opts.pan && typeof ac.createStereoPanner === "function") {
      const panner = ac.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(panner);
      node = panner;
    }
    node.connect(master);

    active.push(source);
    voices.set(name, active);
    source.onended = () => {
      const list2 = voices.get(name);
      if (list2) voices.set(name, list2.filter((v) => v !== source));
    };
    source.start();
  } catch {
    /* never let audio break the game */
  }
}

/** Stereo pan for something at `screenX` in a view `viewW` wide (gentle, ±0.6). */
export function panForScreenX(screenX: number, viewW: number): number {
  if (viewW <= 0) return 0;
  return Math.max(-0.6, Math.min(0.6, (screenX / viewW - 0.5) * 1.2));
}

/** Silence everything (incl. ambience) while the game is paused; resume after. */
export function setAudioPaused(paused: boolean): void {
  if (paused) suspendReasons.add("game");
  else suspendReasons.delete("game");
  applySuspend();
}

function applySuspend() {
  const ac = ctx;
  if (!ac) return;
  try {
    if (suspendReasons.size > 0) {
      if (ac.state === "running") void ac.suspend().catch(() => {});
    } else if (ac.state !== "running") {
      void ac.resume().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

// —— volume / mute ——

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  writeStored(MUTE_KEY, next ? "1" : "0");
  applyMasterGain();
  if (next) stopAllVoices();
}

export function getMasterVolume(): number {
  return masterVolume;
}

export function setMasterVolume(volume: number): void {
  masterVolume = clamp01(volume);
  writeStored(VOLUME_KEY, String(masterVolume));
  applyMasterGain();
}

function applyMasterGain() {
  if (!ctx || !master) return;
  try {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : masterVolume, now, 0.03);
  } catch {
    /* ignore */
  }
}

function stopAllVoices() {
  for (const list of voices.values()) {
    for (const v of list) {
      try {
        v.stop();
      } catch {
        /* already ended */
      }
    }
  }
  voices.clear();
}

// —— ambience (night wind loop) ——

export function startAmbience(fadeSeconds = 2): void {
  const ac = ctx;
  if (!ac || !master || ambience) return;
  try {
    const data = synthWindLoop(ac.sampleRate);
    const buf = ac.createBuffer(1, data.length, ac.sampleRate);
    buf.getChannelData(0).set(data);
    const source = ac.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.18, ac.currentTime + fadeSeconds);
    source.connect(gain);
    gain.connect(master);
    source.start();
    ambience = { source, gain };
  } catch {
    ambience = null;
  }
}

export function stopAmbience(fadeSeconds = 1.5): void {
  const ac = ctx;
  const amb = ambience;
  if (!ac || !amb) return;
  ambience = null;
  try {
    const now = ac.currentTime;
    amb.gain.gain.cancelScheduledValues(now);
    amb.gain.gain.setValueAtTime(amb.gain.gain.value, now);
    amb.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    amb.source.stop(now + fadeSeconds + 0.05);
  } catch {
    /* ignore */
  }
}

/** For debugging / tests: what loaded and what didn't. */
export function audioStatus(): { ready: boolean; loaded: SfxName[]; failed: string[] } {
  return {
    ready: Boolean(ctx && ctx.state === "running"),
    loaded: [...buffers.keys()],
    failed: [...failed],
  };
}

/** For tests: duration (s) and peak level (0..1) of each loaded buffer variant. */
export function audioStats(): Partial<Record<SfxName, { duration: number; peak: number }[]>> {
  const out: Partial<Record<SfxName, { duration: number; peak: number }[]>> = {};
  for (const [name, list] of buffers) {
    out[name] = list.map((b) => {
      let peak = 0;
      for (const v of b.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      return { duration: b.duration, peak };
    });
  }
  return out;
}

// —— synthesis ——
// Small DSP helpers; all sounds are mono Float32 at the context's sample rate.

/** Deterministic noise so generated sounds are identical every load */
function noiseSource(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967295) * 2 - 1;
  };
}

function onePoleCoef(cutoffHz: number, sampleRate: number) {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
}

function normalize(data: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < data.length; i++) data[i]! *= k;
  }
  return data;
}

/** Low boom with a descending pitch (the "body" of cannons and explosions) */
function addThump(data: Float32Array, sr: number, start: number, f0: number, f1: number, decay: number, amp: number) {
  let phase = 0;
  const s0 = Math.floor(start * sr);
  for (let i = s0; i < data.length; i++) {
    const t = (i - s0) / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t * 9);
    phase += (2 * Math.PI * f) / sr;
    data[i]! += Math.sin(phase) * Math.exp(-t / decay) * amp;
  }
}

/** Low-passed noise burst whose cutoff falls over time */
function addNoiseBurst(
  data: Float32Array,
  sr: number,
  start: number,
  dur: number,
  cutoffStart: number,
  cutoffEnd: number,
  amp: number,
  seed: number,
  attack = 0.002,
) {
  const rand = noiseSource(seed);
  const s0 = Math.floor(start * sr);
  const n = Math.min(data.length - s0, Math.floor(dur * sr));
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = i / n;
    const cutoff = cutoffEnd + (cutoffStart - cutoffEnd) * Math.exp(-p * 5);
    y += onePoleCoef(cutoff, sr) * (rand() - y);
    const env = Math.min(1, t / attack) * Math.pow(1 - p, 2.2);
    data[s0 + i]! += y * env * amp;
  }
}

function synthCannon(sr: number): Float32Array {
  const data = new Float32Array(Math.floor(sr * 1.1));
  addNoiseBurst(data, sr, 0, 0.03, 9000, 4000, 0.9, 11); // muzzle crack
  addNoiseBurst(data, sr, 0, 0.9, 2200, 120, 1.4, 12); // blast
  addThump(data, sr, 0, 120, 38, 0.28, 1.2); // chest-thump boom
  return normalize(data, 0.92);
}

function synthExplosion(sr: number): Float32Array {
  const data = new Float32Array(Math.floor(sr * 0.8));
  addNoiseBurst(data, sr, 0, 0.75, 3000, 150, 1.3, 21);
  addThump(data, sr, 0, 90, 30, 0.2, 1);
  addNoiseBurst(data, sr, 0.05, 0.25, 5000, 1500, 0.25, 22); // debris rattle
  return normalize(data, 0.88);
}

/** Rumble + a scatter of falling chunks */
function synthCollapse(sr: number, seconds: number, chunks: number, rumbleCutoff: number, seed: number) {
  const data = new Float32Array(Math.floor(sr * seconds));
  const rand = noiseSource(seed);
  // slow-swelling rumble
  let y = 0;
  const a = onePoleCoef(rumbleCutoff, sr);
  for (let i = 0; i < data.length; i++) {
    const p = i / data.length;
    y += a * (rand() - y);
    const env = Math.min(1, p / 0.08) * Math.pow(1 - p, 1.6);
    data[i]! += y * env * 2.2;
  }
  addThump(data, sr, 0, 70, 28, 0.5, 0.9);
  // chunks tumbling: denser early, sparse later
  for (let c = 0; c < chunks; c++) {
    const at = Math.pow((rand() + 1) / 2, 1.8) * seconds * 0.75;
    addNoiseBurst(data, sr, at, 0.12 + ((rand() + 1) / 2) * 0.15, 2500, 300, 0.35 + ((rand() + 1) / 2) * 0.3, seed + c * 7);
  }
  return normalize(data, 0.9);
}

function synthWallCollapse(sr: number): Float32Array {
  return synthCollapse(sr, 1.6, 12, 260, 31);
}

function synthTowerRuin(sr: number): Float32Array {
  return synthCollapse(sr, 2.3, 18, 190, 41);
}

/** Brass-like tone: stacked harmonics with soft rolloff, gentle vibrato */
function addBrassNote(data: Float32Array, sr: number, start: number, dur: number, freq: number, amp: number) {
  const s0 = Math.floor(start * sr);
  const n = Math.min(data.length - s0, Math.floor(dur * sr));
  const attack = 0.06;
  const release = Math.min(0.25, dur * 0.4);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, t / 0.3);
    phase += (2 * Math.PI * freq * vib) / sr;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(phase * h) / Math.pow(h, 1.4);
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
    // brighter as the note swells, like a real horn
    data[s0 + i]! += v * env * amp * (0.7 + 0.3 * Math.min(1, t / 0.2));
  }
}

function synthHorn(sr: number): Float32Array {
  const data = new Float32Array(Math.floor(sr * 1.9));
  addBrassNote(data, sr, 0, 0.55, 146.83, 0.8); // D3
  addBrassNote(data, sr, 0.6, 1.25, 220, 0.9); // A3, held
  return normalize(lowpass(data, sr, 1800), 0.85);
}

function synthVictory(sr: number): Float32Array {
  const data = new Float32Array(Math.floor(sr * 2.0));
  const notes = [293.66, 369.99, 440, 587.33]; // D4 F#4 A4 D5
  notes.forEach((f, i) => addBrassNote(data, sr, i * 0.16, i === 3 ? 1.3 : 0.2, f, 0.7));
  addBrassNote(data, sr, 0.48, 1.3, 440, 0.4); // A4 under the final note
  return normalize(lowpass(data, sr, 3200), 0.85);
}

function synthDefeat(sr: number): Float32Array {
  const data = new Float32Array(Math.floor(sr * 2.3));
  const notes = [220, 174.61, 146.83]; // A3 F3 D3, falling minor
  notes.forEach((f, i) => addBrassNote(data, sr, i * 0.42, i === 2 ? 1.4 : 0.45, f, 0.75));
  return normalize(lowpass(data, sr, 1400), 0.8);
}

/** Seamless 6s night-wind loop (filtered noise with slow gusts, crossfaded ends) */
function synthWindLoop(sr: number): Float32Array {
  const len = Math.floor(sr * 6);
  const fade = Math.floor(sr * 0.75);
  const raw = new Float32Array(len + fade);
  const rand = noiseSource(51);
  let y = 0;
  let y2 = 0;
  for (let i = 0; i < raw.length; i++) {
    const t = i / sr;
    const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * (t / 6) * 2) * Math.sin(2 * Math.PI * (t / 6) * 3 + 1);
    const cutoff = 250 + 450 * gust;
    y += onePoleCoef(cutoff, sr) * (rand() - y);
    y2 += onePoleCoef(cutoff * 0.8, sr) * (y - y2);
    raw[i] = y2 * (0.4 + 0.6 * gust);
  }
  const out = raw.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = raw[i]! * k + raw[len + i]! * (1 - k);
  }
  return normalize(out, 0.7);
}

function lowpass(data: Float32Array, sr: number, cutoff: number): Float32Array {
  const a = onePoleCoef(cutoff, sr);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i]! - y);
    data[i] = y;
  }
  return data;
}

// —— storage ——

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage */
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
