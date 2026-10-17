import "./globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";
import ThemeToggle from "../components/ThemeToggle";
import NavLinks from "../components/NavLinks";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata = { title: "Kikosi: football form, stats & model probabilities", description: "Informational football analysis: form guides, head-to-head, home/away splits and model probabilities. No betting. 18+." };
export const viewport = { width: "device-width", initialScale: 1 };
const themeScript = `try{var t=localStorage.getItem("pl-theme")||"dark";document.documentElement.dataset.theme=t}catch(e){}`;
export default function RootLayout({ children }) {
  return <html lang="en" className={inter.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>
    <div className="rg-bar">18+ · Informational analysis only. No predictions or guarantees, and no betting on this site. Gamble responsibly. Need help? <a href="https://gra.go.ke/self-exclusion-process/" target="_blank" rel="noopener noreferrer">Kenya GRA self-exclusion</a> · toll-free 0800 723 770</div>
    <header className="nav"><div className="wrap nav-in"><Link href="/" className="brand"><span className="brand-mark">◎</span><span>Kik<em>osi</em></span></Link><NavLinks /><ThemeToggle /></div></header>
    <main className="wrap">{children}</main>
    <footer><div className="wrap">
      <p><b>Kikosi</b> is an independent, informational football statistics site. Probabilities and “fair odds” are <b>model estimates, not bookmaker odds</b>. They can be wrong and are not predictions, tips or guarantees. No bets, accounts, deposits or payments exist on this site. 18+ only.</p>
      <p>Responsible gambling in Kenya: <a href="https://gra.go.ke/self-exclusion-process/" target="_blank" rel="noopener noreferrer">Gambling Regulatory Authority (GRA): self-exclusion &amp; support</a>, toll-free 0800 723 770, info@bclb.go.ke.</p>
      <p>Data: fixtures &amp; results from <a href="https://www.football-data.org" target="_blank" rel="noopener noreferrer">football-data.org</a>, refreshed every 30 min. Previous-season history &amp; fallback: <a href="https://github.com/openfootball/football.json" target="_blank" rel="noopener noreferrer">openfootball/football.json</a>.</p>
    </div></footer>
  </body></html>;
}
