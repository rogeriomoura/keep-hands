export type KeyState = Record<string, boolean>;

const GAME_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyZ",
  "KeyX",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Enter",
]);

/** Some keyboards, remote desktops and extensions send an empty `code`; fall back to `key`. */
function codeOf(e: KeyboardEvent): string {
  if (e.code) return e.code;
  const k = e.key;
  if (k === " " || k === "Spacebar") return "Space";
  if (k === "Up" || k === "Down" || k === "Left" || k === "Right") return `Arrow${k}`;
  if (k.startsWith("Arrow")) return k;
  if (/^[a-z]$/i.test(k)) return `Key${k.toUpperCase()}`;
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  return k;
}

export function createInput() {
  const keys: KeyState = {};

  const onDown = (e: KeyboardEvent) => {
    const code = codeOf(e);
    keys[code] = true;
    if (GAME_KEYS.has(code) || code.startsWith("Arrow")) {
      e.preventDefault();
    }
  };

  const onUp = (e: KeyboardEvent) => {
    keys[codeOf(e)] = false;
  };

  // Releasing a key while the tab is unfocused never fires keyup — don't leave it stuck down
  const onBlur = () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);

  return {
    keys,
    setKey(code: string, down: boolean) {
      keys[code] = down;
    },
    clearKeys() {
      for (const k of Object.keys(keys)) keys[k] = false;
    },
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
