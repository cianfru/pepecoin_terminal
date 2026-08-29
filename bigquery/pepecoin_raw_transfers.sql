-- ============================================================================
-- pepecoin (PEPECOIN) — RAW TRANSFERS, the FREE (no-Dune-credit) way  [Google BigQuery]
-- Contract: 0xA9E8aCf069C58aEc8825542845Fd754e41a9489A  (Ethereum mainnet, ERC-20, 18 decimals)
-- ============================================================================
-- This is the ONE extract that seeds the whole on-chain suite. The heavy per-wallet FIFO
-- math runs LOCALLY (scripts/build-onchain-local.mjs) for $0 — BigQuery only dumps the raw
-- transfers, which is a plain filtered SELECT of 4 columns from one token.
--
-- WHY IT FITS THE FREE TIER (1 TB scan/month, no charge): BigQuery bills by BYTES SCANNED,
-- and scanning token_transfers for these 4 columns of a SINGLE token is well under the free
-- allowance for one run. pepecoin is a SMALL token (~148k transactions, far smaller than
-- SPX's ~2.7M), so this extract is only a few GB. Get the query right first (it's trivial),
-- then run ONCE — don't loop-debug it (that's the only way to nibble the free TB).
--
-- HOW TO RUN (console.cloud.google.com/bigquery, any free Google account):
--   1. Paste the query, Run.
--   2. Results > SAVE RESULTS. pepecoin is small enough that "CSV (local file)" likely works
--      directly; if it complains about size, save to a "BigQuery table" then EXPORT to GCS as
--      CSV. Or the bq CLI:
--        bq query --use_legacy_sql=false --format=csv --max_rows=100000000 \
--          "$(cat bigquery/pepecoin_raw_transfers.sql)" > transfers.csv
--   3. Then locally:
--        node scripts/build-onchain-local.mjs --transfers=transfers.csv --prices=prices.csv --decimals=18
--
-- PRICE CSV: a small day,price series of pepecoin/USD (CoinGecko "max" for the coin, or any
-- daily close feed). The engine forward/back-fills gaps. See CLAUDE.md → "price history".
--
-- Column headers (sender/receiver/time/value) match what the local engine auto-detects;
-- `value` is the RAW 18-decimal integer — the engine scales by 10**18 (--decimals=18), so do
-- NOT divide here.
--
-- INTRA-BLOCK ORDERING: block_timestamp is per-BLOCK (second granularity), so a receive and a
-- send in the same block share a timestamp with no order. The engine replays same-timestamp
-- blocks RECEIVES-first (a send can't spend what it hasn't received). For EXACT ordering on a
-- future re-bundle, also SELECT block_number, log_index and sort by them (then the heuristic
-- is unnecessary) — not needed now.
-- ============================================================================

SELECT
  from_address    AS sender,
  to_address      AS receiver,
  block_timestamp AS time,
  value           AS value          -- raw (18-decimal); engine divides by 10**18 via --decimals=18
FROM `bigquery-public-data.crypto_ethereum.token_transfers`
WHERE token_address = '0xa9e8acf069c58aec8825542845fd754e41a9489a';   -- pepecoin (lowercase; the table stores addresses lowercased)
-- (no ORDER BY — the engine re-sorts by timestamp anyway; sorting in BQ just costs time.)

-- To CHUNK by year if a single export gets unwieldy (file size, not cost):
--   AND block_timestamp >= '2024-01-01' AND block_timestamp < '2025-01-01'
-- Run once per year, concat the CSVs offline — the engine re-sorts anyway.
