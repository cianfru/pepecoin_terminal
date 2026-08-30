// Multisig hub map — the spine of the operation, drawn as a small, checkable graph.
//
// The operator cohort's biggest top-seller is a Gnosis Safe multisig (0x2f8742…) that routes its pepecoin
// into a handful of private wallets — chief among them 0x7d544a853d, which is ALSO the #1 wallet feeding the
// current staged bag. This builder centers on that Safe, pulls its DIRECT counterparties (who it received
// from, who it sent to), then does ONE more hop from the primary recipient so the onward flow is visible.
// Every node is enriched with live capital (ETH + ERC-20 holdings, same shape as wallet-capital.json) so the
// site can show a Zerion-style preview card on hover. Small graph, full visibility, every address checkable.
//
// Token flows are reconstructed locally from transfers.csv (exact); capital is read from Blockscout (keyless).
// Usage: node scripts/build-hub.mjs [--transfers=transfers.csv] [--prices=prices.csv]  → writes public/hub.json
import fs from "node:fs";
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { walletCapital } from "./build-wallet-capital.mjs";
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const HUB = "0x2f8742738e55b7e15d8c1aa213af1ff9289c7c6b";     // the Gnosis Safe multisig (top top-seller)
const FEEDER = "0x7d544a853dbcd39a53315e7002f4951a6d2f080d";  // its primary recipient = #1 staging feeder
const MAX_ONWARD = 12; // cap the feeder's onward recipients so the map stays legible

const iso = (ts) => new Date(ts).toISOString().slice(0, 10);

