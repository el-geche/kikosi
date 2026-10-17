export const metadata = { title: "Strategy: bankroll & value (educational) · Kikosi" };
export default function Strategy() {
  return <>
    <div className="hero"><h1>Thinking in <span className="grad">probabilities</span></h1><p>An educational guide to bankroll management, value and the limits of models. Not financial or betting advice.</p></div>
    <div className="layout2"><article className="card prose">
      <h3>1. Odds are just probabilities</h3><p>Decimal odds <code>o</code> imply a probability of <code>1 ÷ o</code>. Odds of 2.50 imply 40%. Our “fair odds” go the other way: if the model estimates 40%, the fair price is 2.50. Bookmaker prices include a margin (the overround), so their implied probabilities add up to more than 100%.</p>
      <h3>2. What “value” means</h3><p>A price has positive expected value only if the true probability is higher than the price implies: <code>EV = p × o − 1</code>. The hard part is that nobody knows <code>p</code>. A model gives an estimate with real error, and small edges usually disappear once you account for that uncertainty and the margin.</p>
      <h3>3. Bankroll management</h3><ul><li>Only use money you can afford to lose completely, never money set aside for rent, food, school fees or debt.</li><li>Set a fixed budget and a time limit before you start, and stop when you reach either one.</li><li>Flat, small stakes (1–2% of a budget) reduce the risk of ruin. Never chase losses by raising stakes.</li><li>The Kelly criterion <code>f = (p·o − 1) ÷ (o − 1)</code> shows how sensitive “optimal” sizing is to errors in <code>p</code>. Overestimating <code>p</code> leads to oversized stakes, which is why many people use fractional Kelly or none at all.</li></ul>
      <h3>4. Why accumulators and jackpots are so hard</h3><p>Probabilities multiply. Twelve picks at 60% each combine to about 0.2%, roughly 1 in 459. Margins compound too, so long slips almost always carry a large built-in disadvantage. The <a href="/jackpot" style={{ color: "var(--accent)" }}>Pick-12 Lab</a> shows this with live fixtures.</p>
      <h3>5. Variance and sample size</h3><p>Early-season tables are noisy. That is why our model shrinks each team’s current numbers toward last season (or toward a promoted-team prior) until more games are played.</p>
      <h3>6. Know when to stop</h3><p>Warning signs include chasing losses, betting to escape stress, hiding it from others, and borrowing to gamble. In Kenya you can request self-exclusion through the <a href="https://gra.go.ke/self-exclusion-process/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Gambling Regulatory Authority</a> (toll-free 0800 723 770).</p>
    </article>
    <aside className="card sticky prose" style={{ alignSelf: "start" }}><h3 style={{ marginTop: 0 }}>How the Kikosi model works</h3><ul>
      <li>Home and away attack and defence strengths for every team, from goals scored and conceded at each venue.</li>
      <li>Shrinkage: each team’s rates are blended with 5 games’ worth of last-season data (promoted teams get a weaker prior).</li>
      <li>A small (±8% max) adjustment for points per game over the last 5.</li>
      <li>Expected goals for each side feed independent Poisson distributions, which give 1X2, Over 2.5, BTTS and the most likely score.</li>
      <li>Fair odds = 1 ÷ probability. These are <b>model estimates, not bookmaker odds</b>.</li></ul>
      <p className="mini">Limits: there is no player, injury, lineup or market data. Poisson models underrate draws, and the data can lag real results.</p></aside></div>
  </>;
}
