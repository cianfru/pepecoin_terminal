// Cross-token playbook check. The operator cohort also holds GME (Ethereum) and BOOE (Book of Ethereum) —
// tokens this crew is known to pump/dump. This reconstructs each cohort wallet's history in THOSE tokens the
// same way we did for pepecoin (bought early? sold into the token's OWN top? still holding / re-staged?) to
// see if the same wallets ran the same playbook. All keyless: transfers from Blockscout, prices from DeFiLlama.
//
// Usage: node scripts/build-crosstoken.mjs  → writes public/crosstoken.json
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.env.BLOCKSCOUT_BASE || "https://eth.blockscout.com";
const UA = { "user-agent": "curl/8.5.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ts) => new Date(ts).toISOString().slice(0, 10);

const TOKENS = {
  gme: { addr: "0xc56c7a0eaa804f854b536a5f3d5f49d2ec4b12b8", name: "GME (Ethereum)" },
  booe: { addr: "0x289ff00235d2b98b0145ff5d4435d3e92f9540a6", name: "BOOE — Book of Ethereum" },
};

async function j(url) { try { const r = await fetch(url, { headers: UA }); if (!r.ok) return null; return await r.json(); } catch { return null; } }

// daily price series + ATH from DeFiLlama
async function priceSeries(addr) {
  const d = await j(`https://coins.llama.fi/chart/ethereum:${addr}?span=500&period=1d`);
  const pts = (d?.coins?.[`ethereum:${addr}`]?.prices || []).map((p) => [p.timestamp * 1000, p.price]).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  const at = (ts) => { let lo = 0, hi = pts.length - 1, best = pts[0][1]; while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= ts) { best = pts[m][1]; lo = m + 1; } else hi = m - 1; } return best; };
  const ath = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { at, athTs: ath[0], athPrice: ath[1], first: pts[0], last: pts[pts.length - 1] };
}

// a wallet's transfers of one token (paginated, capped)
async function transfers(addr, token) {
  const out = []; let params = ""; let pages = 0;
  do {
    const r = await j(`${BASE}/api/v2/addresses/${addr}/token-transfers?token=${token}&type=ERC-20${params}`);
    if (!r) break;
    for (const t of r.items || []) {
      const dec = Number(t.total?.decimals || 18);
      out.push({ ts: Date.parse(t.timestamp), from: (t.from?.hash || "").toLowerCase(), to: (t.to?.hash || "").toLowerCase(), qty: Number(t.total?.value || 0) / 10 ** dec });
    }
    params = r.next_page_params ? "&" + new URLSearchParams(r.next_page_params).toString() : "";
    await sleep(90);
  } while (params && ++pages < 6);
  return out.sort((a, b) => a.ts - b.ts);
}

function reconstruct(txs, addr, pr) {
  let bought = 0, sold = 0, boughtUsd = 0, proceeds = 0, soldTop = 0, first = 0, firstPrice = 0;
  const hi = pr.athPrice;
  for (const t of txs) {
    const price = pr.at(t.ts);
    if (t.to === addr && t.from !== addr) { bought += t.qty; boughtUsd += t.qty * price; if (!first) { first = t.ts; firstPrice = price; } }
    if (t.from === addr && t.to !== addr) { sold += t.qty; proceeds += t.qty * price; if (price >= 0.5 * hi) soldTop += t.qty * price; }
  }
  const bag = Math.max(0, bought - sold);
  const bagUsd = bag * pr.last[1];
  const soldFrac = bought > 0 ? sold / bought : 0;
  const early = first && first < pr.athTs;                 // bought before the token's top
  const distributed = soldTop >= 500;                       // sold real $ near/at the top
  let role = "none";
  if (bought > 0) role = early && distributed ? "sold-top" : bag > 0 && soldFrac < 0.5 ? "holding" : "traded";
  return { role, first: first ? iso(first) : null, firstPrice: firstPrice ? +firstPrice.toPrecision(3) : 0,
    boughtUsd: Math.round(boughtUsd), proceeds: Math.round(proceeds), soldTopUsd: Math.round(soldTop), bagUsd: Math.round(bagUsd), n: txs.length };
}

async function main() {
  const sm = JSON.parse(await readFile("public/smart-money.json", "utf8"));
  const set = new Set();
  for (const r of sm.cycle || []) set.add(r.a);
  for (const c of sm.clusters || []) for (const m of c.members || []) set.add(m.a);
  for (const p of sm.rally?.primed || []) set.add(p.a);
  const wallets = [...set];

  const out = { updated: iso(Date.now()), tokens: {}, wallets: {}, summary: {} };
  for (const [key, t] of Object.entries(TOKENS)) {
    const pr = await priceSeries(t.addr);
    if (!pr) { console.log(`${key}: no price series`); continue; }
    out.tokens[key] = { addr: t.addr, name: t.name, ath: iso(pr.athTs), athPrice: +pr.athPrice.toPrecision(3), now: +pr.last[1].toPrecision(3), downFromAth: Math.round(100 * (1 - pr.last[1] / pr.athPrice)) };
    let traded = 0, soldTop = 0, holding = 0, soldTopUsd = 0;
    for (const a of wallets) {
      const txs = await transfers(a, t.addr);
      if (!txs.length) continue;
      const r = reconstruct(txs, a, pr);
      if (r.role === "none") continue;
      (out.wallets[a] ||= {})[key] = r;
      traded++; if (r.role === "sold-top") { soldTop++; soldTopUsd += r.soldTopUsd; } if (r.role === "holding") holding++;
      await sleep(30);
    }
    out.summary[key] = { cohort: wallets.length, traded, soldTop, holding, soldTopUsd };
    console.log(`${key.toUpperCase()} (${t.name}) — ATH ${out.tokens[key].ath} @$${out.tokens[key].athPrice}, now −${out.tokens[key].downFromAth}%`);
    console.log(`  cohort wallets that traded it: ${traded}/${wallets.length} · bought-early→sold-top: ${soldTop} ($${Math.round(soldTopUsd / 1e3)}k) · still holding: ${holding}`);
    const sellers = Object.entries(out.wallets).filter(([, w]) => w[key]?.role === "sold-top").sort((a, b) => b[1][key].soldTopUsd - a[1][key].soldTopUsd);
    for (const [a, w] of sellers.slice(0, 10)) console.log(`    ${a.slice(0, 12)}  bought ${w[key].first} @$${w[key].firstPrice} · sold-top $${Math.round(w[key].soldTopUsd / 1e3)}k · bag now $${Math.round(w[key].bagUsd / 1e3)}k`);
  }
  await writeFile("public/crosstoken.json", JSON.stringify(out));
  console.log("→ public/crosstoken.json");
}
if (import.meta.url === `file://${process.argv[1]}`) main();
