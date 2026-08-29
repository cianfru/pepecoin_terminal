// Contract detector. The FIFO engine treats every non-excluded address as a person's wallet, but some
// are SMART CONTRACTS (lending/credit vaults like bcred, staking, custody). Receiving pepecoin from a
// contract is a WITHDRAWAL, not a market buy — counting it as a buy inflates "reaccumulation".
//
// This runs eth_getCode (a standard JSON-RPC call — FREE on public RPCs, no key) over the addresses that
// FEED the surfaced smart-money wallets (their inflow sources + seeders + ETH funders), and caches which
// are contracts in public/contract-types.json. Contract-ness is immutable, so it only queries new addresses.
//
// Usage: node scripts/detect-contracts.mjs [--transfers=transfers.csv] [--max=N] [--refresh]
import fs from "node:fs";
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { EXCLUDE } from "./build-onchain-local.mjs";

const RPCS = (process.env.ETH_RPC || "https://eth.drpc.org,https://rpc.mevblocker.io").split(",");
const UA = { "user-agent": "curl/8.5.0", "content-type": "application/json" };
const ZERO = "0x0000000000000000000000000000000000000000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// batched eth_getCode → map addr → isContract (code longer than "0x")
async function getCodeBatch(addrs) {
  const body = addrs.map((a, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getCode", params: [a, "latest"] }));
  for (let r = 0; r < RPCS.length * 2; r++) {
    const rpc = RPCS[r % RPCS.length];
    try {
      const res = await fetch(rpc, { method: "POST", headers: UA, body: JSON.stringify(body) });
      if (!res.ok) { await sleep(500); continue; }
      const j = await res.json();
      if (!Array.isArray(j)) { await sleep(500); continue; }
      const out = {};
      for (const item of j) { const a = addrs[item.id]; if (a != null && typeof item.result === "string") out[a] = item.result.length > 2; }
      if (Object.keys(out).length === addrs.length) return out;
      // partial — merge what we got, retry the rest
      const miss = addrs.filter((a, i) => out[a] === undefined);
      if (miss.length && miss.length < addrs.length) { const more = await getCodeBatch(miss); return { ...out, ...more }; }
      if (Object.keys(out).length) return out;
    } catch { await sleep(500); }
  }
  return null; // hard fail → leave uncached, retry next run
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const surfaced = new Set((sm.surfaced || []).map((a) => a.toLowerCase()));

  // candidate set: surfaced wallets + everything that FEEDS them (inflow sources) + seeders + ETH funders
  const cand = new Set(surfaced);
  for (const list of [sm.cycle, sm.fresh, sm.cohort, sm.reentrants, sm.buysRecent]) for (const r of list || []) { if (r.seeder) cand.add(r.seeder.toLowerCase()); if (r.ethFunder) cand.add(r.ethFunder.toLowerCase()); }
  const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") });
  let hdr = true;
  for await (const line of rl) {
    if (hdr) { hdr = false; continue; }
    if (!line.trim()) continue;
    const c = line.split(","); const from = c[0].toLowerCase(), to = c[1].toLowerCase();
    if (surfaced.has(to)) cand.add(from); // an inflow source into a surfaced wallet
  }
  for (const a of [...cand]) if (!a || a === ZERO || EXCLUDE.has(a)) cand.delete(a); // skip known infra + burn/mint

  let cache = { updated: null, addrs: {} };
  try { cache = JSON.parse(await readFile("public/contract-types.json", "utf8")); cache.addrs ||= {}; } catch { /* first run */ }

  const todo = [...cand].filter((a) => args.refresh || cache.addrs[a] === undefined);
  const max = Number(args.max ?? todo.length);
  const batch = todo.slice(0, max);
  console.log(`candidates ${cand.size} · cached ${cand.size - todo.length} · querying ${batch.length}`);

  let contracts = 0, fail = 0, since = 0;
  for (let i = 0; i < batch.length; i += 20) {
    const chunk = batch.slice(i, i + 20);
    const res = await getCodeBatch(chunk);
    if (!res) { fail += chunk.length; await sleep(400); continue; }
    for (const [a, isC] of Object.entries(res)) { cache.addrs[a] = isC; if (isC) contracts++; }
    // checkpoint every ~100 addresses so an interruption never loses progress (reruns resume from the cache)
    if ((since += chunk.length) >= 100) { cache.updated = new Date().toISOString().slice(0, 10); await writeFile("public/contract-types.json", JSON.stringify(cache)); since = 0; }
    await sleep(120);
  }
  cache.updated = new Date().toISOString().slice(0, 10);
  await writeFile("public/contract-types.json", JSON.stringify(cache));

  const known = Object.values(cache.addrs);
  console.log(`queried ${batch.length}: ${contracts} contracts this run, ${fail} failed. cache now ${known.length} addrs, ${known.filter(Boolean).length} contracts.`);
  // report newly-found contracts that FEED surfaced wallets (the ones that were being counted as buys)
  const feeders = [...cand].filter((a) => cache.addrs[a]);
  if (feeders.length) { console.log("contracts among surfaced-wallet inflow sources / seeders / funders:"); for (const a of feeders.slice(0, 20)) console.log("  " + a); }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
