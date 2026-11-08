export type KeyState = Record<string, boolean>;

export function createInput() {
  const keys: KeyState = {};

  const onDown = (e: KeyboardEvent) => {
    keys[e.code] = true;
    if (
      e.code === "Space" ||
      e.code.startsWith("Arrow") ||
      e.code === "KeyZ" ||
      e.code === "KeyX"
    ) {
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
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    },
  };
}
