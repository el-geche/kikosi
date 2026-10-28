import SquadBuilder from "../../components/SquadBuilder";
export const metadata = { title: "Fantasy XII · Kikosi" };
export default function Squad() {
  return <>
    <div className="hero"><h1>Your fantasy <span className="grad">XII</span></h1>
      <p>Pick 12 real players from the five leagues and place them anywhere on the pitch. No budget, no transfers deadline, no prizes: it’s a squad to show off, with an analysis built only from real data.</p></div>
    {process.env.DATABASE_URL ? <SquadBuilder /> : <p className="mini">Fantasy squads aren’t switched on for this deployment yet.</p>}
    <p className="mini comp">A free prediction game for fun. Not betting. No money in, no money out.</p>
  </>;
}
