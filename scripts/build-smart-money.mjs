// Smart-money / smart-wallet analysis from the raw transfer archive.
// Per wallet, replays FIFO lots to compute REALIZED P&L (matched buy→sell round-trips), realized ROI,
// current position + unrealized, recent net flow, AND era-aware behaviour (bought early? sold into the
// top? buying the current rally?). Then surfaces the cohorts that answer the owner's question:
//
//   • cycle      — THE ONE: bought EARLY (pre-top), sold into/near the TOP for real money, and is
//                  BUYING AGAIN in the current rally. The "insider round-trip" pattern, shown not asserted.
//   • fresh      — brand-NEW wallets (first-ever pepecoin in the rally window) that bought a LARGE amount
//                  and are still holding — the "seeded then accumulating this one coin" candidates.
//   • cohort     — proven realized winners (≥5× or big $), size-gated so 1×/dust wallets drop out.
//   • reentrants — sold out AND buying again now, size-gated by prior realized.
//
// clusters — among the surfaced wallets, groups that are RELATED by token flow: they share a common
//   pepecoin SEEDER (one address sent the first coins to several of them) or moved tokens between
//   each other. NOTE: this is TOKEN-flow linkage from the pepecoin archive only — it cannot see ETH
//   (e.g. a Coinbase→fresh-wallet seed), which needs an ETH-layer lookup. Stated, not overclaimed.
//
// A second pass records each surfaced wallet's buy/sell events for the drill-down timeline (drawn over
// the real daily price line from price-series.json). All reconstructed locally, $0.
//
// Usage: node scripts/build-smart-money.mjs --transfers=transfers.csv --prices=prices.csv
import { EXCLUDE, EXCLUDE_LABELS } from "./build-onchain-local.mjs";
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
  return { at, spot: rows[rows.length - 1][1], rows };
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
  const MIN_INVEST = Number(args.min_invest ?? 2000);   // USD capital deployed to qualify as "smart"
  const MIN_ROI = Number(args.min_roi ?? 5);            // realized multiple
  const MIN_PROFIT = Number(args.min_profit ?? 25000);  // or big $ realized
  const HIGH = Number(args.high ?? 1.0);                // "sold high" = proceeds sold at price ≥ this
  const EARLY = Date.parse(args.early ?? "2024-03-01"); // "bought early" = first receive before this (pre-top)
  const ATH = Date.parse(args.ath ?? "2024-04-11");     // the top — "first run-up" accumulation is everything before it
  const RALLY = Date.parse(args.rally ?? "2026-08-14"); // current rally start (price ~$0.069 before the vertical move)
  const MIN_TOP = Number(args.min_top ?? 15000);        // USD sold high to count as "distributed the top"
  const MIN_REENTRY = Number(args.min_reentry ?? 5000); // realized floor for re-entrants (kills dust)
  const FRESH_DAYS = Number(args.fresh_days ?? 45);
  const MIN_FRESH = Number(args.min_fresh ?? 3000);     // USD of the fresh wallet's buys to be interesting

  const { at: priceAt, spot, rows: priceRows } = await priceFn(args.prices || "prices.csv");
  const tx = await loadSorted(args.transfers || "transfers.csv");
  const nowTs = tx[tx.length - 1].ts;
  const c7 = nowTs - 7 * DAY, c30 = nowTs - 30 * DAY, cFresh = nowTs - FRESH_DAYS * DAY;
  const ZERO = "0x0000000000000000000000000000000000000000";
  // ── WHALE / EXCHANGE-SCALE GUARD (owner-driven, 2026-08-30). Belt-and-suspenders after the Kraken false
  //    positive: even if an exchange/infra wallet is NOT hard-coded in EXCLUDE_LABELS, a $3M+ blue-chip
  //    footprint (build-wallet-capital's `whale` flag) means it is an exchange/custodian, not a retail
  //    operator — auto-drop it from the whole reconstruction. Dropping errs toward UNDER-counting
  //    coordination (the safe direction: over-merging is the dishonesty this project guards against).
  //    Uses the PRIOR run's committed capital data; absent on a cold first run (fine — EXCLUDE still holds).
  const whales = new Set();
  try {
    const wc = JSON.parse(await readFile("public/wallet-capital.json", "utf8")).wallets || {};
    for (const [a, v] of Object.entries(wc)) if (v?.whale) whales.add(a.toLowerCase());
  } catch { /* no prior capital file — EXCLUDE_LABELS is the floor */ }
  const ex = (a) => EXCLUDE.has(a) || whales.has(a) || !a || a === ZERO;

  // ── source classification: separate a REAL MARKET BUY (from the DEX pool/routers) from a CONTRACT
  //    WITHDRAWAL (bcred & other vaults — receiving your own deposited tokens back, NOT a buy) and a plain
  //    WALLET transfer. Counting contract withdrawals as buys inflated the "reaccumulation" read (owner caught this).
  let contractCache = {};
  try { contractCache = JSON.parse(await readFile("public/contract-types.json", "utf8")).addrs || {}; } catch { contractCache = {}; }
  let ctrLabels = {};
  try { ctrLabels = JSON.parse(await readFile("public/contract-labels.json", "utf8")).addrs || {}; } catch { ctrLabels = {}; }
  const kindOf = (a) => EXCLUDE_LABELS[a]?.kind || null;
  const isDex = (a) => { const k = kindOf(a); return k === "lp" || k === "mm"; };       // the pool / routers = market
  const isContractSrc = (a) => kindOf(a) === "defi" || contractCache[a] === true;        // a vault/contract = withdrawal
  const isCexAddr = (a) => kindOf(a) === "cex";

  // per-wallet state
  const W = new Map();
  const get = (a) => { let w = W.get(a); if (!w) W.set(a, (w = {
    lots: [], bal: 0, invested: 0, proceeds: 0, costSold: 0, realized: 0, first: 0, firstPrice: 0,
    bought: 0, sold: 0, soldHigh: 0, peakBal: 0, seeder: null, firstBuyUsd: 0, firstDay: 0,
    earlyBought: 0, rallyBought: 0,
    rMktBuy: 0, rMktSell: 0, rCtrWd: 0, rWalIn: 0, rCexIn: 0, // rally-window inflow by source (+ market sells)
    soldOut: false, reentered: false, b7: null, b30: null, bRally: null,
  })); return w; };
  let snap7 = false, snap30 = false, snapRally = false;
  let poolOut = 0, poolIn = 0; // gross tokens leaving / entering the LP pool during the rally = the price-moving flow
  for (const t of tx) {
    if (!snap30 && t.ts >= c30) { for (const [, w] of W) w.b30 = w.bal; snap30 = true; }
    if (!snapRally && t.ts >= RALLY) { for (const [, w] of W) w.bRally = w.bal; snapRally = true; }
    if (!snap7 && t.ts >= c7) { for (const [, w] of W) w.b7 = w.bal; snap7 = true; }
    const price = priceAt(dayFloor(t.ts));
    if (!ex(t.to)) {
      const w = get(t.to);
      if (w.bal < EPS && w.first && w.soldOut) w.reentered = true;
      w.lots.push({ q: t.amt, p: price }); w.invested += t.amt * price; w.bal += t.amt; w.bought += t.amt;
      if (!w.first) { w.first = t.ts; w.firstPrice = price; w.firstDay = dayFloor(t.ts); w.seeder = ex(t.from) ? null : t.from; }
      if (t.ts <= w.firstDay + DAY) w.firstBuyUsd += t.amt * price; // buys within the first day
      if (t.ts < ATH) w.earlyBought += t.amt;   // tokens accumulated during the first run-up (pre-top)
      if (t.ts >= RALLY) {                       // rally-window inflow, classified by where it came FROM
        w.rallyBought += t.amt;
        if (isDex(t.from)) w.rMktBuy += t.amt;            // real DEX purchase
        else if (isContractSrc(t.from)) w.rCtrWd += t.amt; // withdrawal from a vault/contract (NOT a buy)
        else if (isCexAddr(t.from)) w.rCexIn += t.amt;     // from an exchange
        else w.rWalIn += t.amt;                            // wallet-to-wallet (OTC / shuffle / p2p)
        if (kindOf(t.from) === "lp") poolOut += t.amt;     // tokens the pool paid out to a buyer
      }
      if (w.bal > w.peakBal) w.peakBal = w.bal;
    }
    if (!ex(t.from)) {
      const w = get(t.from);
      let rem = t.amt, cost = 0;
      while (rem > EPS && w.lots.length) { const lot = w.lots[0]; const take = Math.min(rem, lot.q); cost += take * lot.p; lot.q -= take; rem -= take; if (lot.q <= EPS) w.lots.shift(); }
      w.proceeds += t.amt * price; w.costSold += cost; w.realized += t.amt * price - cost; w.bal -= t.amt; w.sold += t.amt;
      if (price >= HIGH) w.soldHigh += t.amt * price;
      if (t.ts >= RALLY && isDex(t.to)) { w.rMktSell += t.amt; if (kindOf(t.to) === "lp") poolIn += t.amt; } // sold back onto the DEX
      if (w.bal < EPS) { w.bal = 0; w.soldOut = true; w.lots = []; }
    }
  }
  if (!snap30) for (const [, w] of W) w.b30 = w.bal;
  if (!snapRally) for (const [, w] of W) w.bRally = w.bal;
  if (!snap7) for (const [, w] of W) w.b7 = w.bal;

  const rows = [];
  for (const [a, w] of W) {
    if (ex(a)) continue;
    const heldQ = w.lots.reduce((s, l) => s + l.q, 0);
    const avgCost = heldQ > EPS ? w.lots.reduce((s, l) => s + l.q * l.p, 0) / heldQ : 0;
    const unreal = heldQ * (spot - avgCost);
    const roi = w.costSold > EPS ? w.proceeds / w.costSold : 0;
    const d7 = w.bal - (w.b7 ?? w.bal), d30 = w.bal - (w.b30 ?? w.bal), dRally = w.bal - (w.bRally ?? w.bal);
    const soldFrac = w.bought > EPS ? w.sold / w.bought : 0;
    rows.push({ a, realized: w.realized, roi, invested: w.invested, proceeds: w.proceeds, bal: w.bal, avgCost, unreal,
      d7, d30, dRally, first: iso(w.first), firstTs: w.first, firstPrice: w.firstPrice, firstBuyUsd: w.firstBuyUsd,
      bought: w.bought, sold: w.sold, soldFrac, soldHigh: w.soldHigh, peakBal: w.peakBal,
      earlyBought: w.earlyBought, rallyBought: w.rallyBought,
      rMktBuy: w.rMktBuy, rMktSell: w.rMktSell, rMktNet: w.rMktBuy - w.rMktSell, rCtrWd: w.rCtrWd, rWalIn: w.rWalIn, rCexIn: w.rCexIn,
      seeder: w.seeder, soldOut: w.soldOut, reentered: w.reentered });
  }
  const byAddr = new Map(rows.map((r) => [r.a, r]));

  // optional ETH-funding enrichment (public/eth-funding.json, maintained by enrich-eth-funding.mjs; no key)
  let funding = {};
  try { funding = JSON.parse(await readFile("public/eth-funding.json", "utf8")).wallets || {}; } catch { funding = {}; }
  const fundOf = (a) => funding[a]?.funder || null;                 // first ETH funder
  const fundLabel = (a) => funding[a]?.label || null;               // exchange name, or null = private EOA
  const fundEx = (a) => !!funding[a]?.exchange;                     // funded by a known exchange?

  const rnd = (x, d = 0) => +(x || 0).toFixed(d);
  // "then vs now": ratio of rally buys to the original run-up accumulation (a same-size re-buy is a fingerprint)
  const thenNow = (r) => r.earlyBought > EPS && r.rallyBought > EPS ? r.rallyBought / r.earlyBought : 0;
  const trim = (r) => ({ a: r.a, realized: rnd(r.realized), roi: rnd(r.roi, 2), invested: rnd(r.invested), bal: rnd(r.bal),
    avgCost: rnd(r.avgCost, 6), unreal: rnd(r.unreal), d7: rnd(r.d7), d30: rnd(r.d30), dRally: rnd(r.dRally),
    first: r.first, firstPrice: rnd(r.firstPrice, 6), firstBuyUsd: rnd(r.firstBuyUsd), soldHigh: rnd(r.soldHigh),
    peakBal: rnd(r.peakBal), earlyBought: rnd(r.earlyBought), rallyBought: rnd(r.rallyBought), thenNow: rnd(thenNow(r), 2),
    rMktNet: rnd(r.rMktNet), rMktBuy: rnd(r.rMktBuy), rCtrWd: rnd(r.rCtrWd), rWalIn: rnd(r.rWalIn),
    contract: contractCache[r.a] === true, // this "wallet" is actually a smart contract (router/MM/vault/Safe) — not a person
    ctrKind: ctrLabels[r.a]?.kind || null, ctrLabel: ctrLabels[r.a]?.label || null,
    seeder: r.seeder, ethFunder: fundOf(r.a), ethLabel: fundLabel(r.a), soldOut: r.soldOut, reentered: r.reentered });

  // ★ CYCLE: bought EARLY, sold into the TOP for real money, BUYING the rally again
  const cycle = rows.filter((r) => r.firstTs && r.firstTs < EARLY && r.soldHigh >= MIN_TOP && r.dRally > 0)
    .sort((a, b) => b.soldHigh - a.soldHigh).map(trim);
  // FRESH: first-ever pepecoin in the rally window, bought big, still holding (sold <25% of what they bought)
  const fresh = rows.filter((r) => r.firstTs >= cFresh && r.firstBuyUsd >= MIN_FRESH && r.soldFrac < 0.25 && r.bal * spot >= MIN_FRESH)
    .sort((a, b) => b.firstBuyUsd - a.firstBuyUsd).map(trim);
  // COHORT: proven realized winners (5x or big profit) with real capital
  const cohort = rows.filter((r) => r.invested >= MIN_INVEST && (r.roi >= MIN_ROI || r.realized >= MIN_PROFIT))
    .sort((a, b) => b.realized - a.realized).map(trim);
  // RE-ENTRANTS: sold out AND buying again in the last 30d, prior realized above the dust floor
  const reentrants = rows.filter((r) => r.soldOut && r.d30 > 0 && r.realized >= MIN_REENTRY)
    .sort((a, b) => b.realized - a.realized).map(trim);
  // WHO'S BUYING (7d): net buyers, tagged
  const smartSet = new Set(cohort.filter((r) => r.roi >= MIN_ROI).map((r) => r.a));
  const buysRecent = rows.filter((r) => r.d7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 40).map((r) => ({
    ...trim(r), tag: smartSet.has(r.a) ? "smart" : r.reentered ? "returning" : (r.firstTs >= c30) ? "new" : "adding",
  }));

  // ---- surfaced set + token-flow clustering ----
  // GUARDS (SPX "supernode" lesson): a seeder/hub that touches MANY surfaced wallets is an untagged
  // distributor/router, NOT a personal funder — clustering on it fuses the whole graph into one blob.
  // So we only link on a SHARED SEEDER that seeded a SMALL handful (2..MAX_SEED), and we drop DIRECT
  // links that route through a high-degree hub. Over-merging overstates coordination — every rule errs shy.
  const MAX_SEED = Number(args.max_seed ?? 6); // a seeder feeding more than this many surfaced wallets = distributor
  const HUB = Number(args.hub ?? 8);           // a wallet transacting with more than this many members = hub
  const surfaced = [...cycle, ...fresh, ...cohort.slice(0, 80), ...reentrants.slice(0, 80), ...buysRecent];
  const members = new Set(surfaced.map((r) => r.a));

  // union-find
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const uni = (a, b) => { parent.set(find(a), find(b)); };
  for (const a of members) parent.set(a, a);

  // (a) shared SEEDER: one non-excluded address sent the first coins to a SMALL group (2..MAX_SEED) of surfaced wallets
  const bySeeder = new Map();
  for (const a of members) { const s = byAddr.get(a)?.seeder; if (s && !ex(s)) { let l = bySeeder.get(s); if (!l) bySeeder.set(s, l = []); l.push(a); } }
  const distributors = new Set(); // seeders too broad to be personal — recorded, not fused
  const seedGroups = [];
  for (const [s, list] of bySeeder) {
    if (list.length < 2) continue;
    if (list.length > MAX_SEED) { distributors.add(s); continue; }
    seedGroups.push({ seeder: s, members: list });
    for (let i = 1; i < list.length; i++) uni(list[0], list[i]);
  }

  // (b) DIRECT links: token transfers between two surfaced wallets — but count degree first and skip hubs
  const rawLinks = [];
  const deg = new Map();
  for (const t of tx) if (members.has(t.from) && members.has(t.to) && t.from !== t.to) {
    rawLinks.push([t.from, t.to, rnd(t.amt)]);
    deg.set(t.from, (deg.get(t.from) || 0) + 1); deg.set(t.to, (deg.get(t.to) || 0) + 1);
  }
  const links = [];
  for (const [f, t, amt] of rawLinks) {
    if ((deg.get(f) || 0) > HUB || (deg.get(t) || 0) > HUB) continue; // route through a hub — don't fuse
    uni(f, t); links.push([f, t, amt]);
  }

  // (c) shared ETH FUNDER: surfaced wallets whose FIRST ETH came from the SAME non-exchange address.
  // This is the strong coordination signal the token graph can't see (a Coinbase→fresh-wallet seed).
  // Exchange funders (Coinbase/Binance/…) are recorded per-wallet but NEVER fuse — millions share a hot wallet.
  const MAX_FUND = Number(args.max_fund ?? 8);
  const byFunder = new Map();
  for (const a of members) { const f = fundOf(a); if (f && !fundEx(a) && !ex(f)) { let l = byFunder.get(f); if (!l) byFunder.set(f, l = []); l.push(a); } }
  const funderGroups = [];
  for (const [f, list] of byFunder) {
    if (list.length < 2 || list.length > MAX_FUND) continue; // 2..MAX_FUND private-EOA-funded wallets → same hand
    funderGroups.push({ funder: f, members: list });
    for (let i = 1; i < list.length; i++) uni(list[0], list[i]);
  }

  // assemble clusters (≥2 members)
  const groups = new Map();
  for (const a of members) { const r = find(a); (groups.get(r) || groups.set(r, []).get(r)).push(a); }
  let clusters = [...groups.values()].filter((g) => g.length >= 2).map((g, i) => {
    const gs = new Set(g);
    const mem = g.map((a) => byAddr.get(a)).filter(Boolean);
    const seeders = seedGroups.filter((sg) => sg.members.some((m) => gs.has(m)));
    const funders = funderGroups.filter((fg) => fg.members.some((m) => gs.has(m)));
    return {
      id: i + 1, size: g.length, flagged: g.length > 25, // still-large groups are shown but not trusted
      realized: rnd(mem.reduce((s, r) => s + r.realized, 0)),
      soldHigh: rnd(mem.reduce((s, r) => s + r.soldHigh, 0)),
      dRally: rnd(mem.reduce((s, r) => s + r.dRally, 0)),
      bal: rnd(mem.reduce((s, r) => s + r.bal, 0)),
      earlyBought: rnd(mem.reduce((s, r) => s + r.earlyBought, 0)),
      rallyBought: rnd(mem.reduce((s, r) => s + r.rallyBought, 0)),
      rMktNet: rnd(mem.reduce((s, r) => s + r.rMktNet, 0)),
      rCtrWd: rnd(mem.reduce((s, r) => s + r.rCtrWd, 0)),
      seeders: [...new Set(seeders.map((sg) => sg.seeder))],
      ethFunders: [...new Set(funders.map((fg) => fg.funder))],
      members: g.map((a) => { const r = byAddr.get(a); return { a, realized: rnd(r.realized), soldHigh: rnd(r.soldHigh),
        dRally: rnd(r.dRally), bal: rnd(r.bal), earlyBought: rnd(r.earlyBought), rallyBought: rnd(r.rallyBought),
        rMktNet: rnd(r.rMktNet), rCtrWd: rnd(r.rCtrWd), contract: contractCache[a] === true,
        seeder: r.seeder, ethFunder: fundOf(a), ethLabel: fundLabel(a), first: r.first }; }),
      links: links.filter(([f, t]) => gs.has(f) && gs.has(t)),
    };
  }).sort((a, b) => (b.soldHigh + b.realized) - (a.soldHigh + a.realized));

  // ── "WHO MOVED THE RALLY": every wallet that net-BOUGHT on the DEX during the rally, ranked + categorised.
  //    The price-moving flow is the NET tokens the pool paid out (poolOut − poolIn). Buyers are classified so
  //    you can see it wasn't the insiders: contract (router/MM/arb/aggregator), returning (sold out then back),
  //    new wallet (first-ever in the rally), existing holder, insider (the cycle cohort). Every row is clickable.
  const cycleSet = new Set(cycle.map((r) => r.a));
  // the OPERATOR cohort = the early-sellers + every coordinated-cluster member (who the exit-watch tracks).
  const opCohort = new Set(cycleSet);
  for (const c of clusters) for (const m of c.members) opCohort.add(m.a);
  // ── BUY-THEN-ROUTE (operator-primed markup): a wallet that BOUGHT on the DEX in the rally and then FORWARDED
  //    tokens into the operator cohort is not genuine retail — it's plumbing that marks price up and feeds the
  //    staged bag. Measure it (rally-window sends into the cohort) so we can subtract it from the "retail" count.
  const sentToCohort = new Map(), sentTarget = new Map(); // total forwarded, and the cohort wallet it fed most
  for (const t of tx) { if (t.ts < RALLY) continue; if (opCohort.has(t.to) && !opCohort.has(t.from) && !ex(t.from)) {
    sentToCohort.set(t.from, (sentToCohort.get(t.from) || 0) + t.amt);
    const cur = sentTarget.get(t.from); if (!cur || t.amt > cur.amt) sentTarget.set(t.from, { to: t.to, amt: t.amt });
  } }
  const infraKind = (a) => { const k = ctrLabels[a]?.kind; return k === "router" || k === "mm" || k === "vault"; }; // labelled infra never counts as a sock-puppet
  const isPrimed = (r) => r.rMktBuy > 0 && (sentToCohort.get(r.a) || 0) > 0.25 * r.rMktBuy && !opCohort.has(r.a) && !infraKind(r.a);
  // a contract's label refines the category: a smart-account/Safe is a PERSON (fall through to person cats);
  // a router = aggregated retail; mm/arb = a bot; vault = a protocol; unknown = contract.
  const personCat = (r) => cycleSet.has(r.a) ? "insider" : isPrimed(r) ? "primed" : r.reentered ? "returning" : r.firstTs >= RALLY ? "new" : "existing";
  const catOf = (r) => {
    if (contractCache[r.a] === true) {
      const k = ctrLabels[r.a]?.kind;
      if (k === "account") return personCat(r);      // smart-account wallet = a person (or primed sock-puppet)
      if (k === "router") return "routed";           // aggregated retail through a DEX router
      if (k === "mm") return "mm";                    // market-maker / arb bot
      if (k === "vault") return "vault";              // a DeFi protocol
      return "contract";                             // unknown / unverified
    }
    return isCexAddr(r.a) ? "cex" : personCat(r);
  };
  const buyers = rows.filter((r) => r.rMktNet > 0).sort((a, b) => b.rMktNet - a.rMktNet)
    .map((r) => ({ a: r.a, net: rnd(r.rMktNet), buy: rnd(r.rMktBuy), usd: rnd(r.rMktNet * spot), cat: catOf(r),
      routed: rnd(sentToCohort.get(r.a) || 0), // tokens this buyer forwarded into the operator cohort
      contract: contractCache[r.a] === true, ctrKind: ctrLabels[r.a]?.kind || null, ctrLabel: ctrLabels[r.a]?.label || null,
      first: r.first, bag: rnd(r.bal) }));
  const totNet = buyers.reduce((s, b) => s + b.net, 0) || 1;
  const byCat = {};
  for (const b of buyers) { const c = byCat[b.cat] ??= { n: 0, net: 0 }; c.n++; c.net += b.net; }
  const rally = {
    from: iso(RALLY), poolOutNet: rnd(poolOut - poolIn), poolOut: rnd(poolOut), poolIn: rnd(poolIn),
    poolOutUsd: rnd((poolOut - poolIn) * spot), buyers: buyers.length, totNet: rnd(totNet), totUsd: rnd(totNet * spot),
    top1Pct: rnd(100 * (buyers[0]?.net || 0) / totNet), top10Pct: rnd(100 * buyers.slice(0, 10).reduce((s, b) => s + b.net, 0) / totNet),
    byCat: Object.entries(byCat).sort((a, b) => b[1].net - a[1].net).map(([cat, v]) => ({ cat, n: v.n, net: rnd(v.net), usd: rnd(v.net * spot), pct: rnd(100 * v.net / totNet) })),
    // operator-adjacent = insiders themselves + buy-then-route sock-puppets; genuine retail = everything else
    operatorNet: rnd(buyers.filter((b) => b.cat === "insider" || b.cat === "primed").reduce((s, b) => s + b.net, 0)),
    primed: buyers.filter((b) => b.cat === "primed").map((b) => ({ a: b.a, buy: b.buy, routed: b.routed, usd: rnd(b.buy * spot), first: b.first, to: sentTarget.get(b.a)?.to || null })),
    top: buyers.slice(0, 60),
  };
  rally.retailNet = rnd(totNet - rally.operatorNet);

  // second pass: buy/sell timeline for surfaced wallets + the top rally buyers (so every shown wallet is clickable)
  const keep = new Set([...members, ...rally.top.map((b) => b.a)]);
  const detail = {};
  for (const t of tx) {
    const price = priceAt(dayFloor(t.ts));
    if (keep.has(t.to)) { (detail[t.to] ??= { buys: [], sells: [] }).buys.push([iso(t.ts), rnd(price, 6), rnd(t.amt)]); }
    if (keep.has(t.from)) { (detail[t.from] ??= { buys: [], sells: [] }).sells.push([iso(t.ts), rnd(price, 6), rnd(t.amt)]); }
  }
  for (const k in detail) { detail[k].buys = detail[k].buys.slice(-200); detail[k].sells = detail[k].sells.slice(-200); }

  // compact daily price series for the drill-down chart (sampled, ~1 point/day)
  await writeFile("public/price-series.json", JSON.stringify({ updated: iso(nowTs), spot, series: priceRows.map(([d, p]) => [iso(d), rnd(p, 6)]) }));

  // funding summary: which exchanges seeded the fresh/cycle wallets, and how many are private-EOA-funded
  const fundedSet = [...members].filter((a) => fundOf(a));
  const exchangeCounts = {};
  for (const a of fundedSet) if (fundEx(a)) { const l = fundLabel(a) || "exchange"; exchangeCounts[l] = (exchangeCounts[l] || 0) + 1; }
  const fundingSummary = {
    covered: fundedSet.length, total: members.size, private: fundedSet.filter((a) => !fundEx(a)).length,
    exchanges: Object.entries(exchangeCounts).sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n })),
    sharedFunders: funderGroups.length,
  };

  const out = { updated: iso(nowTs), spot, minInvest: MIN_INVEST, minRoi: MIN_ROI, high: HIGH, minReentry: MIN_REENTRY,
    stats: { cohort: cohort.length, reentrants: reentrants.length, cycle: cycle.length, fresh: fresh.length,
      clusters: clusters.length,
      cycleSoldHigh: rnd(cycle.reduce((s, r) => s + r.soldHigh, 0)),
      cycleReinvest: rnd(cycle.reduce((s, r) => s + r.dRally, 0)),
      cycleEarlyBought: rnd(cycle.reduce((s, r) => s + r.earlyBought, 0)),
      cycleRallyBought: rnd(cycle.reduce((s, r) => s + r.rallyBought, 0)),
      cycleMktNet: rnd(cycle.reduce((s, r) => s + (r.rMktNet || 0), 0)),      // real net DEX buying by the cohort
      cycleCtrWd: rnd(cycle.reduce((s, r) => s + (r.rCtrWd || 0), 0)),        // tokens pulled from vaults (not buys)
      cycleWalIn: rnd(cycle.reduce((s, r) => s + (r.rWalIn || 0), 0)),        // wallet-to-wallet inflow
      freshUsd: rnd(fresh.reduce((s, r) => s + r.firstBuyUsd, 0)),
      reentrantRealized: rnd(reentrants.reduce((s, r) => s + r.realized, 0)),
      reentrantReinvest30d: rnd(reentrants.reduce((s, r) => s + r.d30, 0)) },
    funding: fundingSummary, rally,
    cycle: cycle.slice(0, 60), fresh: fresh.slice(0, 60), cohort: cohort.slice(0, 100), reentrants: reentrants.slice(0, 100),
    buysRecent, clusters: clusters.slice(0, 40), surfaced: [...members], detail };
  await writeFile("public/smart-money.json", JSON.stringify(out));

  console.log(`spot $${spot.toFixed(4)}  ·  high≥$${HIGH}  early<${iso(EARLY)}  rally≥${iso(RALLY)}`);
  console.log(`★ CYCLE (early → sold top ≥$${MIN_TOP/1e3}k → buying rally): ${cycle.length} · sold-high $${(out.stats.cycleSoldHigh/1e6).toFixed(2)}M · re-bought ${(out.stats.cycleReinvest/1e6).toFixed(2)}M tokens`);
  for (const r of cycle.slice(0, 12)) console.log(`  ${r.a}  sold-high $${(r.soldHigh/1e3).toFixed(0)}k  realized $${(r.realized/1e3).toFixed(0)}k  first ${r.first} @$${r.firstPrice}  now +${(r.dRally/1e3).toFixed(0)}k  bag ${(r.bal/1e3).toFixed(0)}k`);
  console.log(`FRESH (new in ${FRESH_DAYS}d, bought ≥$${MIN_FRESH/1e3}k, holding): ${fresh.length} · total bought $${(out.stats.freshUsd/1e3).toFixed(0)}k`);
  for (const r of fresh.slice(0, 12)) console.log(`  ${r.a}  first ${r.first} @$${r.firstPrice}  bought $${(r.firstBuyUsd/1e3).toFixed(0)}k  bag ${(r.bal/1e3).toFixed(0)}k  seeder ${r.seeder || "—"}`);
  console.log(`CLUSTERS (surfaced wallets related by token flow): ${clusters.length}`);
  for (const c of clusters.slice(0, 8)) console.log(`  #${c.id} ${c.size} wallets · sold-high $${(c.soldHigh/1e3).toFixed(0)}k · rally +${(c.dRally/1e3).toFixed(0)}k · seeders ${c.seeders.length}`);
  console.log(`cohort ${cohort.length} · reentrants ${reentrants.length}`);
  console.log(`WHO MOVED THE RALLY: net pool outflow ${(rally.poolOutNet/1e3).toFixed(0)}k (~$${(rally.poolOutUsd/1e3).toFixed(0)}k) · ${rally.buyers} net buyers · top10 ${rally.top10Pct}%`);
  for (const c of rally.byCat) console.log(`  ${c.cat.padEnd(10)} ${c.n} wallets · ~$${(c.usd/1e3).toFixed(0)}k · ${c.pct}%`);
}
main();
