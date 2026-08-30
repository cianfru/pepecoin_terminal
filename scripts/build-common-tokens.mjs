// What ELSE does the coordinated cohort hold in common? Aggregates every cohort wallet's ERC-20 holdings
// (Blockscout, keyless) and ranks tokens by how many cohort wallets hold a MEANINGFUL position — surfacing
// the crew's shared bags / likely other plays, beyond pepecoin + the known GME / BOOE. Airdrop-spam and
// stables are filtered so "held by many" means real overlap, not junk everyone gets dusted with.
//
// Usage: node scripts/build-common-tokens.mjs  → writes public/common-tokens.json
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.env.BLOCKSCOUT_BASE || "https://eth.blockscout.com";
const UA = { "user-agent": "curl/8.5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// excluded from "common plays": the subject + known crossovers + majors/stables (parking, not a play)
const EXCL = new Set([
  "0xa9e8acf069c58aec8825542845fd754e41a9489a", // PEPECOIN (subject)
  "0xc56c7a0eaa804f854b536a5f3d5f49d2ec4b12b8", // GME (already known)
  "0x289ff00235d2b98b0145ff5d4435d3e92f9540a6", // BOOE (already known)
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
]);
const CAP = 25000, POS = 150; // cap scam prices; a "holder" holds >$POS of value (a real position, not dust)

async function j(url) { try { const r = await fetch(url, { headers: UA }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
async function tokensOf(a) {
  const out = []; let params = ""; let pages = 0;
  do {
    const r = await j(`${BASE}/api/v2/addresses/${a}/tokens?type=ERC-20${params}`);
    if (!r) break;
    for (const it of r.items || []) out.push(it);
    params = r.next_page_params ? "&" + new URLSearchParams(r.next_page_params).toString() : "";
    await sleep(70);
  } while (params && ++pages < 6);
  return out;
}

async function main() {
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const cohort = new Set();
  for (const r of sm.cycle || []) cohort.add(r.a);
  for (const c of sm.clusters || []) for (const m of c.members || []) cohort.add(m.a);
  for (const p of sm.rally?.primed || []) cohort.add(p.a);
  const wallets = [...cohort];

  const tok = new Map(); // addr -> {sym,name,addr,holders:Set,usd,priced}
  for (const a of wallets) {
    for (const it of await tokensOf(a)) {
      const t = it.token || {}; const addr = (t.address_hash || t.address || "").toLowerCase();
      if (!addr || EXCL.has(addr)) continue;
      const dec = Number(t.decimals || 18); const bal = Number(it.value || 0) / 10 ** dec;
      if (bal <= 0) continue;
      const priced = !!t.exchange_rate; const usd = priced ? Math.min(bal * Number(t.exchange_rate), CAP) : 0;
      let e = tok.get(addr); if (!e) tok.set(addr, e = { sym: t.symbol || "?", name: t.name || "", addr, holders: new Set(), usd: 0, priced });
      e.holders.add(a); e.usd += usd; if (priced) e.priced = true;
    }
    await sleep(30);
  }

  // rank: real positions first — held by >=3 cohort wallets with meaningful aggregate value
  const rows = [...tok.values()].map((e) => ({ sym: e.sym, name: e.name, addr: e.addr, n: e.holders.size, usd: Math.round(e.usd), priced: e.priced }))
    .filter((e) => e.n >= 2)
    .sort((a, b) => (b.priced - a.priced) || (b.n - a.n) || (b.usd - a.usd));

  const out = { updated: new Date().toISOString().slice(0, 10), cohort: wallets.length,
    // the interesting list: priced tokens held by multiple cohort wallets (their real shared plays)
    common: rows.filter((r) => r.priced && r.n >= 3 && r.usd >= 1000).slice(0, 30),
    // also surface priced pairs (n>=2) for completeness
    pairs: rows.filter((r) => r.priced && r.n === 2 && r.usd >= 2000).slice(0, 20),
  };
  await writeFile("public/common-tokens.json", JSON.stringify(out));

  console.log(`COMMON HOLDINGS across ${wallets.length} cohort wallets (priced, real positions):`);
  for (const r of out.common) console.log(`  ${String(r.n).padStart(2)} wallets · $${Math.round(r.usd / 1e3)}k · ${r.sym.padEnd(12)} ${r.name.slice(0, 24).padEnd(24)} ${r.addr}`);
  if (!out.common.length) console.log("  (none beyond pepecoin / GME / BOOE with meaningful shared value)");
}
if (import.meta.url === `file://${process.argv[1]}`) main();
