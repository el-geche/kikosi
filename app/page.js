"use client";
import {useEffect,useState} from "react";
const KEY="kbest-casino-v1",DAY=864e5,START=1000,BONUS=250;
const SYM=["🍒","🍋","🔔","⭐","💎","7️⃣"];
const BOTS=["Lucky Lou","Ace","Dice Queen","High Roller"];
const RED=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}};
const r=n=>Math.floor(Math.random()*n);
export default function Home(){
 const[s,setS]=useState(null);const[name,setName]=useState("");const[tab,setTab]=useState("slots");const[msg,setMsg]=useState("");
 const[bet,setBet]=useState(10);const[reels,setReels]=useState(["🍒","🍋","🔔"]);const[rb,setRb]=useState("red");
 useEffect(()=>{setS(load()||{players:{},current:null,pool:[]})},[]);
 useEffect(()=>{s&&localStorage.setItem(KEY,JSON.stringify(s))},[s]);
 if(!s)return null;
 const me=s.current&&s.players[s.current];
 const upd=(f)=>setS(p=>{const n=structuredClone(p);f(n);return n});
 const add=(d)=>upd(n=>{n.players[n.current].chips+=d});
 const join=()=>{const nm=name.trim();if(!nm)return;upd(n=>{n.players[nm]??={chips:START,lastBonus:0};n.current=nm});setMsg(`Welcome, ${nm}!`)};
 const ok=b=>{if(!(b>0)||b>me.chips){setMsg("Not enough chips for that bet.");return false}return true};
 const spin=()=>{if(!ok(bet))return;const x=[SYM[r(6)],SYM[r(6)],SYM[r(6)]];setReels(x);
  let w=0;if(x[0]===x[1]&&x[1]===x[2])w=bet*(x[0]==="7️⃣"?50:x[0]==="💎"?20:10);else if(x[0]===x[1]||x[1]===x[2]||x[0]===x[2])w=bet*2;
  add(w-bet);setMsg(w?`You won ${w} chips!`:`No luck. -${bet}`)};
 const roul=()=>{if(!ok(bet))return;const n=r(37);const c=n===0?"green":RED.includes(n)?"red":"black";
  let w=0;if(rb===c)w=bet*2;else if(rb==="even"&&n&&n%2===0)w=bet*2;else if(rb==="odd"&&n%2===1)w=bet*2;
  add(w-bet);setMsg(`Ball landed on ${n} (${c}). ${w?`Won ${w}!`:`Lost ${bet}.`}`)};
 const potTotal=s.pool.reduce((a,e)=>a+e.amt,0);
 const enter=()=>{if(!ok(bet))return;upd(n=>{n.players[n.current].chips-=bet;n.pool.push({who:n.current,amt:+bet});
  BOTS.slice(0,1+r(3)).forEach(b=>n.pool.push({who:b,amt:10+r(90)}))});setMsg(`You put ${bet} chips in the pool.`)};
 const draw=()=>{if(!s.pool.length)return;let t=Math.random()*potTotal,win=s.pool[s.pool.length-1].who;
  for(const e of s.pool){if((t-=e.amt)<0){win=e.who;break}}
  upd(n=>{n.players[win]??={chips:START,lastBonus:0};n.players[win].chips+=potTotal;n.pool=[]});setMsg(`🎉 ${win} won the jackpot of ${potTotal} chips!`)};
 const left=me?me.lastBonus+DAY-Date.now():0;
 const claim=()=>{if(left>0)return;upd(n=>{const p=n.players[n.current];p.chips+=BONUS;p.lastBonus=Date.now()});setMsg(`+${BONUS} daily bonus chips!`)};
 const board=Object.entries(s.players).sort((a,b)=>b[1].chips-a[1].chips).slice(0,10);
 return <><div className="notice">PLAY MONEY ONLY: virtual chips have no cash value and can't be bought, sold or cashed out.</div>
 <main><h1>🎰 Kbest Play Casino</h1>
 {!me?<div className="card"><h2>Choose your player name</h2><input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" maxLength={20}/><button onClick={join}>Play (get {START} free chips)</button></div>:<>
 <div className="card"><b>{s.current}</b>: {me.chips} chips <button onClick={claim} disabled={left>0}>{left>0?`Next bonus in ${Math.ceil(left/36e5)}h`:`Claim daily bonus (+${BONUS})`}</button>
 <button onClick={()=>upd(n=>{n.current=null})}>Switch player</button>
 {me.chips===0&&<button onClick={()=>add(START)}>Out of chips? Reset to {START}</button>}</div>
 <nav>{["slots","jackpot","roulette","leaderboard"].map(t=><button key={t} className={tab===t?"on":""} onClick={()=>{setTab(t);setMsg("")}}>{t}</button>)}</nav>
 {tab!=="leaderboard"&&<div>Bet: <input type="number" min="1" value={bet} onChange={e=>setBet(Math.floor(+e.target.value))}/></div>}
 <div className="card">
 {tab==="slots"&&<><div className="reels">{reels.join(" ")}</div><button onClick={spin}>Spin</button><p>3 of a kind pays 10x (💎 20x, 7️⃣ 50x). Any pair pays 2x.</p></>}
 {tab==="jackpot"&&<><h2>Jackpot pool: {potTotal} chips</h2><p>Every chip you put in is one ticket. The winner is drawn at random, weighted by chips.</p>
  <button onClick={enter}>Put {bet} in the pool</button><button onClick={draw} disabled={!s.pool.length}>Draw winner</button>
  <ul>{s.pool.map((e,i)=><li key={i}>{e.who}: {e.amt}</li>)}</ul></>}
 {tab==="roulette"&&<><select value={rb} onChange={e=>setRb(e.target.value)}>{["red","black","even","odd"].map(o=><option key={o}>{o}</option>)}</select><button onClick={roul}>Spin wheel</button><p>Even-money bets pay 2x. 0 is green.</p></>}
 {tab==="leaderboard"&&<><h2>🏆 Leaderboard</h2><table><thead><tr><th>#</th><th>Player</th><th>Chips</th></tr></thead><tbody>{board.map(([n,p],i)=><tr key={n}><td>{i+1}</td><td>{n}</td><td>{p.chips}</td></tr>)}</tbody></table><small>Players on this device/browser.</small></>}
 <p><b>{msg}</b></p></div></>}
 </main></>}
