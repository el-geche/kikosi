import LiveBoard from "../../components/LiveBoard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Live · Kikosi" };
export default function Live({ searchParams }) {
  const demo = searchParams?.demo === "1" && process.env.VERCEL_ENV !== "production";
  return <>
    <div className="hero"><h1>Live <span className="grad">now</span></h1>
      <p>In-play win/draw/win chances from the pre-match model conditioned on the current score, what your pick would score if it ended now, and how the table would move. Everything here is provisional until full time.</p>
      {demo && <div className="note sim-banner" style={{ marginTop: 12 }}><b>Simulated live data (preview only).</b> Fixtures marked “Simulated test data” are fake TEST matches used to demonstrate this page.</div>}</div>
    {process.env.DATABASE_URL ? <LiveBoard demo={demo} /> : <p className="mini">Live predictions aren’t switched on for this deployment yet.</p>}
  </>;
}
