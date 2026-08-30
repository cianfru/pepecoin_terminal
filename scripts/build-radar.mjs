// "Under the radar" — the small, obscure tokens the coordinated cohort is quietly accumulating. Unlike the
// shared-bags list (dominated by known large caps + narrative tokens), this keeps ONLY low-cap / low-holder
// tokens that MULTIPLE cohort wallets hold, then checks recency (are they buying it NOW). The signal: a tiny
// token where several of this crew's wallets have real, recent positions = a setup before it's visible.
// Keyless: holdings + token stats + recency all from Blockscout.
//
// Usage: node scripts/build-radar.mjs  → writes public/radar.json
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.env.BLOCKSCOUT_BASE || "https://eth.blockscout.com";
const UA = { "user-agent": "curl/8.5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

// excluded: the subject + known narrative crossovers + majors/stables (all "on the radar" already)
const EXCL = new Set([
  "0xa9e8acf069c58aec8825542845fd754e41a9489a", // PEPECOIN
  "0xc56c7a0eaa804f854b536a5f3d5f49d2ec4b12b8", // GME
  "0x289ff00235d2b98b0145ff5d4435d3e92f9540a6", // BOOE
  "0x44971abf0251958492fee97da3e5c5ada88b9185", // BASEDAI (owner: part of the pepecoin narrative, not a new signal)
  "0x6982508145454ce325ddbe47a25d4ec3d2311933", // PEPE (the 2023 meme — well known)
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7", "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
]);
// "under the radar" = small: few holders AND low market cap
const MAX_HOLDERS = 20000, MAX_MCAP = 15_000_000, MIN_COHORT = 3, POS = 150, RECENT_DAYS = 120;

async function j(url) { try { const r = await fetch(url, { headers: UA }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
async function tokensOf(a) {
  const out = []; let p = "", pages = 0;
  do { const r = await j(`${BASE}/api/v2/addresses/${a}/tokens?type=ERC-20${p}`); if (!r) break;
    for (const it of r.items || []) out.push(it);
    p = r.next_page_params ? "&" + new URLSearchParams(r.next_page_params).toString() : ""; await sleep(70);
  } while (p && ++pages < 6);
  return out;
}
async function tokenMeta(addr) {
  const t = await j(`${BASE}/api/v2/tokens/${addr}`); if (!t) return null;
  const dec = Number(t.decimals || 18); const rate = Number(t.exchange_rate || 0);
  const mcap = t.circulating_market_cap ? Number(t.circulating_market_cap) : (rate && t.total_supply ? rate * Number(t.total_supply) / 10 ** dec : null);
  return { holders: Number(t.holders_count || t.holders || 0), mcap, sym: t.symbol, name: t.name, rate };
}
// most recent inbound (buy/acquire) of `token` across a few holder wallets
async function recency(token, holders) {
  let newest = 0;
  for (const a of holders.slice(0, 3)) {
    const r = await j(`${BASE}/api/v2/addresses/${a}/token-transfers?token=${token}&type=ERC-20`);
    for (const t of r?.items || []) { if ((t.to?.hash || "").toLowerCase() === a) { const ts = Date.parse(t.timestamp); if (ts > newest) newest = ts; break; } }
    await sleep(60);
  }
  return newest;
}

async function main() {
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const cohort = new Set();
  for (const r of sm.cycle || []) cohort.add(r.a);
  for (const c of sm.clusters || []) for (const m of c.members || []) cohort.add(m.a);
  for (const p of sm.rally?.primed || []) cohort.add(p.a);
  const wallets = [...cohort];

  // aggregate holdings, keeping the holder wallet list per token
  const tok = new Map();
  for (const a of wallets) {
    for (const it of await tokensOf(a)) {
      const t = it.token || {}; const addr = (t.address_hash || t.address || "").toLowerCase();
      if (!addr || EXCL.has(addr) || !t.exchange_rate) continue;
      const dec = Number(t.decimals || 18); const usd = Number(it.value || 0) / 10 ** dec * Number(t.exchange_rate);
      if (usd < POS) continue;
      const sym = t.symbol || "?", nm = t.name || "";
      if (/^(usd|eur|dai|gbp)|usd$|eur$|stable|real usd|euro/i.test(sym) || /stablecoin|real usd|pegged/i.test(nm)) continue; // stablecoins aren't a "play"
      let e = tok.get(addr); if (!e) tok.set(addr, e = { sym, name: nm, addr, holders: [], usd: 0 });
      e.holders.push(a); e.usd += Math.min(usd, 25000);
    }
    await sleep(25);
  }

  const candidates = [...tok.values()].filter((e) => e.holders.length >= MIN_COHORT);
  const radar = [];
  for (const e of candidates) {
    const meta = await tokenMeta(e.addr); await sleep(60);
    if (!meta) continue;
    const small = (meta.holders && meta.holders <= MAX_HOLDERS) && (meta.mcap == null || meta.mcap <= MAX_MCAP);
    if (!small) continue;
    const newest = await recency(e.addr, e.holders);
    const daysAgo = newest ? Math.round((Date.now() - newest) / DAY) : null;
    radar.push({ sym: e.sym, name: e.name, addr: e.addr, n: e.holders.length, usd: Math.round(e.usd),
      totalHolders: meta.holders || null, mcap: meta.mcap ? Math.round(meta.mcap) : null,
      lastBuy: newest ? new Date(newest).toISOString().slice(0, 10) : null, daysAgo, recent: daysAgo != null && daysAgo <= RECENT_DAYS });
  }
  // rank: actively-bought first, then a signal score that rewards cohort presence AND smallness (a tiny token
  // with several of the crew in it is the real under-the-radar tell, more than a 4-holder mid-cap).
  const score = (r) => r.n / Math.log10((r.totalHolders || 1000) + 10);
  radar.sort((a, b) => (b.recent - a.recent) || (score(b) - score(a)));

  const out = { updated: new Date().toISOString().slice(0, 10), cohort: wallets.length,
    thresholds: { maxHolders: MAX_HOLDERS, maxMcap: MAX_MCAP, minCohort: MIN_COHORT }, radar: radar.slice(0, 24) };
  await writeFile("public/radar.json", JSON.stringify(out));

  console.log(`UNDER-THE-RADAR — small tokens (≤${MAX_HOLDERS} holders, ≤$${MAX_MCAP / 1e6}M mcap) held by ≥${MIN_COHORT} of ${wallets.length} cohort wallets:`);
  if (!radar.length) console.log("  (none — the cohort's shared bags are all large-cap / known)");
  for (const r of radar.slice(0, 20)) console.log(`  ${String(r.n).padStart(2)} wallets · $${Math.round(r.usd / 1e3)}k · ${(r.sym || "?").padEnd(12)} mcap ${r.mcap ? "$" + Math.round(r.mcap / 1e3) + "k" : "?"} · ${r.totalHolders || "?"} holders · last buy ${r.lastBuy || "?"}${r.recent ? " ⟵ RECENT" : ""}  ${r.addr}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
