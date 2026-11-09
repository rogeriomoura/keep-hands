/** Display formatting helpers. */


/** 83.4 → "1:23.4", 3723.4 → "1:02:03.4" */
export function formatRunTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const t = tenths % 10;
  const total = Math.floor(tenths / 10);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${ss}.${t}`
    : `${m}:${ss}.${t}`;
}
