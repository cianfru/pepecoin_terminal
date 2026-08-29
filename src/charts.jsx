import {
  ResponsiveContainer, ComposedChart, AreaChart, BarChart, LineChart, Area, Line, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  useOnchain, useJson, last, fmtUsd, fmtPct, fmtX, fmtNum, fmtTok, shortAddr, shortDate,
} from "./data.js";

const GRID = "#141b24";
const AXIS = "#5f6d7c";
const C = { tx: "#dfe7ee", green: "#4ade80", cyan: "#22d3ee", warn: "#fb7185", amber: "#fbbf24", lime: "#a3e635", dim: "#93a1b0" };
const xAxis = { dataKey: "d", tickFormatter: shortDate, stroke: AXIS, minTickGap: 44 };
const noAnim = { isAnimationActive: false };

// ── shared card that handles loading / error / ready and wraps one recharts element ──
export function ChartCard({ title, q, foot, legend, feed, height = 300, children }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {q && <p className="q">{q}</p>}
      {legend && (
        <div className="legend">
          {legend.map((l) => <span key={l.label}><i className="dot" style={{ background: l.c }} />{l.label}</span>)}
        </div>
      )}
      {feed.err ? <div className="cstate err">could not load — {feed.err}</div>
        : !feed.data ? <div className="cstate">loading…</div>
        : <div style={{ width: "100%", height }}><ResponsiveContainer>{children(feed.data)}</ResponsiveContainer></div>}
      {foot && <p className="foot">{foot}</p>}
    </section>
  );
}

const Tip = (fmt) => ({ active, payload, label }) =>
  active && payload && payload.length ? (
    <div className="tip">
      <div className="td">{label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div className="tr" key={p.name} style={{ color: p.color || p.fill }}>
          <span>{p.name}</span><span>{fmt(p.value, p.name)}</span>
        </div>
      ))}
    </div>
  ) : null;

// ══════════════════════════ VALUATION ══════════════════════════
export function RealizedPriceChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Realized price & floor"
      q="What did the average held coin cost — and where has price found support beneath it?"
      legend={[{ label: "price", c: C.tx }, { label: "realized cost basis", c: C.green }, { label: "0.5–0.8× floor", c: C.warn }]}
      foot="Realized price = average USD cost basis of every coin currently held (FIFO). The 0.5×–0.8× band is where price has historically found support — descriptive, not a promise.">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, spot: r.spot, rp: r.rp, f8: r.rp * 0.8, f5: r.rp * 0.5 }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} />
          <YAxis scale="log" domain={["auto", "auto"]} stroke={AXIS} tickFormatter={fmtUsd} width={62} allowDataOverflow />
          <Tooltip content={Tip((v) => fmtUsd(v))} />
          <Line {...noAnim} type="monotone" dataKey="f5" name="0.5×" stroke={C.warn} strokeDasharray="4 4" strokeWidth={1} dot={false} strokeOpacity={0.55} />
          <Line {...noAnim} type="monotone" dataKey="f8" name="0.8×" stroke={C.warn} strokeDasharray="4 4" strokeWidth={1} dot={false} strokeOpacity={0.55} />
          <Line {...noAnim} type="monotone" dataKey="rp" name="realized cost basis" stroke={C.green} strokeWidth={2} dot={false} />
          <Line {...noAnim} type="monotone" dataKey="spot" name="price" stroke={C.tx} strokeWidth={2} dot={false} />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function MvrvChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="MVRV"
      q="Is the market above or below what holders paid? Below 1× means the average holder is underwater."
      foot="MVRV = price ÷ realized price. Well under 1× marks deep-value / capitulation territory (position, not signal).">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, mvrv: r.mvrv }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={(v) => v + "×"} width={46} />
          <Tooltip content={Tip((v) => fmtX(v))} />
          <ReferenceLine y={1} stroke={C.dim} strokeDasharray="5 5" />
          <Line {...noAnim} type="monotone" dataKey="mvrv" name="MVRV" stroke={C.cyan} strokeWidth={2} dot={false} />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function NuplChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="NUPL"
      q="Net unrealized profit / loss — how much of the market cap is paper gains vs paper losses."
      foot="NUPL = 1 − realized÷market. Above 0 = the average coin is in profit; deeply below 0 = broad unrealized loss. Extreme for pepecoin given the drawdown.">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, nupl: r.mvrv ? 1 - 1 / r.mvrv : null }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={(v) => v.toFixed(1)} width={46} />
          <Tooltip content={Tip((v) => v.toFixed(2))} />
          <ReferenceLine y={0} stroke={C.dim} strokeDasharray="5 5" />
          <Line {...noAnim} type="monotone" dataKey="nupl" name="NUPL" stroke={C.amber} strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function SupplyProfitChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Supply in profit"
      q="What share of held supply is sitting above its cost basis right now?"
      foot="Share of held coins whose FIFO cost basis is below the current price.">
      {(rows) => (
        <AreaChart data={rows.map((r) => ({ d: r.d, sip: r.sip }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <defs><linearGradient id="sip" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.35} /><stop offset="100%" stopColor={C.green} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} domain={[0, 100]} tickFormatter={(v) => v + "%"} width={44} />
          <Tooltip content={Tip((v) => fmtPct(v))} />
          <ReferenceLine y={50} stroke={C.dim} strokeDasharray="5 5" />
          <Area {...noAnim} type="monotone" dataKey="sip" name="in profit" stroke={C.green} strokeWidth={2} fill="url(#sip)" />
        </AreaChart>
      )}
    </ChartCard>
  );
}

