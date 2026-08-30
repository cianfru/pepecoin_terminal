// Wallet capital + cross-token overlap for the operator cohort. For each cohort wallet, pulls its ETH
// balance and ERC-20 holdings from Blockscout (FREE, NO KEY) to show, at a glance, how much CAPITAL each
// wallet controls — and flags which wallets also hold the other tokens this crew is known to pump/dump
// (GME on Ethereum, BOOE / Book of Ethereum). Feeds the capital cards + the coordination map.
//
// Usage: node scripts/build-wallet-capital.mjs [--max=N]  → writes public/wallet-capital.json
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.env.BLOCKSCOUT_BASE || "https://eth.blockscout.com";
const UA = { "user-agent": "curl/8.5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tokens of interest (lowercased). PEPECOIN is the subject; GME + BOOE are the owner-flagged crossover plays.
const TOKENS = {
  pepe: "0xa9e8acf069c58aec8825542845fd754e41a9489a",
  gme: "0xc56c7a0eaa804f854b536a5f3d5f49d2ec4b12b8",   // GME (Ethereum)
  booe: "0x289ff00235d2b98b0145ff5d4435d3e92f9540a6",  // BOOE — Book of Ethereum
};
const NAMED = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [v, k]));
// blue-chip tokens counted at full value; every OTHER token is capped (Blockscout prices obscure/scam tokens
// with garbage exchange rates — one spoofed token was inflating a wallet's "capital" to hundreds of millions).
const MAJORS = new Set([
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
]);
const TRUSTED = new Set([...Object.values(TOKENS), ...MAJORS]);
const OTHER_CAP = 25000; // an obscure token showing more than this in a random wallet is almost always mispriced

async function j(url) { try { const r = await fetch(url, { headers: UA }); if (!r.ok) return null; return await r.json(); } catch { return null; } }

export async function walletCapital(a) {
  const meta = await j(`${BASE}/api/v2/addresses/${a}`);
  const eth = meta ? Number(meta.coin_balance || 0) / 1e18 : 0;
  const ethRate = meta ? Number(meta.exchange_rate || 0) : 0;
  const toks = await j(`${BASE}/api/v2/addresses/${a}/tokens?type=ERC-20`);
  let capUsd = eth * ethRate, nTokens = 0;
  const holds = {}; const top = [];
  for (const it of (toks?.items || [])) {
    const t = it.token || {}; const dec = Number(t.decimals || 18);
    const bal = Number(it.value || 0) / 10 ** dec;
    if (bal <= 0) continue;
    nTokens++;
    const addr = (t.address_hash || t.address || "").toLowerCase();
    const usd = t.exchange_rate ? bal * Number(t.exchange_rate) : 0;
    const counted = TRUSTED.has(addr) ? usd : Math.min(usd, OTHER_CAP); // cap untrusted token prices
    capUsd += counted;
    if (NAMED[addr]) holds[NAMED[addr]] = { bal: +bal.toFixed(2), usd: +usd.toFixed(0) };
    if (counted > 0) top.push({ sym: t.symbol || "?", usd: +counted.toFixed(0) });
  }
  top.sort((x, y) => y.usd - x.usd);
  return { eth: +eth.toFixed(3), ethUsd: +(eth * ethRate).toFixed(0), capUsd: +capUsd.toFixed(0), nTokens, holds, top: top.slice(0, 5) };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const set = new Set();
  for (const r of sm.cycle || []) set.add(r.a);
  for (const c of sm.clusters || []) for (const m of c.members || []) set.add(m.a);
  for (const p of sm.rally?.primed || []) set.add(p.a);
  const wallets = [...set].slice(0, Number(args.max ?? 200));

  const out = { updated: new Date().toISOString().slice(0, 10), tokens: TOKENS, wallets: {} };
  let done = 0;
  for (const a of wallets) {
    out.wallets[a] = await walletCapital(a);
    if (++done % 15 === 0) await writeFile("public/wallet-capital.json", JSON.stringify(out)); // checkpoint
    await sleep(120);
  }
  // flag likely whales/infra (dominated by blue-chips at a scale that says "not a pepecoin sock-puppet"),
  // and winsorize the headline total so two such wallets can't distort the cohort's on-chain capital.
  const WHALE = 3_000_000, CAP = 2_000_000;
  for (const w of Object.values(out.wallets)) w.whale = (w.capUsd || 0) > WHALE;
  const has = (k) => Object.values(out.wallets).filter((w) => w.holds?.[k]).length;
  out.overlap = { total: wallets.length, gme: has("gme"), booe: has("booe"), pepe: has("pepe"), whales: Object.values(out.wallets).filter((w) => w.whale).length };
  out.totalCapUsd = Object.values(out.wallets).reduce((s, w) => s + Math.min(w.capUsd || 0, CAP), 0);
  await writeFile("public/wallet-capital.json", JSON.stringify(out));

  console.log(`wallet capital: ${wallets.length} cohort wallets · total ~$${Math.round(out.totalCapUsd / 1e3)}k`);
  console.log(`cross-token overlap: GME ${out.overlap.gme}/${wallets.length} · BOOE ${out.overlap.booe}/${wallets.length}`);
  const withGme = Object.entries(out.wallets).filter(([, w]) => w.holds?.gme).sort((a, b) => (b[1].holds.gme.usd) - (a[1].holds.gme.usd));
  for (const [a, w] of withGme.slice(0, 10)) console.log(`  ${a.slice(0, 12)}  GME $${w.holds.gme.usd}${w.holds.booe ? ` · BOOE $${w.holds.booe.usd}` : ""}  · total cap $${Math.round(w.capUsd / 1e3)}k`);
  const withBooe = Object.entries(out.wallets).filter(([, w]) => w.holds?.booe && !w.holds?.gme);
  for (const [a, w] of withBooe.slice(0, 6)) console.log(`  ${a.slice(0, 12)}  BOOE $${w.holds.booe.usd}  · total cap $${Math.round(w.capUsd / 1e3)}k`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
