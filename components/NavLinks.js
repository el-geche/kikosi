"use client";
import Link from "next/link"; import { usePathname } from "next/navigation";
const L = [["/", "Overview"], ["/premier-league", "Premier League"], ["/la-liga", "La Liga"], ["/bundesliga", "Bundesliga"], ["/serie-a", "Serie A"], ["/ligue-1", "Ligue 1"], ["/jackpot", "Pick-12 Lab"], ["/strategy", "Strategy"]];
export default function NavLinks() { const p = usePathname(); return <nav className="links">{L.map(([h, l]) => <Link key={h} href={h} className={p === h ? "on" : ""}>{l}</Link>)}</nav>; }