// ══════════════════════════ CONVICTION ══════════════════════════
const AGE = [
  { key: "a0", label: "0–1m", c: C.warn }, { key: "a1", label: "1–3m", c: C.amber },
  { key: "a2", label: "3–6m", c: C.lime }, { key: "a3", label: "6–12m", c: C.green }, { key: "a4", label: "1y+", c: C.cyan },
];
export function HodlWavesChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="HODL waves"
      q="How old is the held supply? A thick 1y+ band is a deep, patient holder base."
      legend={AGE.map((a) => ({ label: a.label, c: a.c }))}
      foot="Each coin bucketed by how long it has been held (FIFO acquisition age), as a share of held supply.">
      {(rows) => (
        <AreaChart data={rows.map((r) => ({ d: r.d, a0: r.age[0], a1: r.age[1], a2: r.age[2], a3: r.age[3], a4: r.age[4] }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }} stackOffset="expand">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={(v) => Math.round(v * 100) + "%"} width={44} />
          <Tooltip content={Tip((v) => fmtPct(v))} />
          {AGE.map((a) => <Area {...noAnim} key={a.key} type="monotone" dataKey={a.key} name={a.label} stackId="1" stroke={a.c} fill={a.c} fillOpacity={0.55} strokeWidth={0.5} />)}
        </AreaChart>
      )}
    </ChartCard>
  );
}

const LS = [
  { key: "lthProfit", label: "LTH in profit", c: C.green }, { key: "sthProfit", label: "STH in profit", c: C.lime },
  { key: "sthLoss", label: "STH in loss", c: C.amber }, { key: "lthLoss", label: "LTH in loss", c: C.warn },
];
export function LthSthChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Long vs short-term holders"
      q="How is supply split between long- and short-term holders — and who's in profit vs loss?"
      legend={LS.map((l) => ({ label: l.label, c: l.c }))}
      foot="Long-term = held ≥155 days. Each coin classified by holder tenure and whether it's above cost. A large LTH-in-loss band = conviction through a deep drawdown.">
      {(rows) => (
        <AreaChart data={rows.map((r) => ({ d: r.d, lthProfit: r.lthProfit, sthProfit: r.sthProfit, sthLoss: r.sthLoss, lthLoss: r.lthLoss }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} domain={[0, 100]} tickFormatter={(v) => v + "%"} width={44} />
          <Tooltip content={Tip((v) => fmtPct(v))} />
          {LS.map((l) => <Area {...noAnim} key={l.key} type="monotone" dataKey={l.key} name={l.label} stackId="1" stroke={l.c} fill={l.c} fillOpacity={0.5} strokeWidth={0.5} />)}
        </AreaChart>
      )}
    </ChartCard>
  );
}

