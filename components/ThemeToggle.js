"use client";
import { useEffect, useState } from "react";
export default function ThemeToggle() {
  const [t, setT] = useState(null);
  useEffect(() => setT(document.documentElement.dataset.theme || "light"), []);
  const flip = () => { const n = t === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; localStorage.setItem("pl-theme", n); setT(n); };
  return <button className="toggle" onClick={flip} aria-label="Toggle dark/light theme" title="Toggle theme">{t === "dark" ? "☀️" : "🌙"}</button>;
}
