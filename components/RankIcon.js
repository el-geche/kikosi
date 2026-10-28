// Rank tier icon: a shield in the tier colour with chevron pips (Rookie a dot, Legend a star). Accessible label.
import { TIERS } from "../lib/ranks.js";
export default function RankIcon({ tier = "rookie", size = 24, title }) {
  const i = Math.max(0, TIERS.findIndex((t) => t.id === tier)), t = TIERS[i] || TIERS[0];
  const label = title || `${t.name} rank`;
  const pips = [];
  for (let k = 0; k < Math.min(i, 4); k++) pips.push(<path key={k} d={`M8 ${15.5 - k * 3.2} l4 -2.4 l4 2.4`} fill="none" stroke={t.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />);
  return <svg className="rank-ic" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
    <title>{label}</title>
    <path d="M12 1.8 21 5v6.4c0 5.3-3.7 9.4-9 10.9-5.3-1.5-9-5.6-9-10.9V5z" fill={t.color} stroke={t.accent} strokeWidth="1.1" />
    {t.id === "rookie" ? <circle cx="12" cy="12" r="2.2" fill={t.accent} />
      : t.id === "legend" ? <path d="m12 6.3 1.7 3.5 3.8.5-2.8 2.6.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z" fill={t.accent} />
      : pips}
  </svg>;
}
export function Flame({ n }) {
  if (!(n >= 2)) return null;
  return <span className="flame" title={`${n} correct outcomes in a row`} aria-label={`${n}-match streak`}>🔥{n}</span>;
}