export function HoldersChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Holder count"
      q="Is the holder base growing, even as price moves?"
      foot="Distinct Ethereum wallets holding pepecoin (infrastructure excluded), over time.">
      {(rows) => (
        <AreaChart data={rows.map((r) => ({ d: r.d, holders: r.holders }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <defs><linearGradient id="hold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.cyan} stopOpacity={0.3} /><stop offset="100%" stopColor={C.cyan} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={fmtTok} width={48} />
          <Tooltip content={Tip((v) => fmtNum(v))} />
          <Area {...noAnim} type="monotone" dataKey="holders" name="holders" stroke={C.cyan} strokeWidth={2} fill="url(#hold)" />
        </AreaChart>
      )}
    </ChartCard>
  );
}

const TIER = [
  { key: "t0", label: "<1k", c: "#1f2a37" }, { key: "t1", label: "1k–10k", c: "#2f4a52" },
  { key: "t2", label: "10k–100k", c: C.lime }, { key: "t3", label: "100k–1M", c: C.green }, { key: "t4", label: "1M+", c: C.cyan },
];
export function WealthTiersChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Supply by wallet size"
      q="How much of the supply sits in small vs large wallets, over time?"
      legend={TIER.map((t) => ({ label: t.label, c: t.c }))}
      foot="Held supply split by wallet token balance (<1k … 1M+ tokens). Token brackets, so the split is unaffected by price.">
      {(rows) => (
        <AreaChart data={rows.map((r) => ({ d: r.d, t0: r.tiers[0], t1: r.tiers[1], t2: r.tiers[2], t3: r.tiers[3], t4: r.tiers[4] }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }} stackOffset="expand">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={(v) => Math.round(v * 100) + "%"} width={44} />
          <Tooltip content={Tip((v) => fmtPct(v))} />
          {TIER.map((t) => <Area {...noAnim} key={t.key} type="monotone" dataKey={t.key} name={t.label} stackId="1" stroke={t.c} fill={t.c} fillOpacity={0.6} strokeWidth={0.5} />)}
        </AreaChart>
      )}
    </ChartCard>
  );
}

// ══════════════════════════ COST BASIS ══════════════════════════
export function UrpdChart() {
  const feed = useJson("urpd.json");
  return (
    <ChartCard feed={feed} title="Cost-basis distribution (URPD)"
      q="At what prices was the held supply acquired — and how much is above vs below today's price?"
      legend={[{ label: "in profit", c: C.green }, { label: "underwater", c: C.warn }]}
      foot="Each bar = share of held supply whose cost basis falls in that price bucket. Green = below the live price (in profit), red = above.">
      {(u) => {
        const spot = u.spot;
        const data = u.buckets.map((b) => ({ price: fmtUsd((b.lo + b.hi) / 2), pct: b.pct, up: (b.lo + b.hi) / 2 < spot }));
        return (
          <BarChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="price" stroke={AXIS} minTickGap={26} angle={0} />
            <YAxis stroke={AXIS} tickFormatter={(v) => v + "%"} width={40} />
            <Tooltip content={Tip((v) => fmtPct(v, 2))} />
            <Bar {...noAnim} dataKey="pct" name="supply">
              {data.map((d, i) => <Cell key={i} fill={d.up ? C.green : C.warn} fillOpacity={0.8} />)}
            </Bar>
          </BarChart>
        );
      }}
    </ChartCard>
  );
}

export function UrpdAgeChart() {
  const feed = useJson("urpd.json");
  return (
    <ChartCard feed={feed} title="Cost basis by age"
      q="At each acquisition price, how old is the supply held there?"
      legend={AGE.map((a) => ({ label: a.label, c: a.c }))}
      foot="URPD split by holding age — tall old (cyan) walls are conviction cost-basis zones.">
      {(u) => {
        const data = u.buckets.map((b) => ({ price: fmtUsd((b.lo + b.hi) / 2), a0: b.age[0], a1: b.age[1], a2: b.age[2], a3: b.age[3], a4: b.age[4] }));
        return (
          <BarChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="price" stroke={AXIS} minTickGap={26} />
            <YAxis stroke={AXIS} tickFormatter={(v) => v + "%"} width={40} />
            <Tooltip content={Tip((v) => fmtPct(v, 2))} />
            {AGE.map((a) => <Bar {...noAnim} key={a.key} dataKey={a.key} name={a.label} stackId="1" fill={a.c} fillOpacity={0.8} />)}
          </BarChart>
        );
      }}
    </ChartCard>
  );
}

