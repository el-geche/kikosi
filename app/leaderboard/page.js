import Leaderboard from "../../components/Leaderboard";
export const metadata = { title: "Leaderboard · Kikosi" };
export default function Page() {
  return <>
    <div className="hero"><h1>Prediction <span className="grad">leaderboard</span></h1>
      <p>3 points for the exact score, 2 for the right result and goal difference, 1 for the right result. Weeks run Monday to Sunday, Nairobi time.</p></div>
    {process.env.DATABASE_URL ? <Leaderboard /> : <p className="mini">The prediction game isn’t switched on for this deployment yet.</p>}
  </>;
}
