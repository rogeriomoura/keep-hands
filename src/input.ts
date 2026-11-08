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

export function createInput() {
  const keys: KeyState = {};

  const onDown = (e: KeyboardEvent) => {
    keys[e.code] = true;
    if (GAME_KEYS.has(e.code) || e.code.startsWith("Arrow")) {
      e.preventDefault();
    }
  };

  const onUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

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
    },
  };
}
