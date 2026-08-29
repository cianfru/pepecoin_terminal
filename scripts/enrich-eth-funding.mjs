// ETH-funding enrichment for the surfaced smart-money wallets. For each wallet, finds who sent it its
// FIRST ETH (its funder) — the signal the pepecoin token graph can't see (e.g. a Coinbase→fresh-wallet
// seed, or one private EOA quietly funding a fleet of wallets that then all buy this coin).
//
// Source: Blockscout's Etherscan-compatible API — FREE, NO KEY, no paid quota (same family the project
// already uses). Incremental + cached: a wallet's first funder is immutable, so we only query wallets
// not already in public/eth-funding.json. Steady-state that's a handful of new wallets per day.
//
// Usage: node scripts/enrich-eth-funding.mjs [--refresh] [--limit=N] [--max=N]
//   reads public/smart-money.json (its `surfaced` list) → writes/updates public/eth-funding.json
import { readFile, writeFile } from "node:fs/promises";
import { labelFunder, isExchange } from "./eth-labels.mjs";

const BASE = process.env.BLOCKSCOUT_BASE || "https://eth.blockscout.com";
const UA = { "user-agent": "curl/8.5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, tries = 3) {
  const url = `${BASE}/api?${new URLSearchParams(params)}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429 || r.status >= 500) { await sleep(600 * (i + 1)); continue; }
      const j = await r.json();
      if (j && (j.status === "1" || Array.isArray(j.result))) return Array.isArray(j.result) ? j.result : [];
      if (j && j.message === "No transactions found") return [];
      return []; // NOTOK / rate — treat as empty, retry the wallet next run
    } catch { await sleep(500 * (i + 1)); }
  }
  return null; // hard failure → leave uncached so a later run retries
}

// earliest INBOUND value-bearing transfer in a set of Etherscan-shaped rows → the funder
export function pickFunder(rows, addr) {
  const a = (addr || "").toLowerCase();
  let best = null;
  for (const t of rows || []) {
    if ((t.to || "").toLowerCase() !== a) continue;
    if (!t.value || t.value === "0") continue;
    const ts = Number(t.timeStamp) * 1000;
    if (!best || ts < best.ts) best = { funder: (t.from || "").toLowerCase(), wei: t.value, ts };
  }
  return best;
}

// earliest INBOUND value-bearing transfer (normal, then internal) → the funder
async function firstFunder(addr) {
  const normal = await api({ module: "account", action: "txlist", address: addr, sort: "asc", page: "1", offset: "10" });
  if (normal === null) return null;
  let best = pickFunder(normal, addr);
  // if the wallet was first funded via an internal tx (some exchanges/contracts), check those too
  const internal = await api({ module: "account", action: "txlistinternal", address: addr, sort: "asc", page: "1", offset: "10" });
  const bi = pickFunder(internal || [], addr);
  if (bi && (!best || bi.ts < best.ts)) best = bi;
  return best; // {funder,wei,ts} or null
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const surfaced = [...new Set((sm.surfaced || []).map((a) => a.toLowerCase()))];

  let cache = { updated: null, wallets: {} };
  try { cache = JSON.parse(await readFile("public/eth-funding.json", "utf8")); cache.wallets ||= {}; } catch { /* first run */ }

  const todo = surfaced.filter((a) => args.refresh || !cache.wallets[a]);
  const max = Number(args.max ?? args.limit ?? todo.length);
  const batch = todo.slice(0, max);
  console.log(`surfaced ${surfaced.length} · cached ${surfaced.length - todo.length} · querying ${batch.length}${batch.length < todo.length ? ` (of ${todo.length} missing)` : ""}`);

  let ok = 0, fail = 0;
  for (const a of batch) {
    const f = await firstFunder(a);
    if (f === null) { fail++; await sleep(250); continue; }
    if (!f) { cache.wallets[a] = { funder: null }; await sleep(120); continue; }
    const label = labelFunder(f.funder);
    cache.wallets[a] = { funder: f.funder, eth: +(Number(f.wei) / 1e18).toFixed(4), ts: new Date(f.ts).toISOString().slice(0, 10), label, exchange: isExchange(f.funder) };
    ok++;
    await sleep(120); // be polite to the free endpoint
  }

  cache.updated = new Date().toISOString().slice(0, 10);
  await writeFile("public/eth-funding.json", JSON.stringify(cache));
  console.log(`funded ${ok}, no-funder/failed ${fail}. cache now ${Object.keys(cache.wallets).length} wallets → public/eth-funding.json`);

  // quick report: shared private funders among the surfaced set
  const byFunder = new Map();
  for (const a of surfaced) { const w = cache.wallets[a]; if (w?.funder && !w.exchange) { const l = byFunder.get(w.funder) || []; l.push(a); byFunder.set(w.funder, l); } }
  const shared = [...byFunder.entries()].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length);
  console.log(`shared PRIVATE funders (coordination signal): ${shared.length}`);
  for (const [f, l] of shared.slice(0, 12)) console.log(`  ${f} funded ${l.length}: ${l.map((x) => x.slice(0, 10)).join(" ")}`);
  const exCount = {};
  for (const a of surfaced) { const w = cache.wallets[a]; if (w?.exchange) exCount[w.label] = (exCount[w.label] || 0) + 1; }
  console.log("exchange funders:", Object.entries(exCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "none");
}

// run only when invoked directly (not when imported by a test)
if (import.meta.url === `file://${process.argv[1]}`) main();
