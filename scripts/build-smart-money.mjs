// Smart-money / smart-wallet analysis from the raw transfer archive.
// Per wallet, replays FIFO lots to compute REALIZED P&L (matched buy→sell round-trips), realized ROI,
// current position + unrealized, and recent net flow — then surfaces the cohorts the owner asked for:
//   • cohort     — "smart wallets": realized ≥5× (or big $ profit) on prior trades, meaningful capital.
//   • reentrants — wallets that SOLD OUT (to ~0) and are BUYING AGAIN now, with their prior realized P&L
//                  (the "did insiders sell the top and re-accumulate?" question — shown, not asserted).
//   • buysRecent — who bought in the last 7 days, tagged new / returning / smart / whale.
// A second pass records each shown wallet's buy/sell events for a drill-down timeline.
// All reconstructed locally, $0. Cost basis = market price on the acquisition day (engine convention).
//
// Usage: node scripts/build-smart-money.mjs --transfers=transfers.csv --prices=prices.csv
import { EXCLUDE } from "./build-onchain-local.mjs";
import { createReadStream } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const DAY = 86400000, EPS = 1e-9;
const dayFloor = (ts) => Math.floor(ts / DAY) * DAY;
const iso = (ts) => new Date(ts).toISOString().slice(0, 10);

async function priceFn(path) {
  const txt = await readFile(path, "utf8");
  const rows = txt.split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => l.split(","))
    .map((c) => [dayFloor(Date.parse(c[0])), Number(c[1])]).filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const at = (ts) => { let lo = 0, hi = rows.length - 1, best = rows[0][1]; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m][0] <= ts) { best = rows[m][1]; lo = m + 1; } else hi = m - 1; } return best; };
  return { at, spot: rows[rows.length - 1][1] };
}

