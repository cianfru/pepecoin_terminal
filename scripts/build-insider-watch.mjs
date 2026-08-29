// Insider / operator EXIT WATCH — the forward tripwire. The cohort of early-sellers + their coordinated
// clusters has staged a large, consolidated bag (pulled out of the bcred vault + gathered from a web of
// related wallets) WITHOUT selling. Whether that's a conviction hold or a loaded gun can only be answered
// by watching what they do NEXT — so this tracks their outflows day by day and flags the moment they start
// moving tokens toward exchanges (the distribution tell) or into freshly-prepped wallets.
//
// Reads the cohort from smart-money.json (cycle ∪ cluster members), streams the transfer archive, and emits
// public/insider-watch.json: a daily flow series (bought / sold / to-exchange / to-fresh / net), per-wallet
// window totals (each clickable + checkable), a plain status, and a tripwire. All reconstructed locally, $0.
//
// Usage: node scripts/build-insider-watch.mjs --transfers=transfers.csv --prices=prices.csv [--days=45]
import fs from "node:fs";
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const DAY = 86400000;
const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
const dayFloor = (ts) => Math.floor(ts / DAY) * DAY;

async function priceAtFn(path) {
  const rows = (await readFile(path, "utf8")).trim().split(/\r?\n/).slice(1).map((l) => l.split(","))
    .map((c) => [dayFloor(Date.parse(c[0])), Number(c[1])]).filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  return { spot: rows[rows.length - 1][1] };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const DAYS = Number(args.days ?? 45);
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const bag = new Map(), firstOf = new Map();
  const cohort = new Set();
  const add = (r) => { if (!r) return; cohort.add(r.a); if (r.bal != null) bag.set(r.a, r.bal); if (r.first) firstOf.set(r.a, r.first); };
  for (const r of sm.cycle || []) add(r);
  for (const c of sm.clusters || []) for (const m of c.members || []) add(m);
  let ctypes = {}; try { ctypes = JSON.parse(await readFile("public/contract-types.json", "utf8")).addrs || {}; } catch { /* */ }

  const { spot } = await priceAtFn(args.prices || "prices.csv");
  const kind = (a) => EXCLUDE_LABELS[a]?.kind || null;
  const isDex = (a) => { const k = kind(a); return k === "lp" || k === "mm"; };
  const isCex = (a) => kind(a) === "cex";
  const isVault = (a) => kind(a) === "defi";
  const infra = (a) => ["lp", "mm", "cex", "defi", "burn", "null", "bridge"].includes(kind(a));

  // pass 1: first-seen (to detect "to a freshly-created wallet")
  const firstSeen = new Map();
  { const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") }); let h = true;
    for await (const l of rl) { if (h) { h = false; continue; } if (!l.trim()) continue; const c = l.split(","); const to = c[1].toLowerCase(); const ts = Date.parse(c[2]); if (!firstSeen.has(to) || ts < firstSeen.get(to)) firstSeen.set(to, ts); } }

  // pass 2: window flows
  let now = 0;
  { const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") }); let h = true;
    for await (const l of rl) { if (h) { h = false; continue; } if (!l.trim()) continue; const ts = Date.parse(l.split(",")[2]); if (ts > now) now = ts; } }
  const start = now - DAYS * DAY;

  const days = new Map(); // dayISO -> {bought,soldPool,toCex,toFresh,fromVault,net}
  const dget = (d) => { let x = days.get(d); if (!x) days.set(d, x = { d, bought: 0, soldPool: 0, toCex: 0, toFresh: 0, fromVault: 0, net: 0 }); return x; };
  const W = new Map(); // per cohort wallet window totals
  const wget = (a) => { let x = W.get(a); if (!x) W.set(a, x = { a, bought: 0, soldPool: 0, toCex: 0, toFresh: 0, fromVault: 0, recv: 0, sent: 0 }); return x; };

  { const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") }); let h = true;
    for await (const l of rl) { if (h) { h = false; continue; } if (!l.trim()) continue;
      const c = l.split(","); const from = c[0].toLowerCase(), to = c[1].toLowerCase(); const ts = Date.parse(c[2]); if (ts < start) continue; const amt = Number(c[3]) / 1e18;
      const d = iso(ts);
      if (cohort.has(to) && !cohort.has(from)) { const D = dget(d), w = wget(to); w.recv += amt; D.net += amt;
        if (isDex(from)) { D.bought += amt; w.bought += amt; } else if (isVault(from)) { D.fromVault += amt; w.fromVault += amt; } }
      if (cohort.has(from) && !cohort.has(to)) { const D = dget(d), w = wget(from); w.sent += amt; D.net -= amt;
        if (isDex(to)) { D.soldPool += amt; w.soldPool += amt; }
        else if (isCex(to)) { D.toCex += amt; w.toCex += amt; }
        else if (!infra(to) && !ctypes[to] && (firstSeen.get(to) || 0) >= start) { D.toFresh += amt; w.toFresh += amt; } }
    } }

  const rnd = (x, n = 0) => +(x || 0).toFixed(n);
  const daily = [...days.values()].sort((a, b) => a.d.localeCompare(b.d)).map((x) => ({ d: x.d, bought: rnd(x.bought), soldPool: rnd(x.soldPool), toCex: rnd(x.toCex), toFresh: rnd(x.toFresh), net: rnd(x.net) }));
  const sum = (f) => rnd([...W.values()].reduce((s, w) => s + f(w), 0));
  const totals = { bought: sum((w) => w.bought), soldPool: sum((w) => w.soldPool), toCex: sum((w) => w.toCex), toFresh: sum((w) => w.toFresh), fromVault: sum((w) => w.fromVault), net: sum((w) => w.recv - w.sent) };
  const recent = (f) => rnd(daily.slice(-7).reduce((s, x) => s + f(x), 0)); // last 7 days
  const distRecent = recent((x) => x.toCex) + recent((x) => x.soldPool);

  // plain status — the numbers lead; this is a label, not a verdict.
  // DISTRIBUTION means the bag is LEAVING (to a CEX, or net holdings shrinking) — not two-way DEX churn while
  // the position grows. So a CEX outflow, or a net-negative window with real selling, is the only "distributing".
  const held = [...bag.values()].reduce((s, b) => s + b, 0) || 1;
  const cexRecent = recent((x) => x.toCex);
  let status = "quiet", why = "little net cohort movement in the window";
  if (totals.toCex > 0.01 * held || cexRecent > 0.003 * held) { status = "distributing"; why = "moving tokens to exchanges — the classic offload path"; }
  else if (totals.net < -0.03 * held && totals.soldPool > 0.03 * held) { status = "distributing"; why = "net position shrinking while selling on the DEX"; }
  else if (totals.net > 0.05 * held && totals.bought < 0.5 * totals.net) { status = "staging"; why = "bag GROWING by consolidation (vault + wallet inflows), NOT market buys, and barely selling — staged, not yet fired"; }
  else if (totals.bought > 0.05 * held) { status = "accumulating"; why = "net buying on the open market"; }

  const wallets = [...W.values()].map((w) => ({ a: w.a, net: rnd(w.recv - w.sent), bought: rnd(w.bought), soldPool: rnd(w.soldPool), toCex: rnd(w.toCex), toFresh: rnd(w.toFresh), bag: rnd(bag.get(w.a) || 0), first: firstOf.get(w.a) || null }))
    .sort((a, b) => (b.toCex + b.soldPool) - (a.toCex + a.soldPool) || b.net - a.net);

  const out = { updated: iso(now), from: iso(start), days: DAYS, spot, cohortSize: cohort.size,
    status, why, held: rnd(held),
    tripwire: { toCexRecent7d: recent((x) => x.toCex), soldRecent7d: recent((x) => x.soldPool), distRecent7d: rnd(distRecent), armed: cexRecent > 0 || (totals.net < -0.02 * held) },
    totals, daily, wallets };
  await writeFile("public/insider-watch.json", JSON.stringify(out));

  const k = (x) => Math.round(x / 1e3) + "k", $ = (x) => "$" + Math.round(x * spot / 1e3) + "k";
  console.log(`INSIDER EXIT WATCH — ${cohort.size} wallets, last ${DAYS}d → STATUS: ${status.toUpperCase()}`);
  console.log(`  ${why}`);
  console.log(`  bought ${k(totals.bought)} ${$(totals.bought)} · sold-DEX ${k(totals.soldPool)} ${$(totals.soldPool)} · to-CEX ${k(totals.toCex)} ${$(totals.toCex)} · to-fresh ${k(totals.toFresh)} ${$(totals.toFresh)} · net ${k(totals.net)} ${$(totals.net)}`);
  console.log(`  tripwire (last 7d): to-CEX ${k(out.tripwire.toCexRecent7d)} · sold ${k(out.tripwire.soldRecent7d)} · ARMED: ${out.tripwire.armed}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
