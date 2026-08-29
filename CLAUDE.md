# pepecoin terminal — project guide

An **open, reproducible on-chain analytics terminal for pepecoin (PEPECOIN)** — a clone of the data
layer, methodology, terminal aesthetic, and honesty ethos of the **SPX6900 rainbow chart / "Deep Field"
terminal** (the sibling project, `cianfru/the_terminal`), retargeted to pepecoin.

> **Read me first.** This file is the single source of truth for the project — written so a fresh chat
> scoped to this repo can pick up and iterate without the SPX history. It carries the relevant SPX
> learnings; it does NOT require reading the SPX repo. When something here says "from SPX", it means a
> hard-won lesson already validated on the sibling project — trust it.

---

## 1. ⭐ NORTH STAR — RADICAL TRANSPARENCY IS THE MOAT
The durable edge is being the **transparent, reproducible, SPX-native-style on-chain analytics source**
for pepecoin — not secret alpha. Every number must be checkable; the method is published; the caveats
are labelled. When in doubt, **more transparent**. What would kill it: drifting into hype or an
unverifiable "trust me" composite. The moment a number stops being reproducible, we're just another
account with an opinion.

- On-chain reads are **valuation/POSITION statements, never buy/sell signals.**
- pepecoin is **thin** (~18.6k holders) → smooth heavily, frame as position not signal, use coarser
  cohorts where buckets get small. The metrics work; they're lower-resolution than SPX's.

---

## 2. THE TOKEN
- **pepecoin** (symbol on-chain: `pepecoin`), ERC-20, **Ethereum mainnet**.
- Contract **`0xA9E8aCf069C58aEc8825542845Fd754e41a9489A`**, **18 decimals** (SPX was 8 — see the engine's
  `--decimals` flag; this is THE token-specific scaling detail).
- Supply ~133.77M; **~26.14M (~19.5%) burned** to `0x…dead`. Deploy block 17,147,424, first transfer
  **2023-04-28** (~2.3 yrs, fully post-merge).