async function spotOf(path) {
  const rows = (await readFile(path, "utf8")).trim().split(/\r?\n/).slice(1).map((l) => l.split(","))
    .map((c) => [Date.parse(c[0]), Number(c[1])]).filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  return rows.length ? rows[rows.length - 1][1] : 0;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const spot = await spotOf(args.prices || "prices.csv");

  // one streaming pass: capture every edge touching HUB or FEEDER + each involved wallet's net pepecoin balance
  const edges = new Map(); // "from>to" -> {from,to,amt,n,first,last}
  const bal = new Map();    // wallet -> net pepecoin held (received − sent)
  const ekey = (f, t) => f + ">" + t;
  const touch = (f, t, amt, ts) => {
    const k = ekey(f, t); let e = edges.get(k);
    if (!e) edges.set(k, e = { from: f, to: t, amt: 0, n: 0, first: ts, last: ts });
    e.amt += amt; e.n++; if (ts < e.first) e.first = ts; if (ts > e.last) e.last = ts;
  };
  const rl = readline.createInterface({ input: fs.createReadStream(args.transfers || "transfers.csv") });
  let h = true;
  for await (const l of rl) {
    if (h) { h = false; continue; }
    if (!l.trim()) continue;
    const c = l.split(","); const from = c[0].toLowerCase(), to = c[1].toLowerCase();
    const ts = Date.parse(c[2]); if (!Number.isFinite(ts)) continue; const amt = Number(c[3]) / 1e18;
    if (from === HUB || to === HUB || from === FEEDER || to === FEEDER) {
      touch(from, to, amt, ts);
      bal.set(from, (bal.get(from) || 0) - amt); bal.set(to, (bal.get(to) || 0) + amt);
    }
  }

  // pick the node set: HUB, FEEDER, every direct counterparty of HUB, and the FEEDER's top onward recipients
  const nodeSet = new Set([HUB, FEEDER]);
  const keep = [];
  for (const e of edges.values()) {
    if (e.from === HUB || e.to === HUB) { keep.push(e); nodeSet.add(e.from); nodeSet.add(e.to); }
  }
  // feeder's onward flow (feeder → x), biggest first, capped
  const onward = [...edges.values()].filter((e) => e.from === FEEDER && e.to !== HUB).sort((a, b) => b.amt - a.amt).slice(0, MAX_ONWARD);
  for (const e of onward) { keep.push(e); nodeSet.add(e.to); }
  // feeder's inbound (x → feeder) other than HUB, capped smaller (context on who else funds it)
  const inFeeder = [...edges.values()].filter((e) => e.to === FEEDER && e.from !== HUB).sort((a, b) => b.amt - a.amt).slice(0, 6);
  for (const e of inFeeder) { keep.push(e); nodeSet.add(e.from); }

  const kind = (a) => EXCLUDE_LABELS[a]?.kind || null;
  const exName = (a) => EXCLUDE_LABELS[a]?.name || null;
  let ctypes = {}; try { ctypes = JSON.parse(await readFile("public/contract-types.json", "utf8")).addrs || {}; } catch { /* */ }
  let clabels = {}; try { clabels = JSON.parse(await readFile("public/contract-labels.json", "utf8")).addrs || {}; } catch { /* */ }
  // reuse any capital we already have so we only fetch the new hub nodes
  let capCache = {}; try { capCache = JSON.parse(await readFile("public/wallet-capital.json", "utf8")).wallets || {}; } catch { /* */ }

  const ZERO = "0x0000000000000000000000000000000000000000";
  const roleOf = (a) => a === HUB ? "hub" : a === FEEDER ? "feeder"
    : (edges.has(ekey(HUB, a)) ? "recipient" : edges.has(ekey(a, HUB)) ? "sender"
    : edges.has(ekey(FEEDER, a)) ? "onward" : "infeeder");

  const nodes = [];
  for (const a of nodeSet) {
    if (a === ZERO) continue;
    const cx = exName(a); // labelled infra (pool / CEX / burn) — don't hit Blockscout, just tag it
    let cap = capCache[a];
    if (!cap && !cx) { try { cap = await walletCapital(a); } catch { cap = null; } await new Promise((r) => setTimeout(r, 120)); }
    const b = bal.get(a) || 0;
    nodes.push({
      a, role: roleOf(a),
      infra: cx || null, infraKind: kind(a),
      isContract: ctypes[a] === true, ctrKind: clabels[a]?.kind || null, ctrLabel: clabels[a]?.label || null,
      bag: +Math.max(0, b).toFixed(0), bagUsd: +(Math.max(0, b) * spot).toFixed(0),
      eth: cap?.eth ?? null, ethUsd: cap?.ethUsd ?? null, capUsd: cap?.capUsd ?? null,
      holds: cap?.holds || {}, top: cap?.top || [], whale: cap?.whale || false,
    });
  }

  const outEdges = keep.map((e) => ({ from: e.from, to: e.to, amt: +e.amt.toFixed(0), usd: +(e.amt * spot).toFixed(0), n: e.n, first: iso(e.first), last: iso(e.last) }))
    .sort((a, b) => b.amt - a.amt);

  // headline totals for the hub itself
  const hubOut = outEdges.filter((e) => e.from === HUB).reduce((s, e) => s + e.amt, 0);
  const hubIn = outEdges.filter((e) => e.to === HUB).reduce((s, e) => s + e.amt, 0);

  const out = { updated: new Date().toISOString().slice(0, 10), spot, hub: HUB, feeder: FEEDER,
    hubLabel: (clabels[HUB]?.label || "Gnosis Safe multisig"),
    totals: { hubOut: +hubOut.toFixed(0), hubIn: +hubIn.toFixed(0), hubOutUsd: +(hubOut * spot).toFixed(0), hubInUsd: +(hubIn * spot).toFixed(0), nodes: nodes.length, edges: outEdges.length },
    nodes, edges: outEdges };
  await writeFile("public/hub.json", JSON.stringify(out));

  const k = (x) => (x / 1e6).toFixed(2) + "M";
  console.log(`HUB MAP — ${out.hubLabel} ${HUB}`);
  console.log(`  hub flows: in ${k(hubIn)} · out ${k(hubOut)} (~$${Math.round(hubOut * spot / 1e3)}k) · ${nodes.length} nodes · ${outEdges.length} edges`);
  console.log(`  top edges:`);
  for (const e of outEdges.slice(0, 10)) console.log(`    ${e.from.slice(0, 10)} → ${e.to.slice(0, 10)}  ${k(e.amt)}  $${Math.round(e.usd / 1e3)}k  (${e.n}tx, ${e.first}→${e.last})`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
