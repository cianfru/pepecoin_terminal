# pepecoin terminal

An **open, reproducible on-chain analytics terminal for pepecoin (PEPECOIN)** — a clone of the
data layer, methodology, and "terminal" aesthetic built for the SPX6900 rainbow chart.

- **Token:** pepecoin (symbol `pepecoin`), ERC-20 on **Ethereum mainnet**
- **Contract:** [`0xA9E8aCf069C58aEc8825542845Fd754e41a9489A`](https://etherscan.io/token/0xa9e8acf069c58aec8825542845fd754e41a9489a)
- **Decimals:** 18 · **Supply:** ~133.77M · ~26.1M (~19.5%) burned to `0x…dead`

## The idea

Every number is checkable. The moat is **radical transparency + reproducibility** — an SPX-native
methodology applied to pepecoin: reconstruct per-wallet balance, cost basis, and holding age from
the public ERC-20 transfer history, entirely from free/public data, and publish the method.

Because pepecoin is a plain Ethereum ERC-20, the whole SPX on-chain suite reconstructs identically:
realized price / floor model, MVRV, supply-in-profit, HODL waves, holder age, concentration, URPD
(cost-basis distribution), NUPL, SOPR, liveliness, exit-flow, cohort survival, smart-money, and the
entity-clustering + 3D "city" views.

## How the data layer works

One cheap extract → local compute, $0:

1. **Extract** raw transfers once from BigQuery's free public Ethereum dataset
   (`bigquery/pepecoin_raw_transfers.sql`) → `transfers.csv`. pepecoin is small (~148k txns), so
   this is a few GB, well inside BigQuery's free 1 TB/month.
2. **Reconstruct** locally with the FIFO engine:
   ```
   node scripts/build-onchain-local.mjs --transfers=transfers.csv --prices=prices.csv --decimals=18
   ```
   Each wallet is a FIFO queue of `{ts, price, qty}` lots; a send consumes the earliest lots first,
   so every held coin keeps its true acquisition age + cost. Infrastructure addresses (pools /
   bridge / CEX / burn — `EXCLUDE_LABELS` in the engine) are never counted as holders.
3. **Output** `public/onchain.json` (the full metric suite, per day) + `public/urpd.json`
   (current cost-basis histogram) + companion feeds (whales, entities, cex-flow, self-moves).

`--prices` is a small `day,price` pepecoin/USD series (e.g. CoinGecko "max"); the engine
forward/back-fills gaps.

## Status

**Data-layer foundation — in progress.** The FIFO engine is ported and proven end-to-end on the
decimals-18 path (34/34 unit tests pass; a synthetic run reconciles exactly). What's next:

- [x] **Full transfer history pulled** — 675k transfers via public-RPC `eth_getLogs`, **zero cost** (not BigQuery — see below)
- [x] **Daily price series** — DeFiLlama, 2023-05-10 → today → `prices.csv`
- [x] **First real `onchain.json`** — validated (holders 16.5k, MVRV 0.15×, top-100 57.8%)
- [x] **Incremental daily refresh** — `.github/workflows/onchain.yml` (release-asset archive + RPC delta)
- [~] `EXCLUDE_LABELS` — burn, MEXC, Gate.io, routers, Uniswap V2 LP done; a few small wallets left to verify
- [ ] The site: charts, the terminal landing, the 3D city
- [ ] Vercel deploy

### Why not BigQuery?
`crypto_ethereum.token_transfers` doesn't prune by token, so a pepecoin filter still scans ~500 GB
(same as any token). The minimal-cost path is **public-RPC `eth_getLogs`** scoped to the contract —
zero cost to any quota. `scripts/pull-transfers-rpc.py` does the full/delta pulls; drpc + mevblocker
return exact `blockTimestamp` per log, so timestamps are canonical, not approximated.

See **`CLAUDE.md`** for the full engineering notes, decisions, and honesty rails carried over
from the SPX project.

## Honesty rails (non-negotiable)

- Every published number must be reproducible from the documented method.
- On-chain reads are **valuation/position statements, never buy/sell signals.**
- pepecoin is thin — signals get heavy smoothing and "position, not signal" framing.
- Never guess an address into `EXCLUDE_LABELS` — a wrong exclusion overstates concentration.
