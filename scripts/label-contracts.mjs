// Label the contract addresses that show up as buyers/holders, so the "42% contract" bucket resolves into
// what it actually is: retail routed through a DEX router/aggregator, a person's smart-account wallet
// (Safe / EIP-7702), a market-maker/arb bot, or a DeFi vault. Distinguishing these changes the read of
// "who moved the rally" — a UniversalRouter "buyer" is aggregated RETAIL, a Safe is a PERSON, an arb bot is not.
//
// Source: Blockscout /api/v2/addresses/{addr} — FREE, NO KEY — gives the verified contract `name`, `proxy_type`
// (eip7702 = a delegated EOA = a person), and implementation names. Combined with a keyword classifier and a
// light behavioural fallback (counterparties + net holding from our own transfers). Cached + incremental.
//
// Usage: node scripts/label-contracts.mjs [--transfers=transfers.csv] [--refresh] [--max=N]
import fs from "node:fs";
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const BASE = process.env.BLOCKSCOUT_BASE || "https://eth.blockscout.com";
const UA = { "user-agent": "curl/8.5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// classify from a Blockscout name / proxy / implementation names → {kind,label}
export function classify({ name, proxy, impls = [], defi = false, cp = 0, bag = 0 }) {
  const hay = [name || "", ...(impls || [])].join(" ");
  const has = (re) => re.test(hay);
  if (defi || has(/vault|lend|credit|stake|staking|deposit|bcred|comet|aave|morpho/i)) return { kind: "vault", label: name || "DeFi vault" };
  // a person's smart-contract wallet (Safe multisig, EIP-7702 delegated EOA, AA account)
  if (proxy === "eip7702" || has(/delegator|safe|gnosis|argent|kernel|biconomy|simpleaccount|lightaccount|smartaccount|\baccount\b|smart wallet/i))
    return { kind: "account", label: name || (proxy === "eip7702" ? "EIP-7702 smart account" : "smart-account wallet") };
  // DEX router / aggregator / settlement → the buyer behind it is retail, aggregated
  if (has(/router|spender|aggregat|universal|settle|exchangeproxy|paraswap|augustus|kyber|odos|1inch|0x|permit2|zap|swap|metamask|cow|okx dex/i))
    return { kind: "router", label: name || "DEX router" };
  if (has(/mev|arb|sandwich|\bbot\b/i)) return { kind: "mm", label: name || "MM / arb bot" };
  // behavioural fallback: passes tokens through to many counterparties and holds ~nothing → router-like;
  // touches few and holds a bag → an unknown holding contract
  if (cp >= 25 && bag < 5000) return { kind: "router", label: name || "pass-through contract" };
  return { kind: "contract", label: name || "unverified contract" };
}

async function meta(addr) {
  try {
    const r = await fetch(`${BASE}/api/v2/addresses/${addr}`, { headers: UA });
    if (!r.ok) return null;
    const j = await r.json();
    return { name: j.name || null, proxy: j.proxy_type || null, impls: (j.implementations || []).map((i) => i.name).filter(Boolean) };
  } catch { return null; }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  let ctypes = {}; try { ctypes = JSON.parse(await readFile("public/contract-types.json", "utf8")).addrs || {}; } catch { /* */ }

  // which contracts to label: any contract that shows up as a rally buyer, surfaced wallet, seeder or funder
  const want = new Set();
  for (const b of sm.rally?.top || []) if (b.contract || ctypes[b.a]) want.add(b.a);
  for (const list of [sm.cycle, sm.fresh, sm.cohort, sm.reentrants]) for (const r of list || []) {
    if (ctypes[r.a]) want.add(r.a);
    if (r.seeder && ctypes[r.seeder]) want.add(r.seeder);
    if (r.ethFunder && ctypes[r.ethFunder]) want.add(r.ethFunder);
  }

  // light behavioural signature (counterparties + net holding) from transfers, for the fallback + all labelled
  const cp = new Map(), net = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") });
  let hdr = true;
  for await (const line of rl) {
    if (hdr) { hdr = false; continue; }
    if (!line.trim()) continue;
    const c = line.split(","); const from = c[0].toLowerCase(), to = c[1].toLowerCase(); const amt = Number(c[3]) / 1e18;
    if (want.has(to)) { net.set(to, (net.get(to) || 0) + amt); let s = cp.get(to) || new Set(); s.add(from); cp.set(to, s); }
    if (want.has(from)) { net.set(from, (net.get(from) || 0) - amt); let s = cp.get(from) || new Set(); s.add(to); cp.set(from, s); }
  }

  let cache = { updated: null, addrs: {} };
  try { cache = JSON.parse(await readFile("public/contract-labels.json", "utf8")); cache.addrs ||= {}; } catch { /* first run */ }

  const todo = [...want].filter((a) => args.refresh || !cache.addrs[a]);
  const batch = todo.slice(0, Number(args.max ?? todo.length));
  console.log(`contracts to label: ${want.size} · cached ${want.size - todo.length} · querying ${batch.length}`);

  let since = 0;
  for (const a of batch) {
    const m = await meta(a);
    const defi = EXCLUDE_LABELS[a]?.kind === "defi";
    const sig = { ...(m || { name: null, proxy: null, impls: [] }), defi, cp: (cp.get(a) || new Set()).size, bag: Math.max(0, net.get(a) || 0) };
    cache.addrs[a] = { ...classify(sig), name: sig.name, cp: sig.cp };
    if (++since >= 15) { cache.updated = new Date().toISOString().slice(0, 10); await writeFile("public/contract-labels.json", JSON.stringify(cache)); since = 0; }
    await sleep(120);
  }
  cache.updated = new Date().toISOString().slice(0, 10);
  await writeFile("public/contract-labels.json", JSON.stringify(cache));

  const byKind = {};
  for (const a of want) { const k = cache.addrs[a]?.kind || "?"; byKind[k] = (byKind[k] || 0) + 1; }
  console.log("labelled by kind:", Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(" · "));
  // show the top rally-buyer contracts with their new labels
  console.log("top rally-buyer contracts:");
  for (const b of (sm.rally?.top || []).filter((x) => cache.addrs[x.a]).slice(0, 14))
    console.log(`  ${b.a.slice(0, 12)}  ~$${Math.round(b.usd / 1e3)}k  → ${cache.addrs[b.a].kind}: ${cache.addrs[b.a].label}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
