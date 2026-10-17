import { getAll } from "../../lib/all";
import JackpotLab from "../../components/JackpotLab";
export const revalidate = 1800;
export const metadata = { title: "Pick-12 Lab · Kikosi" };
export default async function Page() {
  const all = await getAll();
  const matches = all.flatMap((l) => l.upcoming.map((m) => ({ id: m.id, lg: l.league.name, flag: l.league.flag, date: m.date, time: m.time, home: m.home, away: m.away, H: m.H, D: m.D, A: m.A, pick: m.pick, pickProb: m.pickProb, why: m.why, favours: m.favours, homeForm: m.homeForm, awayForm: m.awayForm })))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return <>
    <div className="hero"><h1>Pick-12 <span className="grad">Lab</span></h1>
      <p>Build a just-for-fun 12-match slip from upcoming fixtures and see the combined model probability. It shows how quickly the chances shrink when you stack picks. Nothing here can be staked or submitted.</p>
      <div className="note" style={{ marginTop: 16 }}><b>Informational analysis only.</b> Not a prediction, tip or guarantee, and no real betting. Combined “fair odds” are model estimates (1 ÷ combined probability), not bookmaker odds. Your slip is stored only in this browser. 18+.</div></div>
    <JackpotLab matches={matches} />
  </>;
}