// ══════════════════════════ CONCENTRATION ══════════════════════════
export function ConcentrationChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Concentration"
      q="How much of the held supply do the largest wallets control over time?"
      legend={[{ label: "top 10", c: C.warn }, { label: "top 100", c: C.cyan }]}
      foot="Share of held supply held by the largest N wallets, infrastructure excluded. An upper bound while the exclude list is still being verified.">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, top10: r.top10, top100: r.top100 }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} domain={[0, 100]} tickFormatter={(v) => v + "%"} width={44} />
          <Tooltip content={Tip((v) => fmtPct(v))} />
          <Line {...noAnim} type="monotone" dataKey="top100" name="top 100" stroke={C.cyan} strokeWidth={2} dot={false} />
          <Line {...noAnim} type="monotone" dataKey="top10" name="top 10" stroke={C.warn} strokeWidth={2} dot={false} />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function GiniChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Gini coefficient"
      q="How unequal are holdings? 0 = perfectly even, 1 = one wallet holds everything."
      foot="Gini of held balances (infrastructure excluded). Dust-tail sensitive — read the trend, not the absolute level.">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, gini: r.gini }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} domain={[0.8, 1]} tickFormatter={(v) => v.toFixed(2)} width={44} />
          <Tooltip content={Tip((v) => v.toFixed(4))} />
          <Line {...noAnim} type="monotone" dataKey="gini" name="Gini" stroke={C.amber} strokeWidth={2} dot={false} />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function WhalesTable() {
  const feed = useJson("whales.json");
  return (
    <section className="card">
      <h2>Whale leaderboard</h2>
      <p className="q">The largest wallets, their holding age, and whether they've added or sold recently.</p>
      {feed.err ? <div className="cstate err">could not load — {feed.err}</div>
        : !feed.data ? <div className="cstate">loading…</div>
        : (() => {
          const ws = [...feed.data.wallets].sort((a, b) => b.bal - a.bal).slice(0, 25);
          return (
            <div className="tscroll"><table className="dtable">
              <thead><tr><th>#</th><th>wallet</th><th className="r">balance</th><th className="r">held</th><th className="r">30d flow</th></tr></thead>
              <tbody>{ws.map((w, i) => (
                <tr key={w.a}>
                  <td className="dim">{i + 1}</td>
                  <td><a href={`https://etherscan.io/address/${w.a}`} target="_blank" rel="noreferrer">{shortAddr(w.a)}</a></td>
                  <td className="r">{fmtTok(w.bal)}</td>
                  <td className="r dim">{w.days ? Math.round(w.days) + "d" : "—"}</td>
                  <td className={"r " + (w.d30 > 0 ? "pos" : w.d30 < 0 ? "neg" : "dim")}>{w.d30 ? (w.d30 > 0 ? "+" : "") + fmtTok(w.d30) : "0"}</td>
                </tr>))}</tbody>
            </table></div>
          );
        })()}
      <p className="foot">Balances in tokens. Flow = net change over the last 30 days. Addresses link to Etherscan — the chain is public.</p>
    </section>
  );
}

export function ClustersTable() {
  const feed = useJson("entities.json");
  return (
    <section className="card">
      <h2>Wallet clusters</h2>
      <p className="q">Groups of wallets that fund or drain each other — likely one owner behind several addresses.</p>
      {feed.err ? <div className="cstate err">could not load — {feed.err}</div>
        : !feed.data ? <div className="cstate">loading…</div>
        : (() => {
          const es = [...feed.data.entities].filter((e) => !e.flagged).sort((a, b) => b.size - a.size).slice(0, 20);
          return (
            <div className="tscroll"><table className="dtable">
              <thead><tr><th>#</th><th>lead wallet</th><th className="r">wallets</th></tr></thead>
              <tbody>{es.map((e, i) => (
                <tr key={e.id}>
                  <td className="dim">{i + 1}</td>
                  <td><a href={`https://etherscan.io/address/${e.id}`} target="_blank" rel="noreferrer">{shortAddr(e.id)}</a></td>
                  <td className="r">{e.size}</td>
                </tr>))}</tbody>
            </table></div>
          );
        })()}
      <p className="foot">Only conservative links (fund ≥ a threshold / near-total drain, never a payment). Flagged/oversized clusters are excluded, so this is a floor on real linkage, not a ceiling.</p>
    </section>
  );
}

