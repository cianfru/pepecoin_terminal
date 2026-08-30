// The whole operation on one timeline. Plots the operator cohort's real DEX activity across the full
// price history, split into the three acts of a pump/dump: ACCUMULATE (buys near launch, before the top),
// DISTRIBUTE (sells into / around the top), and RE-STAGE (what they're doing in the current rally). Each
// event carries the wallet so the chart can tag who is behind every orb (click → Zerion / Etherscan).
//
// Usage: node scripts/build-operation.mjs --transfers=transfers.csv --prices=prices.csv → public/operation.json
import fs from "node:fs";
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const DAY = 86400000;
const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
const dayFloor = (ts) => Math.floor(ts / DAY) * DAY;

async function priceFn(path) {
  const rows = (await readFile(path, "utf8")).trim().split(/\r?\n/).slice(1).map((l) => l.split(","))
    .map((c) => [dayFloor(Date.parse(c[0])), Number(c[1])]).filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const at = (ts) => { let lo = 0, hi = rows.length - 1, best = rows[0][1]; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m][0] <= ts) { best = rows[m][1]; lo = m + 1; } else hi = m - 1; } return best; };
  return { at, spot: rows[rows.length - 1][1] };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const ATH = Date.parse(args.ath ?? "2024-04-11"), RALLY = Date.parse(args.rally ?? "2026-08-14"), HIGH = Number(args.high ?? 1.0);
  const MIN_USD = Number(args.min_usd ?? 1500); // only plot meaningful events, so the chart stays legible
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const cohort = new Set();
  for (const r of sm.cycle || []) cohort.add(r.a);
  for (const c of sm.clusters || []) for (const m of c.members || []) cohort.add(m.a);
  const primed = new Set((sm.rally?.primed || []).map((p) => p.a));
  for (const a of primed) cohort.add(a);

  const kind = (a) => EXCLUDE_LABELS[a]?.kind || null;
  const isDex = (a) => { const k = kind(a); return k === "lp" || k === "mm"; };
  const isVault = (a) => kind(a) === "defi";
  const { at: priceAt, spot } = await priceFn(args.prices || "prices.csv");

  const events = [];
  const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") });
  let hdr = true;
  for await (const line of rl) {
    if (hdr) { hdr = false; continue; }
    if (!line.trim()) continue;
    const c = line.split(","); const from = c[0].toLowerCase(), to = c[1].toLowerCase(); const ts = Date.parse(c[2]); const qty = Number(c[3]) / 1e18;
    const price = priceAt(dayFloor(ts)); const usd = qty * price;
    if (usd < MIN_USD) continue;
    // BUY (cohort receives from the DEX pool/router) → accumulate (pre-top) or restage (rally)
    if (cohort.has(to) && isDex(from)) {
      if (ts < ATH) events.push({ t: ts, price, qty, usd, w: to, phase: "accumulate" });
      else if (ts >= RALLY) events.push({ t: ts, price, qty, usd, w: to, phase: "restage" });
    }
    // SELL (cohort sends to the DEX pool/router) at a high price → distribute
    if (cohort.has(from) && isDex(to) && price >= HIGH) events.push({ t: ts, price, qty, usd, w: from, phase: "distribute" });
    // RE-STAGE inflow in the rally that is NOT a market buy (vault withdrawal / wallet consolidation)
    if (cohort.has(to) && ts >= RALLY && !isDex(from) && !cohort.has(from)) {
      if (isVault(from)) events.push({ t: ts, price, qty, usd, w: to, phase: "restage", src: "vault" });
      else events.push({ t: ts, price, qty, usd, w: to, phase: "restage", src: "wallet" });
    }
  }
  events.sort((a, b) => b.usd - a.usd);
  // cap per phase so the chart stays readable; label the biggest few with their wallet
  const cap = { accumulate: 140, distribute: 140, restage: 140 };
  const kept = []; const seen = { accumulate: 0, distribute: 0, restage: 0 };
  for (const e of events) { if (seen[e.phase] >= cap[e.phase]) continue; seen[e.phase]++; kept.push(e); }
  kept.sort((a, b) => a.t - b.t);
  // tag the top ~5 per phase with a label
  for (const ph of ["accumulate", "distribute", "restage"]) {
    kept.filter((e) => e.phase === ph).sort((a, b) => b.usd - a.usd).slice(0, 6).forEach((e) => { e.lab = e.w.slice(0, 6) + "…" + e.w.slice(-4); });
  }
  const rnd = (x, d = 0) => +(x || 0).toFixed(d);
  const out = {
    updated: iso(Date.now()), spot, ath: iso(ATH), rally: iso(RALLY),
    totals: {
      accumulateUsd: rnd(events.filter((e) => e.phase === "accumulate").reduce((s, e) => s + e.usd, 0)),
      distributeUsd: rnd(events.filter((e) => e.phase === "distribute").reduce((s, e) => s + e.usd, 0)),
      restageUsd: rnd(events.filter((e) => e.phase === "restage").reduce((s, e) => s + e.usd, 0)),
      wallets: cohort.size,
    },
    events: kept.map((e) => ({ t: e.t, price: rnd(e.price, 7), qty: rnd(e.qty), usd: rnd(e.usd), w: e.w, phase: e.phase, src: e.src || null, lab: e.lab || null, d: iso(e.t) })),
  };
  await writeFile("public/operation.json", JSON.stringify(out));
  const $ = (x) => "$" + Math.round(x / 1e3) + "k";
  console.log(`OPERATION TIMELINE — ${cohort.size} wallets, ${out.events.length} plotted events`);
  console.log(`  accumulate (pre-top buys) ${$(out.totals.accumulateUsd)} · distribute (sold the top) ${$(out.totals.distributeUsd)} · re-stage (now) ${$(out.totals.restageUsd)}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
