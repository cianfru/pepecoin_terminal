// Flow analytics from the raw transfer archive — the "who's buying / who left / who's still here" suite.
// Reads transfers.csv (+ prices.csv) and emits three daily feeds, all reconstructed locally for $0:
//   public/buyer-flow.json  — daily net accumulation split by cohort: brand-new wallets, reactivated
//                             (were ~empty, bought back), existing holders adding, vs supply sold.
//   public/exit-flow.json   — daily supply that LEFT (a wallet crossing below the holder bar), split
//                             into profit vs loss exits (exit-day price vs the wallet's avg cost).
//   public/survival.json    — arrival-cohort survival: of wallets that first crossed the bar in each
//                             quarter, how many still hold.
// Method notes (honesty): cost basis here is an AVERAGE-COST proxy (not full FIFO) — good enough to
// split profit/loss exits, and clearly labelled as such on the site. Infrastructure is excluded.
//
// Usage: node scripts/build-flows.mjs --transfers=transfers.csv --prices=prices.csv [--bar=1000] [--dust=50]
import { EXCLUDE } from "./build-onchain-local.mjs";
import { createReadStream } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const DAY = 86400000;
const dayFloor = (ts) => Math.floor(ts / DAY) * DAY;
const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
const quarter = (ts) => { const d = new Date(ts); return d.getUTCFullYear() + "-Q" + (Math.floor(d.getUTCMonth() / 3) + 1); };

async function loadPrices(path) {
  const txt = await readFile(path, "utf8");
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  const hdr = lines[0].toLowerCase().split(",");
  const cd = hdr.indexOf("day") >= 0 ? hdr.indexOf("day") : 0;
  const cp = hdr.indexOf("price") >= 0 ? hdr.indexOf("price") : 1;
  const rows = lines.slice(1).map((l) => l.split(",")).map((c) => [dayFloor(Date.parse(c[cd])), Number(c[cp])])
    .filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  return (ts) => { // forward/back-filled lookup
    let lo = 0, hi = rows.length - 1, best = rows[0][1];
    while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m][0] <= ts) { best = rows[m][1]; lo = m + 1; } else hi = m - 1; }
    return best;
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const BAR = Number(args.bar ?? 1000);   // "holder" bar in tokens
  const DUST = Number(args.dust ?? 50);   // ignore net moves below this (noise)
  const priceAt = await loadPrices(args.prices || "prices.csv");

  // stream transfers, group by day
  const byDay = new Map(); // dayTs -> [{from,to,amt}]
  const rl = createInterface({ input: createReadStream(args.transfers || "transfers.csv"), crlfDelay: Infinity });
  let hdr = true;
  for await (const line of rl) {
    if (hdr) { hdr = false; continue; }
    if (!line.trim()) continue;
    const c = line.split(",");
    const ts = Date.parse(c[2]); if (!Number.isFinite(ts)) continue;
    const d = dayFloor(ts);
    let a = byDay.get(d); if (!a) byDay.set(d, (a = []));
    a.push({ from: c[0].toLowerCase(), to: c[1].toLowerCase(), amt: Number(c[3]) / 1e18 });
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  const bal = new Map(), avg = new Map(), firstDay = new Map();
  const ex = (a) => EXCLUDE.has(a) || !a || a === "0x0000000000000000000000000000000000000000";
  const buyer = [], exit = [];

  for (const d of days) {
    const recv = new Map(), send = new Map();
    for (const t of byDay.get(d)) {
      if (!ex(t.to)) recv.set(t.to, (recv.get(t.to) || 0) + t.amt);
      if (!ex(t.from)) send.set(t.from, (send.get(t.from) || 0) + t.amt);
    }
    const price = priceAt(d);
    let nw = 0, re = 0, ad = 0, so = 0, nNew = 0, nRe = 0, nAd = 0, nSe = 0;
    let exP = 0, exL = 0, nEx = 0;
    const touched = new Set([...recv.keys(), ...send.keys()]);
    for (const w of touched) {
      const start = bal.get(w) || 0;
      const r = recv.get(w) || 0, s = send.get(w) || 0, delta = r - s;
      if (r > 0) { avg.set(w, (( (avg.get(w) || price) * start) + price * r) / (start + r)); } // avg-cost proxy
      const end = start + delta;
      const wasFirst = !firstDay.has(w);
      if (delta > DUST) {
        if (wasFirst) { nw += delta; nNew++; }
        else if (start < BAR) { re += delta; nRe++; }
        else { ad += delta; nAd++; }
      } else if (delta < -DUST) { so += -delta; nSe++; }
      // exit: crossed from holder → below bar
      if (start >= BAR && end < BAR) {
        const left = start - Math.max(end, 0);
        if (price >= (avg.get(w) || price)) exP += left; else exL += left;
        nEx++;
      }
      bal.set(w, end);
      if (wasFirst) firstDay.set(w, d);
    }
    buyer.push({ d: iso(d), nw: +nw.toFixed(2), re: +re.toFixed(2), ad: +ad.toFixed(2), so: +so.toFixed(2),
      net: +(nw + re + ad - so).toFixed(2), nNew, nRe, nAd, nSe });
    exit.push({ d: iso(d), profit: +exP.toFixed(2), loss: +exL.toFixed(2), n: nEx });
  }

  // survival by arrival quarter (first day the wallet ever appeared)
  const coh = new Map();
  for (const [w, fd] of firstDay) {
    const q = quarter(fd);
    let c = coh.get(q); if (!c) coh.set(q, (c = { q, arrived: 0, holdNow: 0 }));
    c.arrived++;
    if ((bal.get(w) || 0) >= BAR) c.holdNow++;
  }
  const cohorts = [...coh.values()].sort((a, b) => a.q.localeCompare(b.q))
    .map((c) => ({ ...c, pct: c.arrived ? +(100 * c.holdNow / c.arrived).toFixed(1) : 0 }));
  const everHeld = firstDay.size;
  let holdNow = 0; for (const [, b] of bal) if (b >= BAR) holdNow++;

  const meta = { updated: iso(days[days.length - 1]), bar: BAR };
  await writeFile("public/buyer-flow.json", JSON.stringify({ ...meta, days: buyer }));
  await writeFile("public/exit-flow.json", JSON.stringify({ ...meta, days: exit }));
  await writeFile("public/survival.json", JSON.stringify({ ...meta, everHeld, holdNow, gonePct: everHeld ? +(100 * (everHeld - holdNow) / everHeld).toFixed(1) : 0, cohorts }));

  const rr = buyer.slice(-14).reduce((s, r) => ({ nw: s.nw + r.nw, re: s.re + r.re, ad: s.ad + r.ad, so: s.so + r.so }), { nw: 0, re: 0, ad: 0, so: 0 });
  console.log(`buyer-flow: ${buyer.length} days · last-14d new ${(rr.nw/1e6).toFixed(2)}M · react ${(rr.re/1e6).toFixed(2)}M · add ${(rr.ad/1e6).toFixed(2)}M · sold ${(rr.so/1e6).toFixed(2)}M`);
  console.log(`exit-flow: last-14d left ${(exit.slice(-14).reduce((s,r)=>s+r.profit+r.loss,0)/1e6).toFixed(2)}M`);
  console.log(`survival: ${everHeld} ever held ≥${BAR} · ${holdNow} still hold (${(100*holdNow/everHeld).toFixed(0)}%) · ${cohorts.length} cohorts`);
}
main();
