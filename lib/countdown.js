// Countdown maths shared by the server and the browser (no server-only imports here).
/** Countdown to kickoff. locked is true from the kickoff millisecond onwards (the server enforces the same rule). */
export function countdownParts(koMs, now = Date.now()) {
  const ms = koMs - now;
  if (!(ms > 0)) return { locked: true, ms: 0, label: "Locked · kicked off" };
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return { locked: false, ms, d, h, m, s: sec, label: d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}` };
}

