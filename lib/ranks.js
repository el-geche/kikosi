// Progress ranks from all-time points. Cosmetic only: no prizes, no money value. Edit thresholds here only.
export const TIERS = [
  { id: "rookie", name: "Rookie", min: 0, color: "#8a91ad", accent: "#c3c8dc" },
  { id: "bronze", name: "Bronze", min: 25, color: "#b8733d", accent: "#e6a26b" },
  { id: "silver", name: "Silver", min: 75, color: "#9aa4b8", accent: "#e3e8f2" },
  { id: "gold", name: "Gold", min: 150, color: "#e0a526", accent: "#ffe08a" },
  { id: "platinum", name: "Platinum", min: 300, color: "#3fb6c9", accent: "#b8f1fa" },
  { id: "legend", name: "Legend", min: 500, color: "#8b7dff", accent: "#e6b8ff" },
];

/** { tier, next, points, toNext, progress } where progress is 0..1 within the current tier (1 at the top tier). */
export function rankFor(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  let i = 0;
  while (i + 1 < TIERS.length && p >= TIERS[i + 1].min) i++;
  const tier = TIERS[i], next = TIERS[i + 1] || null;
  if (!next) return { tier, next: null, points: p, toNext: 0, progress: 1 };
  return { tier, next, points: p, toNext: next.min - p, progress: (p - tier.min) / (next.min - tier.min) };
}