- Scale is **small and friendly**: ~148k transactions / **675,019 transfer events** / ~18.6k holders (vs
  SPX's ~2.7M transfers / ~49.5k ETH holders). The whole history is a few-GB pull; the engine runs in ~9s;
  the 3D city (when built) fits easily. None of SPX's scale gymnastics apply.
- **The honest caveat is THINNESS, not scale.** Noisier signals; heavier smoothing; a "position" framing.

---

## 3. HERITAGE — what "the terminal" is, and what we're cloning
The SPX6900 project ("the terminal", later "Deep Field") is a full on-chain **valuation + behaviour**
terminal for a memecoin, built on one idea: **reconstruct per-wallet balance, cost basis, and holding age
from the public ERC-20 transfer history, entirely from free/public data, and publish the method.** Because
pepecoin is a plain Ethereum ERC-20, the entire suite reconstructs identically. The moat and the on-chain
data are the same thing.

What the terminal grew into (the menu we can port — see §7): a valuation composite oscillator, a rainbow
power-law model, MVRV / realized price / NUPL / SOPR / URPD / HODL waves / supply-in-profit / liveliness /
NRPL, cohort survival + cost-basis + exit-flow, a "smart money" cohort, entity clustering ("who owns
what"), CEX-flow Sankey, and **3D holder "cities"** (every wallet a building on real Manhattan geometry).
It also has an X-posting bot + control panel — **that half is SPX-specific and NOT a priority for pepecoin**
(one account, different community). We are cloning the **analytics + site**, not the social bot.

**What does NOT carry over:** the AEON NFT track, "SPX City" branding, the SPX fair-launch/no-VC narrative,
the Solana/Base multichain work (pepecoin's canonical home is ETH; revisit only if it has real presence
elsewhere). pepecoin has its own culture and its own honest story — tell that one.

---

## 4. ARCHITECTURE

### 4a. Data layer — ✅ BUILT & VALIDATED
One cheap extract → local compute, **$0 / zero paid quota**:

- **`scripts/build-onchain-local.mjs`** — the **local FIFO engine** (ported from SPX; token-agnostic). Each
  wallet is a FIFO queue of `{ts, price, qty}` lots; a send consumes the earliest lots first, so every held
  coin keeps its true acquisition age + cost. One pass emits the full suite → `public/onchain.json` +
  `public/urpd.json` + companion feeds (`whales.json`, `entities.json`, `cex-sankey.json`, `self-moves.json`,
  `urpd-history.json`). Run: `node scripts/build-onchain-local.mjs --transfers=transfers.csv
  --prices=prices.csv --decimals=18`. **Decimals is a CLI flag** — that was the only code change from SPX.
- **`scripts/pull-transfers-rpc.py`** — the **zero-cost transfer pull**. ⭐ The minimal-consumption path is
  NOT BigQuery: `crypto_ethereum.token_transfers` does not prune by token, so a pepecoin filter still scans
  ~500 GB (same as any token). It's **public-RPC `eth_getLogs`** scoped to the contract → zero cost to any
  quota. **drpc + mevblocker** enrich each log with `blockTimestamp` (exact canonical timestamps, no
  per-block lookups) AND survive bursts; publicnode/merkle/1rpc reject ranged getLogs. The agent proxy 403s
  large responses under burst → treat 403/429/413 as a shrink signal + light pacing (baked in). Full pull =
  675k transfers, ~40 min; delta pull (`--start-block=N`) = seconds. Emits a `block` column for seam-safe
  merges.
- **`scripts/pull-prices-defillama.py`** — daily pepecoin/USD from **DeFiLlama** (free, no key), 2023-05-10
  → today → `prices.csv` (idempotent; committed, small). CoinGecko's `pepecoin` id does NOT match this token.
- **Incremental daily refresh** (`.github/workflows/onchain.yml`, daily 05:17 UTC + dispatch): the full
  archive lives as a GitHub **release asset** `transfers.csv.gz` (tag `onchain-archive`), NOT in git. Each
  run: download archive → `archive-maxblock.mjs` → delta pull → `merge-transfers.mjs` (boundary-block replace,
  seam-safe, unit-tested) → refresh prices → engine → commit `public/*.json` + `prices.csv` → re-upload
  archive. **First run self-seeds** (full pull if the asset is missing). ⚠ The gh release steps only run in
  Actions (use `github.token`); can't be exercised from the sandbox.
- **Tests:** `node --test` → 38/38 (FIFO engine + merge helpers).

### 4b. Site — ✅ "WINDOWS-XP DESKTOP" SHELL (owner chose this aesthetic 2026-08-29)
- **Vite + React** (`npm run dev` / `build` / `preview`). Two stylesheets: `src/terminal.css` (chart-internal
  tokens/classes — `.card`, `.tip`, `.dtable`, recharts axis) + **`src/xp.css`** (the desktop OS theme). Fonts
  via Google Fonts in `index.html`: **VT323** (boot/Start/clock retro), **Inter** (UI), **IBM Plex Mono** (data).
  NO JetBrains (owner rule). Strong **pepe green** identity.
- **`src/App.jsx` = a green Windows-XP desktop OS**: a BIOS boot screen → Enter → a green wallpaper (CRT
  scanlines) with **desktop icons**, draggable/resizable **chart "windows"** (titlebar + min/max/close, z-order
  focus), a bottom **taskbar** with a **🐸 start** button (the nav — a grouped Start menu = "the hamburger"),
  open-window buttons, and a tray with **live price + clock**. Mobile: windows go full-screen (one at a time),
  Start menu fills the screen, no dragging. Verified desktop + mobile, 0 h-overflow, no console errors. ⚠ Google
  Fonts are blocked in the sandbox so screenshots show fallback fonts — they load fine on the real Vercel deploy.
- **`src/charts.jsx`** = the 18 chart components + `winContent(id)` (charts + special panels: **Overview**,
  **Who's Buying** (whale 30d accumulate/distribute from whales.json), **About**). `src/charts-catalog.js` =
  single source of truth (5 families, 18 charts) driving the Start menu + icons. Add a chart = 1 catalog entry
  + 1 component + 1 case in `chartEl()`; add an icon in `ICON` (App.jsx). The old query-string gallery/router
  was replaced by the desktop shell.
- **⭐ "WHO'S BUYING" — key finding 2026-08-29 (price +3.4× in 13 days, $0.070→$0.235):** analysis of the raw
  transfers over the rally window showed **broad, organic accumulation** — net +2.99M tokens absorbed by
  holders; **41% fresh demand** (218 brand-new + 90 reactivated wallets) vs existing adding; coins came **out of
  the Uniswap pool** (−3M LP), CEX flat; top-10 buyers = 59% (moderately broad). Leans genuine, not a lone-whale
  pump. Script pattern: import `EXCLUDE`/`EXCLUDE_LABELS` from the engine, snapshot balances at window start vs
  now + first-seen ts → classify new/reactivated/adding/selling. **🔲 Turn this into a committed daily feed +
  a richer "Who's Buying" window** (currently the window shows the whale 30d flow proxy).
- **The 18 charts** (all from committed feeds — `onchain.json` / `urpd.json` / `whales.json` / `entities.json`):
  Valuation (realized price & floor, MVRV, NUPL, supply-in-profit) · Conviction (HODL waves, LTH/STH, holder
  count, wealth tiers) · Cost basis (URPD, URPD-by-age) · Concentration (top-N, Gini, whale table, cluster
  table) · Behaviour (SOPR, NRPL, liveliness, tradable supply). **Only ratio / token-bracket metrics are
  surfaced** — nothing depends on an unverified decimals assumption. Each has a plain-language question + a
  method/caveat footer (honesty rail).
- **⚠ recharts lesson:** `isAnimationActive={false}` on every Line/Area — a data terminal shouldn't
  re-animate on load, and mid-animation screenshots clip all series at the same x (the tell). Keep it off.
- **Verify renders with a real browser, not just the build:** `/opt/pw-browsers/chromium-1194/chrome-linux/
  chrome` + `playwright-core` (install for the check, then remove). Check desktop + iPhone-13 viewport for
  **0 horizontal overflow** (mobile is a first-class priority — >half of SPX traffic was mobile).

### 4c. Deploy — ✅ WIRED (Vercel)
- Vercel project **`pepecoin-terminal`** (team `cianfrus-projects` / `team_JKUG08rXRBkYqCP08c89GWDN`),
  git-linked, **production branch `main`**. `vercel.json` = framework vite, output `dist`, SPA rewrite
  (dotted paths like `/onchain.json` served as static). **Push to `main` → auto-deploys production.** Preview
  deployments build on every branch push.
- **Vercel free tier = 100 deploys/day** (SPX lesson) — the daily on-chain commit triggers one; keep an eye
  on it if crons multiply. Runtime-state files that don't need a deploy can be `paths-ignore`d later.

---

## 5. STATUS SNAPSHOT (2026-08-29)
- ✅ Data layer: engine ported (decimals=18), 675k transfers pulled via RPC (zero cost), prices from
  DeFiLlama, incremental daily refresh workflow, 38/38 tests.
- ✅ First real `onchain.json`, validated: held **107.4M ≈ circulating** (decimals exact); top wallets match
  ethplorer exactly. **holders 16,495 · realized ~$1.57 · MVRV 0.15× (deeply underwater) · supply-in-profit
  36% · top-100 57.8% · 62% held 1y+.** The story: price ran to a ~$7.4 ATH, crashed 85%+, now sits far
  under the crowd's cost basis while the 1y+ band grew to dominate — a patient base that held through.
- ✅ Site MVP (5 charts), mobile-verified. ✅ Vercel linked.
- 🔲 PR **#1** (`cianfru/pepecoin_terminal`) holds all of it. **Merge it + set `main` as the default branch**
  (Settings → Branches) to activate the daily cron AND the production deploy.
- ⚠ `public/*.json` is committed as a checkpoint but is an **upper bound on concentration** until the exclude
  list firms up (§6).

---

## 6. 🔲 #1 DATA-HONESTY TASK — build out `EXCLUDE_LABELS`
The engine's `EXCLUDE_LABELS` map (top of `build-onchain-local.mjs`) removes infrastructure (pools / bridge
/ CEX / burn) from the holder reconstruction. **Getting it wrong OVERSTATES concentration — the exact
dishonesty this project guards against — so NEVER guess an address in.** Add only Etherscan/Bubblemaps-
CONFIRMED infrastructure. `kind` drives the liquid/illiquid + exchange-flow split (burn/null → out of
supply; bridge → not ETH-native float; lp/cex/mm → float). `canonVenue()` collapses "Venue 2"/"Venue-linked".

- **Confirmed & in:** `0x0` (mint), `0x…dead` (burn), MEXC (`0x9642…`, SPX cross-ref), Gate.io (`0x0d07…`,
  SPX cross-ref), routers CoW/1inch/LI.FI (kind:mm), and **`0xddd23787…` = Uniswap V2 pepecoin LP** (owner-
  confirmed; excluding it dropped raw top-100 59.5% → 57.8%). **Cross-referencing the SPX exclude map is a
  real shortcut — shared CEX hot wallets carry over.**
- **🔲 Still to verify on Etherscan/Bubblemaps (flagged inline, lower impact):** `0x74de5d4f…` (likely
  MetaMask Swap Router → mm), `0xafd18a20…`, `0xb92fe925…`. A guarded 303-wallet cluster persists (fused via
  one of these); the engine flags it, so it's already excluded from trusted concentration.
- **Method (how SPX's list was built):** run a fresh pull → read top holders + the engine's own
  `cex-sankey.json` `candidates[]` (high-throughput, many-counterparty wallets) → verify each → add.

---

## 7. 🔲 ROADMAP — the menu to port from the terminal (prioritized)
Everything below already exists, proven, in the SPX repo — porting is mostly re-pointing at pepecoin data.
**Judge each on "is it a real, interesting, honest finding for pepecoin," not "is it too techy"** (SPX
retired the "techy doesn't land" rule). Keep the plain-language `<Explain>`/subtitle gloss on techy charts.

**A. ✅ DONE — core 2D suite (18 charts) + the FLOW/LIFECYCLE suite (owner's priority — "who's buying / who
left / who's still here").** `scripts/build-flows.mjs` (a purpose-built builder, NOT the SPX ports — cleaner)
reads `transfers.csv` + `prices.csv` in one pass → three daily feeds: **`buyer-flow.json`** (daily net
accumulation split into brand-new / reactivated / adding vs sold + counts), **`exit-flow.json`** (daily supply
that left, profit vs loss via an avg-cost proxy), **`survival.json`** (arrival-quarter cohort survival). Wired
into `onchain.yml` (daily). Windows: **Who's Buying** (`buyers` panel — 120-day stacked cohort chart + KPIs +
top 7d buyers), **How holders left** (`exitflow`), **Who's Still Here** (`survival`). Bar/dust knobs
`--bar=1000 --dust=50`. **⭐ FINDINGS (2026-08-29 rally +3.4×):** net +3M absorbed, 41% fresh demand, coins
drained from the LP — but **survival is 6%** (3,118 of 55,498 ever-holders ≥1k remain) = extreme churn, a
heavily-speculated coin.
- **✅ SMART MONEY / SMART WALLETS (`scripts/build-smart-money.mjs` → `smart-money.json` + `price-series.json`, daily):**
  per-wallet FIFO **realized P&L** + ROI + position/unrealized + recent flow + **era-aware behaviour** (bought early?
  sold into the top? buying the current rally?). **⭐ The cycle map is baked into the thresholds** (ATH **$7.43 on
  2024-04-11**; "early" = first buy `< 2024-03-01`; "sold high" = proceeds sold at price `≥ $1.0`; rally start
  `2026-08-14`). Four cohorts (`--early/--high/--rally/--min_top/...` are the knobs):
  - **`cycle`** ⭐ THE ONE the owner wants: bought EARLY → sold into the TOP for real money (`soldHigh ≥ $15k`) →
    BUYING the rally again (`dRally > 0`). The insider round-trip, shown not asserted. (32 wallets, $39M sold near top.)
  - **`fresh`**: first-ever pepecoin in the last 45d, bought big (`firstBuyUsd ≥ $3k`), still holding (`soldFrac < 25%`).
    Column shows the **seeder** (who sent the first coins). The "seeded then accumulating this one coin" candidates —
    e.g. three wallets each bought an identical $10k/100k on the SAME day.
  - **`cohort`** (proven realized winners, size-gated) + **`reentrants`** (sold out → buying back, realized `≥ $5k`
    floor to kill dust — this was the noise the owner flagged: 1×/tiny wallets are now filtered out).
  - **`clusters`** ⭐ "are they related?": union-find over the surfaced wallets linked by (a) a **shared pepecoin
    SEEDER** (2..`MAX_SEED=6` wallets — over that = distributor, dropped) and (b) **direct token transfers** between
    members (skipping high-degree **hubs**, `HUB=8`). **⚠ SPX SUPERNODE LESSON APPLIED:** the first cut fused a
    110-wallet blob via an untagged distributor-seeder; the fan-out + hub guards break it into clean 2–4-wallet groups
    (0 flagged). Over-merging overstates coordination → every rule errs shy; groups `>25` are shown `flagged`, not trusted.
  - **⚠ HONEST SCOPE — TOKEN-FLOW ONLY:** clustering sees pepecoin transfers, NOT **ETH funding** (a Coinbase→fresh-wallet
    seed is invisible here). Stated on the panel. Detecting the ETH seed needs an ETH-layer lookup (Etherscan/trace),
    a separate data source — not wired (no key; sandbox egress).
  - **Windows:** **Smart Money** (`smart`) + per-wallet **drill-down** (`wallet:<addr>`). Clicking any address fires a
    `pepe-open` CustomEvent → App opens the window (`iconOf`/`TITLE`/`DEFSIZE` handle the `wallet:` prefix). **✅ PRICE
    LINE FIXED (owner: "I can only see the orbs, not the price chart"):** the drill-down is now a `ComposedChart` — the
    real daily price (`price-series.json`, cropped to the wallet's active window) drawn as a white line UNDER the
    buy(green)/sell(red) orbs, so you see each trade against where price actually was. We DO have a price feed
    (`prices.csv` → `price-series.json`); the old version just wasn't plotting it.
  - **✅ ETH-FUNDING ENRICHMENT — BUILT 2026-08-29 (owner: "work on the ETH side… understand the relationship between
    those wallets… if there has been exchanges of funds between them").** The token graph can't see who funded a fresh
    wallet with ETH (a Coinbase→wallet seed). So `scripts/enrich-eth-funding.mjs` finds each surfaced wallet's FIRST
    ETH funder via **Blockscout's Etherscan-compatible API — FREE, NO KEY, zero paid quota** (same family as the Base
    holder counts; `BLOCKSCOUT_BASE` override). Incremental + cached: a first funder is immutable, so it only queries
    wallets missing from `public/eth-funding.json` (steady-state = a handful/day). Node `fetch` reaches it through the
    sandbox proxy directly (tested). Earliest inbound value tx (normal, then internal) = the funder. `scripts/eth-labels.mjs`
    tags known CEX hot wallets (Coinbase/Binance/Kraken/OKX/…); a shared **exchange** funder NEVER links wallets
    (millions withdraw from one hot wallet), only a shared **private EOA** funder does.
    - **Clustering now unions on THREE edges** (`build-smart-money.mjs` reads `eth-funding.json` if present): shared
      token seeder, direct token transfer, **AND shared private ETH funder** (2..`MAX_FUND=8`). Each cluster shows a
      `via` badge ("shared token seeder + shared ETH funder"). **⭐ A group linked by BOTH a shared token seeder and a
      shared ETH funder is near-certain common control.** Verified: **group 14 = 2 wallets both funded AND token-seeded
      by the single address `0xf1cb…5954`, dumped $13.18M near the top**; group 10 = 3 wallets, shared funder `0x49d7…12fa`,
      $25.4M. Of 167 surfaced: 161 resolved, **139 private-funded, 10 shared private funders, 22 exchange-funded**
      (Coinbase 12 · Binance 4 · Kraken 2). Workflow: build-smart-money → enrich (continue-on-error) → build-smart-money
      again (folds funders in); commits `eth-funding.json`. **🔲 An `ETHERSCAN_KEY` fast-path is optional** (higher rate
      limit) but not needed — Blockscout is keyless.
    - **✅ "THEN vs NOW" TOKEN FINGERPRINT — BUILT 2026-08-29 (owner: "if the amount bought during the first run-up is
      similar to what's being bought today").** Per wallet: `earlyBought` (tokens received before the ATH 2024-04-11) vs
      `rallyBought` (received since the rally start), and `thenNow` = the ratio. The cycle table + cluster headers show
      `bought N then → M now`; an **amber ratio flags a re-buy of a similar-size bag (0.5–2×)** — the coordinated-fleet
      fingerprint. Real reads: `0x22d5…3333` bought 197k then / 200k now (1.0×, identical); several cluster members
      re-accumulate a ~0.5–1× fraction of their original run-up bag.
  - **⭐ FINDINGS (2026-08-29, +3.4× rally $0.069→$0.235):** 32 early→sold-top→buying-back wallets ($39M cashed near the
    $7.43 top); 17 fresh big buyers; 21 clean related groups after ETH enrichment. The strongest: **group 14** (both ETH
    + token from `0xf1cb…5954`, $13.18M dumped), **group 10** (3 wallets, shared funder, $25.4M), **group 1** (4 wallets,
    bought 3,113k in the run-up → re-buying 800k now). **🔲 NEXT (owner wants MORE ETH depth, not more charts — this is
    an INTEL site building an investment thesis):** funder-of-funder (2-hop) links; label the shared private funders that
    are themselves CEX-withdrawal-fed; per-cluster "then vs now" size-match scoring; a dedicated "coordination map"
    view. Then SPX-parity charts later (valuation composite, methods, CEX flows). 3D skyline later (whale city NOT
    wanted). Owner priority = analytical VALUE over visual polish; no social/bot.

**B. Valuation layer (the hero):** the **valuation composite** — a 0–1 oscillator over history, independent
axes (valuation / trend / relative / sentiment), percentile-ranked, weights published on a Methods page
(the composite is the honest, always-valid hero; a rainbow power-law model can be a chart, but a frozen
model's floor marches up so don't make it the hero). Refit hygiene: **monitor monthly, re-fit rarely, never
reactively** — a floor breach is content, not a bug.

**C. Behaviour + identity:** entity clustering ("who owns what" — already emits `entities.json`), a
"smart money" cohort (proven ROI + still trackable), holder cohort/vintage survival. These are the
differentiators — pepecoin's own drawdown-survivor story is strong.

**D. The 3D city** (`Skyline3D` + `city-render.js` + `city-map.js` from SPX): every wallet a building on
real Manhattan geometry, height = size × holding time, colour = age, green/red = recent flow. Merged
meshes → constant draw calls. ⚠ Only measured on a CPU rasteriser in the sandbox — needs a real-device
`window.__cityStats()` check. Big, do it after the 2D suite.

**E. Methods page + a hosted manual** — publish the methodology + the correlation matrix (turns "is this
just price dressed up?" into a checkable answer). This IS the moat.

**F. (Later / maybe) the control panel + card/bot pipeline** — SPX-specific; only if pepecoin gets its own
posting cadence. Not a priority.

---

## 8. HONESTY RAILS + HARD-WON LESSONS (carry these)
- **Never present frozen/stale data as current.** The daily surfaces price off a daily feed; a weekly feed
  makes mid-week reads look frozen (SPX bug) — overlay the live daily price on the tail. Register every feed
  in a freshness audit; catch "fresh file, stale value".
- **Never guess an exclude address.** Overstating concentration is the cardinal sin. Flag, don't fuse.
- **Dune credit discipline** (if ever used): bounded single-contract queries only; READs bill by rows too;
  cancelled/timed-out queries still charge; the free tier's 2-min wall is hard. But for pepecoin the RPC
  path already avoids Dune entirely — prefer it.
- **Measure before optimizing** (draw calls, IQR not median, nearest-neighbour after placement changes) —
  SPX's city work repeatedly changed the answer once measured.
- **Verify renders in a real browser, not just a passing build.** A green `vite build` can still be a blank
  page (recharts API mismatch, log-scale zero, animation clip).
- **Mobile is first-class.** Every surface: iPhone-13 viewport, no horizontal overflow, tap targets ≥40px,
  no hover-only affordances.
- **Vercel 100 deploys/day** free-tier cap — batch commits; `[skip deploy]`-style guards for WIP if a
  deploy workflow is added.

---

## 9. HOW TO RUN / ITERATE
```
npm install
npm run dev            # site at localhost:5173, reads public/onchain.json
npm run build          # → dist/  (what Vercel builds)
npm run preview        # serve dist/
node --test            # 38 tests

# regenerate on-chain data locally (needs transfers.csv + prices.csv):
python3 scripts/pull-transfers-rpc.py               # full pull → transfers.csv (~40 min, one-time)
python3 scripts/pull-prices-defillama.py            # prices.csv
node scripts/build-onchain-local.mjs --transfers=transfers.csv --prices=prices.csv --decimals=18 \
     --out=public/onchain.json --urpd=public/urpd.json
```
`transfers.csv` / `delta.csv` / `*.csv.gz` / `pull.log` are gitignored (large; the archive is a release
asset). `prices.csv` and `public/*.json` ARE committed. The engine still prints "SPX" in a couple of
console labels (cosmetic; tidy when convenient).

## 10. OPEN TASKS
1. Merge PR #1 + set `main` as default branch → activates the daily cron + production deploy.
2. Verify the 3 flagged wallets (§6) and add the LP/CEX/router with the right `kind`.
3. Watch the first seeded workflow run (release download/upload is the one untested link).
4. Build out the site (§7A) → then valuation composite (§7B).