async function loadSorted(path) {
  const out = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let hdr = true;
  for await (const line of rl) {
    if (hdr) { hdr = false; continue; }
    if (!line.trim()) continue;
    const c = line.split(",");
    const ts = Date.parse(c[2]); if (!Number.isFinite(ts)) continue;
    out.push({ from: c[0].toLowerCase(), to: c[1].toLowerCase(), ts, amt: Number(c[3]) / 1e18 });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const MIN_INVEST = Number(args.min_invest ?? 2000);  // USD capital deployed to qualify as "smart"
  const MIN_ROI = Number(args.min_roi ?? 5);           // realized multiple
  const MIN_PROFIT = Number(args.min_profit ?? 25000); // or big $ realized
  const { at: priceAt, spot } = await priceFn(args.prices || "prices.csv");
  const tx = await loadSorted(args.transfers || "transfers.csv");
  const nowTs = tx[tx.length - 1].ts;
  const c7 = nowTs - 7 * DAY, c30 = nowTs - 30 * DAY;
  const ex = (a) => EXCLUDE.has(a) || !a || a === "0x0000000000000000000000000000000000000000";

  // per-wallet state
  const W = new Map();
  const get = (a) => { let w = W.get(a); if (!w) W.set(a, (w = { lots: [], bal: 0, invested: 0, proceeds: 0, costSold: 0, realized: 0, first: 0, soldOut: false, reentered: false, b7: null, b30: null })); return w; };
  let snap7 = false, snap30 = false;
  for (const t of tx) {
    if (!snap30 && t.ts >= c30) { for (const [, w] of W) w.b30 = w.bal; snap30 = true; }
    if (!snap7 && t.ts >= c7) { for (const [, w] of W) w.b7 = w.bal; snap7 = true; }
    const price = priceAt(dayFloor(t.ts));
    if (!ex(t.to)) {
      const w = get(t.to);
      if (w.bal < EPS && w.first && w.soldOut) w.reentered = true;
      w.lots.push({ q: t.amt, p: price }); w.invested += t.amt * price; w.bal += t.amt; if (!w.first) w.first = t.ts;
    }
    if (!ex(t.from)) {
      const w = get(t.from);
      let rem = t.amt, cost = 0;
      while (rem > EPS && w.lots.length) { const lot = w.lots[0]; const take = Math.min(rem, lot.q); cost += take * lot.p; lot.q -= take; rem -= take; if (lot.q <= EPS) w.lots.shift(); }
      w.proceeds += t.amt * price; w.costSold += cost; w.realized += t.amt * price - cost; w.bal -= t.amt;
      if (w.bal < EPS) { w.bal = 0; w.soldOut = true; w.lots = []; }
    }
  }
  if (!snap30) for (const [, w] of W) w.b30 = w.bal;
  if (!snap7) for (const [, w] of W) w.b7 = w.bal;

  const rows = [];
  for (const [a, w] of W) {
    if (ex(a)) continue;
    const heldQ = w.lots.reduce((s, l) => s + l.q, 0);
    const avgCost = heldQ > EPS ? w.lots.reduce((s, l) => s + l.q * l.p, 0) / heldQ : 0;
    const unreal = heldQ * (spot - avgCost);
    const roi = w.costSold > EPS ? w.proceeds / w.costSold : 0;
    const d7 = w.bal - (w.b7 ?? w.bal), d30 = w.bal - (w.b30 ?? w.bal);
    rows.push({ a, realized: w.realized, roi, invested: w.invested, proceeds: w.proceeds, bal: w.bal, avgCost, unreal,
      d7, d30, first: iso(w.first), soldOut: w.soldOut, reentered: w.reentered });
  }

  const rnd = (x, d = 0) => +x.toFixed(d);
  const trim = (r) => ({ a: r.a, realized: rnd(r.realized), roi: rnd(r.roi, 2), invested: rnd(r.invested), bal: rnd(r.bal),
    avgCost: rnd(r.avgCost, 6), unreal: rnd(r.unreal), d7: rnd(r.d7), d30: rnd(r.d30), first: r.first, soldOut: r.soldOut, reentered: r.reentered });

  // COHORT: proven realized winners (5x or big profit) with real capital
  const cohort = rows.filter((r) => r.invested >= MIN_INVEST && (r.roi >= MIN_ROI || r.realized >= MIN_PROFIT))
    .sort((a, b) => b.realized - a.realized).map(trim);
  // RE-ENTRANTS: sold out AND buying again in the last 30d — the owner's key list
  const reentrants = rows.filter((r) => r.soldOut && r.d30 > 0 && r.realized > 0)
    .sort((a, b) => b.realized - a.realized).map(trim);
  // WHO'S BUYING (7d): net buyers, tagged
  const smartSet = new Set(cohort.filter((r) => r.roi >= MIN_ROI).map((r) => r.a));
  const buysRecent = rows.filter((r) => r.d7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 40).map((r) => ({
    ...trim(r), tag: smartSet.has(r.a) ? "smart" : r.reentered ? "returning" : (r.first && Date.parse(r.first) >= c30) ? "new" : "adding",
  }));

  // second pass: buy/sell timeline for shown wallets (cohort∪reentrants∪buysRecent, capped)
  const keep = new Set([...cohort.slice(0, 60), ...reentrants.slice(0, 60), ...buysRecent].map((r) => r.a));
  const detail = {};
  for (const t of tx) {
    const price = priceAt(dayFloor(t.ts));
    if (keep.has(t.to)) { (detail[t.to] ??= { buys: [], sells: [] }).buys.push([iso(t.ts), rnd(price, 6), rnd(t.amt)]); }
    if (keep.has(t.from)) { (detail[t.from] ??= { buys: [], sells: [] }).sells.push([iso(t.ts), rnd(price, 6), rnd(t.amt)]); }
  }
  for (const k in detail) { detail[k].buys = detail[k].buys.slice(-120); detail[k].sells = detail[k].sells.slice(-120); }

  const out = { updated: iso(nowTs), spot, minInvest: MIN_INVEST, minRoi: MIN_ROI,
    stats: { cohort: cohort.length, reentrants: reentrants.length,
      reentrantRealized: rnd(reentrants.reduce((s, r) => s + r.realized, 0)),
      reentrantReinvest30d: rnd(reentrants.reduce((s, r) => s + r.d30, 0)) },
    cohort: cohort.slice(0, 100), reentrants: reentrants.slice(0, 100), buysRecent, detail };
  await writeFile("public/smart-money.json", JSON.stringify(out));

  console.log(`spot $${spot.toFixed(4)}`);
  console.log(`cohort (≥${MIN_ROI}× or ≥$${MIN_PROFIT} realized, ≥$${MIN_INVEST} in): ${cohort.length}`);
  console.log(`RE-ENTRANTS (sold out, buying again 30d): ${reentrants.length} · prior realized $${(out.stats.reentrantRealized/1e6).toFixed(2)}M · re-bought ${(out.stats.reentrantReinvest30d/1e6).toFixed(2)}M tokens`);
  console.log(`top re-entrants by prior realized P&L:`);
  for (const r of reentrants.slice(0, 10)) console.log(`  ${r.a}  realized $${(r.realized/1e3).toFixed(0)}k  roi ${r.roi}×  now buying +${(r.d30/1e3).toFixed(0)}k  bag ${(r.bal/1e3).toFixed(0)}k`);
}
main();
