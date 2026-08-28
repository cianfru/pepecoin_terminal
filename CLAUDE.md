# pepecoin terminal — project notes

A clone of the SPX6900 terminal's **data layer + methodology + terminal look**, applied to
**pepecoin (PEPECOIN)**. This file is the running memory for the project (mirrors how the SPX
repo's CLAUDE.md works). Read it first.

## ⭐ NORTH STAR — RADICAL TRANSPARENCY IS THE MOAT (carried over from SPX)
- The edge is being the **transparent, reproducible on-chain analytics source** for pepecoin — not
  secret alpha. Every number checkable, methodology published, caveats labelled. When in doubt,
  MORE transparent. What would kill it: drifting into hype or an unverifiable "trust me" composite.
- On-chain reads are **valuation/POSITION statements, never buy/sell signals.**

## The token
- **pepecoin**, ERC-20, **Ethereum mainnet**, contract `0xA9E8aCf069C58aEc8825542845Fd754e41a9489A`.
- **18 decimals** (SPX was 8 — this is THE token-specific scaling detail; the engine takes it as a
  CLI flag `--decimals=18`, so no code change was needed, just the flag).
- Supply ~133.77M; ~26.14M (~19.5%) burned to `0x…dead`. Symbol on-chain is literally `pepecoin`.
- **Scale is SMALL and friendly:** ~148k transactions, ~18.6k holders (vs SPX's ~2.7M transfers /
  ~49.5k ETH holders). So the BigQuery extract is a few GB (free tier trivial), the FIFO engine
  runs in seconds with no memory pressure, and the 3D city fits easily. The SPX scale gymnastics do
  NOT apply here.
- **Honest caveat flips to THINNESS:** with ~18.6k holders and low daily transfer counts, on-chain
  signals are noisier than SPX. Smooth heavily; frame as position, not signal; use coarser cohorts
  where buckets get too small to be stable. The metrics still work — they're just lower-resolution.

## ✅ DATA LAYER — ported & proven (2026-08-28)
- **`scripts/build-onchain-local.mjs`** — the LOCAL FIFO engine, ported verbatim from SPX (it's
  token-agnostic) with two changes: `--decimals` default 8→18, and a pepecoin-specific
  `EXCLUDE_LABELS` starter. Computes the full suite in one pass: realized price / MVRV / supply-in-
  profit / concentration (top-10/top-100/gini) / HODL age bands / LTH-STH / SOPR / NRPL / liveliness
  / URPD + URPD history / whales / self-moves / entity clustering / cex-flow. Emits `onchain.json` +
  `urpd.json` + companion feeds.
- **`bigquery/pepecoin_raw_transfers.sql`** — the one-time free extract (pinned to the pepecoin
  contract). Owner runs it → `transfers.csv`.
- **`test/onchain-local.test.mjs`** — 34 unit tests, all passing. Ported from SPX; the `POOL`/`CEX`
  test constants were repointed to the confirmed pepecoin MEXC exclude entry (the SPX pool/Coinbase
  addresses aren't in pepecoin's set). Tests validate ENGINE LOGIC, not the address map.
- **Proven end-to-end:** a synthetic decimals-18 run (raw 24-digit integer values) reconciled
  exactly — minted 150k, an excluded address correctly not a holder, held 130k, holders=3, scaling
  by 10**18 correct. `Number()` parsing of the huge raw values is precise enough for analytics.
- **⚠ Cosmetic TODO:** the engine still prints "SPX" in a few `console.log` labels (whales / self-
  moves logs) and writes `cex-sankey.json` etc. Harmless (log strings only); tidy when convenient.

## 🔲 #1 DATA-HONESTY TASK — build out `EXCLUDE_LABELS`
- The engine's `EXCLUDE_LABELS` map is the ONE piece of real token-specific research. It removes
  infrastructure (pools / bridge / CEX / burn) from the holder reconstruction. **Getting it wrong
  OVERSTATES concentration** — the exact dishonesty this project guards against — so **never guess an
  address in.** Add only Etherscan/Bubblemaps-CONFIRMED infrastructure.
- **Seeded so far (starter):** `0x0` (null/mint), `0x…dead` (burn), and
  `0x9642b23ed1e01df1092b92641051881a322f5d4e` = **MEXC** — cross-referenced from the SPX exclude map
  (a shared exchange hot wallet that holds pepecoin too; it's a top-10 pepecoin holder). Cross-
  referencing SPX's list is a real shortcut: shared CEX hot wallets carry over — VERIFY each.
- **To build it out (mirrors how SPX's list was built, iteratively):** pull pepecoin's top holders
  (Bubblemaps / Etherscan), identify the Uniswap V2/V3 pepecoin pools (`kind:"lp"`), CEX hot wallets
  (`kind:"cex"`), any bridge (`kind:"bridge"`), add each confirmed one. `canonVenue()` collapses
  "<Venue> 2"/"<Venue>-linked" into the parent venue. Until the list is fuller, concentration/holder
  metrics read as an UPPER BOUND on real concentration — say so on any surface that shows them.
- `kind` drives the liquid/illiquid + exchange-flow split: burn/null → out of supply; bridge → not
  ETH-native float; lp/cex → float.

## 🔲 ROADMAP (what's left to clone from SPX)
1. **Price series** — a pepecoin/USD daily `day,price` CSV back to launch for cost-basis USD
   valuation (CoinGecko "max" for the coin, or a DEX-reconstructed series). ⚠ Verify coverage/
   liquidity is clean enough for the realized-price/MVRV charts (a thinly-traded token can have
   gappy price data — this is the one thing that could weaken the flagship valuation charts).
2. **Incremental daily refresh** — the SPX pattern: full transfer history in a GitHub release asset,
   a daily job pulls only the delta (BigQuery `block_timestamp > MAX` with a LITERAL cutoff for
   partition pruning — never a subquery) → re-run the local FIFO → commit. Port
   `build-onchain-dune-refresh.mjs` / the BigQuery gate workflow.
3. **The site** — port the React charts, the terminal landing, the freshness/audit machinery, the
   valuation composite (refit on pepecoin), the 3D city. Drop everything SPX-specific (AEON NFT
   track, "SPX City" branding, Solana/Base multichain unless pepecoin has a real presence there,
   the fair-launch narrative — pepecoin has its own story).
4. **Deploy** — Vercel project, secrets (`GCP_SA_KEY` for BigQuery, `ALCHEMY_KEY`, etc.).

## Tuning notes carried from SPX (revisit during the city/whale phase)
- Engine defaults (whale floor 100k tokens, city residency 5,000 tokens held 90d) are SPX-supply-
  tuned (~931M circulating). pepecoin supply is ~133M (~7× smaller) — rescale these thresholds to
  pepecoin's supply/price when building the whale + city views. They're CLI-overridable; they don't
  affect the core metrics (rp/mvrv/sip/concentration/hodl), only the whales list + city residency.

## Honesty rails (non-negotiable, from SPX)
- Every published number reproducible from the documented method. Show the number, state the method,
  label the caveats.
- Never present frozen/stale data as current. Register every feed in a freshness audit.
- Thin token → smooth + "position, not signal". Never a price-prediction/leaderboard mechanic.