// ══════════════════════════ BEHAVIOUR ══════════════════════════
export function SoprChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="SOPR"
      q="When coins move, are they being spent in profit or at a loss? Above 1 = profit-taking."
      foot="Spent-Output Profit Ratio = realized value ÷ cost of the coins that moved. Null when nothing moved; thin token, so smooth it in your head.">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, sopr: r.sopr }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={(v) => v.toFixed(1)} width={44} />
          <Tooltip content={Tip((v) => fmtX(v))} />
          <ReferenceLine y={1} stroke={C.dim} strokeDasharray="5 5" />
          <Line {...noAnim} type="monotone" dataKey="sopr" name="SOPR" stroke={C.green} strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function NrplChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Net realized profit / loss"
      q="In dollar terms, are holders realizing gains or crystallizing losses?"
      foot="Net realized P/L = realized profit − realized loss (USD) of coins that moved each period. Green above 0, red below.">
      {(rows) => (
        <BarChart data={rows.map((r) => ({ d: r.d, nrpl: r.nrpl }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={(v) => "$" + fmtTok(Math.abs(v))} width={56} />
          <Tooltip content={Tip((v) => "$" + fmtTok(v))} />
          <ReferenceLine y={0} stroke={C.dim} />
          <Bar {...noAnim} dataKey="nrpl" name="net realized P/L">
            {rows.map((r, i) => <Cell key={i} fill={r.nrpl >= 0 ? C.green : C.warn} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      )}
    </ChartCard>
  );
}

export function LivelinessChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Liveliness"
      q="Are long-dormant coins waking up and moving, or is the base going to sleep?"
      foot="Liveliness = cumulative coin-days destroyed ÷ created. Rising = old coins moving (distribution); falling = accumulation / dormancy.">
      {(rows) => (
        <ComposedChart data={rows.map((r) => ({ d: r.d, liveliness: r.liveliness }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(2)} width={46} />
          <Tooltip content={Tip((v) => v.toFixed(3))} />
          <Line {...noAnim} type="monotone" dataKey="liveliness" name="liveliness" stroke={C.cyan} strokeWidth={2} dot={false} />
        </ComposedChart>
      )}
    </ChartCard>
  );
}

export function CexSupplyChart() {
  const feed = useOnchain();
  return (
    <ChartCard feed={feed} title="Where tradable supply sits"
      q="How much pepecoin sits in the DEX liquidity pool vs on centralized exchanges?"
      legend={[{ label: "Uniswap LP", c: C.cyan }, { label: "exchanges", c: C.amber }]}
      foot="Balances on the tagged Uniswap V2 pool and CEX hot wallets. Limited by how complete the exclude list is — CEX coverage grows as more venues are tagged.">
      {(rows) => (
        <AreaChart data={rows.map((r) => ({ d: r.d, lp: r.lpBal, cex: r.cexBal }))} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={fmtTok} width={48} />
          <Tooltip content={Tip((v) => fmtTok(v))} />
          <Area {...noAnim} type="monotone" dataKey="lp" name="Uniswap LP" stackId="1" stroke={C.cyan} fill={C.cyan} fillOpacity={0.4} strokeWidth={1} />
          <Area {...noAnim} type="monotone" dataKey="cex" name="exchanges" stackId="1" stroke={C.amber} fill={C.amber} fillOpacity={0.4} strokeWidth={1} />
        </AreaChart>
      )}
    </ChartCard>
  );
}

// ── tiny gallery sparkline (onchain series only) ──
export function Spark({ rows, pick, color = C.green }) {
  if (!rows) return <div className="spark ph" />;
  const data = rows.map((r) => ({ v: pick(r) })).filter((d) => d.v != null && isFinite(d.v));
  return (
    <div className="spark">
      <ResponsiveContainer><LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <Line {...noAnim} type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart></ResponsiveContainer>
    </div>
  );
}
export const SPARK = {
  realized: { pick: (r) => r.spot, color: C.tx }, mvrv: { pick: (r) => r.mvrv, color: C.cyan },
  nupl: { pick: (r) => (r.mvrv ? 1 - 1 / r.mvrv : null), color: C.amber }, supplyprofit: { pick: (r) => r.sip, color: C.green },
  hodl: { pick: (r) => r.age[4], color: C.cyan }, lthsth: { pick: (r) => r.lthLoss, color: C.warn },
  holders: { pick: (r) => r.holders, color: C.cyan }, wealthtiers: { pick: (r) => r.tiers[4], color: C.cyan },
  concentration: { pick: (r) => r.top100, color: C.cyan }, gini: { pick: (r) => r.gini, color: C.amber },
  sopr: { pick: (r) => r.sopr, color: C.green }, nrpl: { pick: (r) => r.nrpl, color: C.green },
  liveliness: { pick: (r) => r.liveliness, color: C.cyan }, cexsupply: { pick: (r) => r.lpBal, color: C.cyan },
};

// ── the render switch: id → full component ──
const REG = {
  realized: RealizedPriceChart, mvrv: MvrvChart, nupl: NuplChart, supplyprofit: SupplyProfitChart,
  hodl: HodlWavesChart, lthsth: LthSthChart, holders: HoldersChart, wealthtiers: WealthTiersChart,
  urpd: UrpdChart, urpdage: UrpdAgeChart,
  concentration: ConcentrationChart, gini: GiniChart, whales: WhalesTable, clusters: ClustersTable,
  sopr: SoprChart, nrpl: NrplChart, liveliness: LivelinessChart, cexsupply: CexSupplyChart,
};
export function chartEl(id) {
  const Comp = REG[id];
  return Comp ? <Comp /> : <div className="cstate err">unknown chart: {id}</div>;
}
