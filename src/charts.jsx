import {
  ResponsiveContainer, ComposedChart, AreaChart, BarChart, LineChart, ScatterChart, Area, Line, Bar, Cell, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList,
} from "recharts";
import {
  useOnchain, useJson, last, fmtUsd, fmtPct, fmtX, fmtNum, fmtTok, shortAddr, shortDate,
} from "./data.js";
import { useState, useMemo, useRef } from "react";

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

const Tip = (fmt, labelFmt) => ({ active, payload, label }) =>
  active && payload && payload.length ? (
    <div className="tip">
      <div className="td">{labelFmt ? labelFmt(label) : label}</div>
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
  exitflow: ExitFlowChart, survival: SurvivalChart,
};
export function chartEl(id) {
  const Comp = REG[id];
  return Comp ? <Comp /> : <div className="cstate err">unknown chart: {id}</div>;
}

// ══════════════════════════ DESKTOP "APP" WINDOWS ══════════════════════════
import { last as _last } from "./data.js";

export function OverviewPanel() {
  const feed = useOnchain();
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading…</div>;
  const c = _last(feed.data);
  const K = [
    ["price", fmtUsd(c.spot), "latest daily close", c.mvrv < 1 ? "" : ""],
    ["realized cost basis", fmtUsd(c.rp), "avg held-coin cost", "good"],
    ["MVRV", fmtX(c.mvrv), c.mvrv < 1 ? "holders underwater" : "above cost", c.mvrv < 1 ? "warn" : "good"],
    ["supply in profit", fmtPct(c.sip), "of held supply", ""],
    ["holders", fmtNum(c.holders), "ETH wallets", ""],
    ["held 1y+", fmtPct(c.age[4]), "diamond base", "good"],
    ["top-100", fmtPct(c.top100), "concentration", ""],
    ["held supply", fmtTok(c.heldTokens), "tokens, ex-infra", ""],
  ];
  return (
    <div>
      <div className="ov-kpis">
        {K.map(([k, v, n, cls]) => (
          <div className="ov-kpi" key={k}><div className="k">{k}</div><div className={"v " + cls}>{v}</div><div className="n">{n}</div></div>
        ))}
      </div>
      <p className="ov-lead">An open, reproducible on-chain read on <b>pepecoin</b> — every number reconstructed
        from the public Ethereum transfer history with a local FIFO cost-basis engine. Double-click an icon,
        or hit <b>start</b>, to open a chart. Data as of {c.d}.</p>
      <RealizedPriceChart />
    </div>
  );
}

export function BuyersPanel() {
  const bf = useJson("buyer-flow.json");
  const wh = useJson("whales.json");
  if (bf.err) return <div className="cstate err">could not load — {bf.err}</div>;
  if (!bf.data) return <div className="cstate">loading…</div>;
  const days = bf.data.days;
  const win = days.slice(-120);
  const r14 = days.slice(-14).reduce((s, r) => ({ nw: s.nw + r.nw, re: s.re + r.re, ad: s.ad + r.ad, so: s.so + r.so, nNew: s.nNew + r.nNew }), { nw: 0, re: 0, ad: 0, so: 0, nNew: 0 });
  const gross = r14.nw + r14.re + r14.ad;
  const fresh = gross ? (100 * (r14.nw + r14.re) / gross) : 0;
  const net14 = gross - r14.so;
  const data = win.map((r) => ({ d: r.d, nw: r.nw, re: r.re, ad: r.ad, so: -r.so, net: r.net }));
  return (
    <div>
      <p className="q">Who is actually buying — brand-new wallets, wallets that had sold out and came back, or existing holders adding? And is that demand being met by sellers? (last 120 days)</p>
      <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="ov-kpi"><div className="k">net 14d</div><div className={"v " + (net14 >= 0 ? "good" : "warn")}>{(net14 >= 0 ? "+" : "−") + fmtTok(Math.abs(net14))}</div><div className="n">tokens absorbed</div></div>
        <div className="ov-kpi"><div className="k">fresh demand</div><div className="v good">{fresh.toFixed(0)}%</div><div className="n">new + returning</div></div>
        <div className="ov-kpi"><div className="k">new wallets</div><div className="v">{fmtNum(r14.nNew)}</div><div className="n">first buy, 14d</div></div>
        <div className="ov-kpi"><div className="k">sold into it</div><div className="v warn">{fmtTok(r14.so)}</div><div className="n">14d</div></div>
      </div>
      <div className="legend"><span><i className="dot" style={{ background: C.green }} />new</span><span><i className="dot" style={{ background: C.cyan }} />returning</span><span><i className="dot" style={{ background: C.lime }} />adding</span><span><i className="dot" style={{ background: C.warn }} />sold</span></div>
      <div style={{ width: "100%", height: 260 }}><ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} minTickGap={38} /><YAxis stroke={AXIS} tickFormatter={(v) => fmtTok(Math.abs(v))} width={48} />
          <Tooltip content={Tip((v) => fmtTok(Math.abs(v)))} />
          <ReferenceLine y={0} stroke={C.dim} />
          <Bar {...noAnim} dataKey="nw" name="new" stackId="1" fill={C.green} />
          <Bar {...noAnim} dataKey="re" name="returning" stackId="1" fill={C.cyan} />
          <Bar {...noAnim} dataKey="ad" name="adding" stackId="1" fill={C.lime} />
          <Bar {...noAnim} dataKey="so" name="sold" stackId="1" fill={C.warn} />
          <Line {...noAnim} type="monotone" dataKey="net" name="net" stroke="#fff" strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer></div>
      {wh.data && (() => {
        const add = [...wh.data.wallets].filter((w) => w.d7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 10);
        return (<><div className="buy-h good" style={{ marginTop: 14 }}>top wallets buying (7d)</div>
          <div className="tscroll"><table className="dtable"><thead><tr><th>wallet</th><th className="r">balance</th><th className="r">7d</th></tr></thead>
            <tbody>{add.map((w) => <tr key={w.a}><td><a href={`https://etherscan.io/address/${w.a}`} target="_blank" rel="noreferrer">{shortAddr(w.a)}</a></td><td className="r">{fmtTok(w.bal)}</td><td className="r pos">+{fmtTok(w.d7)}</td></tr>)}</tbody></table></div></>);
      })()}
      <p className="foot">New = wallet's first-ever buy. Returning = had sold to ~0 and bought back. Net (white) = buying − selling. Heavy churn is normal for pepecoin — the tell of a real move is fresh demand that then <i>holds</i> (see Who's Still Here).</p>
    </div>
  );
}

export function ExitFlowChart() {
  const feed = useJson("exit-flow.json");
  return (
    <ChartCard feed={feed} title="How holders left"
      q="When wallets sold out and left, were they leaving in profit or capitulating at a loss?"
      legend={[{ label: "left in profit", c: C.amber }, { label: "left at a loss", c: C.warn }]}
      foot="Supply that crossed below the holder bar each day (a wallet leaving), split by whether the exit-day price was above or below its average cost. Avg-cost proxy, not full FIFO — read the balance of profit vs loss, not the exact figure.">
      {(u) => (
        <BarChart data={u.days.slice(-180)} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...xAxis} /><YAxis stroke={AXIS} tickFormatter={fmtTok} width={48} />
          <Tooltip content={Tip((v) => fmtTok(v))} />
          <Bar {...noAnim} dataKey="profit" name="left in profit" stackId="1" fill={C.amber} fillOpacity={0.85} />
          <Bar {...noAnim} dataKey="loss" name="left at a loss" stackId="1" fill={C.warn} fillOpacity={0.85} />
        </BarChart>
      )}
    </ChartCard>
  );
}

export function SurvivalChart() {
  const feed = useJson("survival.json");
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading…</div>;
  const u = feed.data;
  return (
    <section className="card">
      <h2>Who's still here</h2>
      <p className="q">Of every wallet that ever held ≥{fmtTok(u.bar)} tokens, only <b style={{ color: C.green }}>{fmtNum(u.holdNow)}</b> of <b>{fmtNum(u.everHeld)}</b> ({(100 - u.gonePct).toFixed(0)}%) still hold today. Extreme churn — the signature of a heavily-speculated coin. The bars show how many of each quarter's arrivals remain.</p>
      <div className="legend"><span><i className="dot" style={{ background: "#24402f" }} />arrived</span><span><i className="dot" style={{ background: C.green }} />still hold</span><span><i className="dot" style={{ background: C.amber }} />survival %</span></div>
      <div style={{ width: "100%", height: 300 }}><ResponsiveContainer>
        <ComposedChart data={u.cohorts} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="q" stroke={AXIS} minTickGap={18} />
          <YAxis yAxisId="l" stroke={AXIS} tickFormatter={fmtTok} width={48} />
          <YAxis yAxisId="r" orientation="right" domain={[0, 100]} stroke={AXIS} tickFormatter={(v) => v + "%"} width={40} />
          <Tooltip content={Tip((v, n) => (n === "survival %" ? v.toFixed(0) + "%" : fmtNum(v)))} />
          <Bar {...noAnim} yAxisId="l" dataKey="arrived" name="arrived" fill="#24402f" />
          <Bar {...noAnim} yAxisId="l" dataKey="holdNow" name="still hold" fill={C.green} />
          <Line {...noAnim} yAxisId="r" type="monotone" dataKey="pct" name="survival %" stroke={C.amber} strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer></div>
      <p className="foot">"Still hold" = current balance ≥ the holder bar. Recent quarters read high (right-censoring — they haven't had time to churn out yet).</p>
    </section>
  );
}

export function AboutPanel() {
  return (
    <div className="about">
      <p><b>Pepecoin Terminal</b> is an open, reproducible on-chain valuation desk for pepecoin
        (<code>0xA9E8…9489A</code>, Ethereum, 18 decimals).</p>
      <p>Every number is reconstructed from the <b>public Ethereum transfer history</b> with a local FIFO
        cost-basis engine — no black box, no paid data. Balances, cost basis and holding age are replayed
        wallet-by-wallet; infrastructure (pools, CEX, burn) is excluded from holder metrics.</p>
      <p>On-chain reads are <b>valuation / position</b> statements, never buy or sell signals. Concentration
        figures are an upper bound while the infrastructure exclude list is verified.</p>
      <p className="foot">Data refreshes daily from public RPC — zero cost, no third-party dependency.</p>
    </div>
  );
}

const openWin = (id) => window.dispatchEvent(new CustomEvent("pepe-open", { detail: id }));
const money = (v) => { const a = Math.abs(v); const s = v < 0 ? "−$" : "$"; if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M"; if (a >= 1e3) return s + (a / 1e3).toFixed(0) + "k"; return s + a.toFixed(0); };
const Addr = ({ a }) => <a className="waddr" onClick={(e) => { e.preventDefault(); openWin("wallet:" + a); }} href={"?w=" + a}>{shortAddr(a)}</a>;

export function SmartMoneyPanel() {
  const feed = useJson("smart-money.json");
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading… (regenerates on the next daily run)</div>;
  const d = feed.data, s = d.stats || {};
  const cycle = d.cycle || [], fresh = d.fresh || [], clusters = d.clusters || [], reent = d.reentrants || [];
  const fund = d.funding || null;
  const dt = (r) => <>{r.first} <span style={{ color: C.dim }}>@{fmtUsd(r.firstPrice)}</span></>;
  const sim = (x) => x >= 0.5 && x <= 2;                         // rally re-buy is a similar-size bag to the run-up
  const efund = (r) => r.ethFunder ? (r.ethLabel ? <span className="dim">{r.ethLabel}</span> : <Addr a={r.ethFunder} />) : <span className="dim">—</span>;
  const cw = (r) => r.contract ? (r.ctrKind === "account"
    ? <span title="a smart-account / EIP-7702 wallet — a person, not infra" style={{ color: C.dim, fontSize: 9, marginLeft: 4 }}>smart wallet</span>
    : <span title={"smart contract: " + (r.ctrLabel || "unverified")} style={{ color: C.amber, fontSize: 9, marginLeft: 4 }}>⚙ {r.ctrLabel || "contract"}</span>) : null;
  const realBuyers = cycle.filter((r) => !r.contract && r.rMktNet > 0);
  const nContracts = cycle.filter((r) => r.contract).length;
  return (
    <div>
      <p className="q">Who's actually behind the {d.spot ? "rally" : "move"} — under the hood. Three reads, hardest signal first: wallets that <b>bought early, sold into the top, and are buying again now</b>; brand-<b>new wallets</b> that showed up and bought big; and which of these wallets are <b>related by token flow</b>. Click any address for its full buy/sell history over the price line.</p>
      <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="ov-kpi"><div className="k">early → sold top → back</div><div className="v good">{fmtNum(s.cycle)}</div><div className="n">round-trip wallets</div></div>
        <div className="ov-kpi"><div className="k">they cashed near top</div><div className="v">{money(s.cycleSoldHigh)}</div><div className="n">sold at ≥{fmtUsd(d.high)}</div></div>
        <div className="ov-kpi"><div className="k">fresh big buyers</div><div className="v warn">{fmtNum(s.fresh)}</div><div className="n">new & holding</div></div>
        <div className="ov-kpi"><div className="k">related groups</div><div className="v">{fmtNum(s.clusters)}</div><div className="n">token-flow clusters</div></div>
      </div>

      <div className="buy-h warn">★ bought early · sold the top · and now?</div>
      {s.cycleMktNet != null && <div className="ov-lead" style={{ margin: "0 2px 12px" }}>
        Are they reaccumulating? On the open market, barely. Across all {s.cycle} of these wallets, real net DEX buying in this rally is only <b style={{ color: s.cycleMktNet > 0 ? C.green : C.warn }}>{fmtTok(s.cycleMktNet)} tokens</b> (~{money((s.cycleMktNet || 0) * d.spot)}) — the rest is <b>{fmtTok(s.cycleCtrWd)}</b> withdrawn from DeFi vaults (bcred etc — not a buy) and <b>{fmtTok(s.cycleWalIn)}</b> moved wallet-to-wallet. And <b style={{ color: C.amber }}>{nContracts} of the {s.cycle} are smart contracts</b> (routers/MMs/vaults), not people. Strip those out and just <b>{realBuyers.length} real wallets</b> are actually buying — for ~{money(realBuyers.reduce((a, r) => a + r.rMktNet * d.spot, 0))} between them. This cohort is <b>not</b> meaningfully reaccumulating on the open market.
      </div>}
      <div className="tscroll"><table className="dtable"><thead><tr>
        <th>wallet</th><th>first buy</th><th className="r">sold near top</th><th className="r">bought then → now</th><th className="r">real market buy</th><th className="r">from vault / wallet</th><th className="r">bag</th></tr></thead>
        <tbody>{cycle.slice(0, 25).map((r) => (
          <tr key={r.a}><td><Addr a={r.a} />{cw(r)}</td><td>{dt(r)}</td><td className="r pos">{money(r.soldHigh)}</td>
            <td className="r">{fmtTok(r.earlyBought)} <span style={{ color: C.dim }}>→</span> {r.rallyBought > 0 ? <b style={{ color: C.cyan }}>{fmtTok(r.rallyBought)}</b> : <span style={{ color: C.dim }}>—</span>}{r.thenNow > 0 && <span style={{ color: sim(r.thenNow) ? C.amber : C.dim, fontSize: 10 }}> {r.thenNow >= 1 ? r.thenNow.toFixed(1) : "." + Math.round(r.thenNow * 100)}×</span>}</td>
            <td className={"r " + (r.rMktNet > 0 ? "pos" : r.rMktNet < 0 ? "neg" : "dim")}>{r.rMktNet ? (r.rMktNet > 0 ? "+" : "−") + fmtTok(Math.abs(r.rMktNet)) : "—"}</td>
            <td className="r dim">{(r.rCtrWd > 0 || r.rWalIn > 0) ? [r.rCtrWd > 0 ? "vault " + fmtTok(r.rCtrWd) : null, r.rWalIn > 0 ? "wallet " + fmtTok(r.rWalIn) : null].filter(Boolean).join(" · ") : "—"}</td>
            <td className="r">{fmtTok(r.bal)}</td></tr>))}</tbody></table></div>
      <p className="foot">Bought in near launch, distributed millions at ≥{fmtUsd(d.high)} (into / around the $7.43 top). <b>"real market buy"</b> = tokens net-bought from the DEX pool during the rally (buys − sells); <b>"from vault / wallet"</b> = tokens received from a DeFi contract (a withdrawal) or another wallet (a shuffle / OTC) — which are <i>not</i> open-market demand. Owner-caught: counting vault withdrawals (e.g. the bcred contract) as buys had overstated the reaccumulation. <b>"bought then → now"</b> compares run-up accumulation to rally inflow; an <span style={{ color: C.amber }}>amber ratio</span> would flag a similar-size re-buy — but read it against the market-buy column, since much of "now" is withdrawals.</p>

      <div className="buy-h good" style={{ marginTop: 16 }}>▲ fresh wallets — showed up, bought big, still holding</div>
      <div className="tscroll"><table className="dtable"><thead><tr>
        <th>wallet</th><th>first ever</th><th className="r">bought</th><th className="r">bag</th><th>token seeded by</th><th>ETH funded by</th></tr></thead>
        <tbody>{fresh.slice(0, 25).map((r) => (
          <tr key={r.a}><td><Addr a={r.a} />{cw(r)}</td><td>{dt(r)}</td><td className="r pos">{money(r.firstBuyUsd)}</td>
            <td className="r">{fmtTok(r.bal)}</td><td>{r.seeder ? <Addr a={r.seeder} /> : <span className="dim">Uniswap / pool</span>}</td>
            <td>{efund(r)}</td></tr>))}</tbody></table></div>
      <p className="foot">No pepecoin history before the last few weeks, bought a large amount, haven't sold. <b>"token seeded by"</b> = who sent the first pepecoin; <b>"ETH funded by"</b> = who sent the wallet its first ETH (from the ETH graph). A real EOA in either column — especially the <i>same</i> address in both, or one shared across several rows — is a coordination tell. An exchange name (Coinbase, Binance…) is a normal self-custody withdrawal.</p>

      {fund && fund.covered > 0 && <>
        <div className="buy-h" style={{ marginTop: 16, color: C.cyan }}>◆ how the surfaced wallets were funded (ETH)</div>
        <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="ov-kpi"><div className="k">private-EOA funded</div><div className="v">{fmtNum(fund.private)}</div><div className="n">of {fmtNum(fund.covered)} resolved</div></div>
          <div className="ov-kpi"><div className="k">shared private funders</div><div className={"v " + (fund.sharedFunders ? "warn" : "")}>{fmtNum(fund.sharedFunders)}</div><div className="n">one address → 2+ wallets</div></div>
          <div className="ov-kpi"><div className="k">exchange-funded</div><div className="v">{fmtNum(fund.exchanges.reduce((a, e) => a + e.n, 0))}</div><div className="n">{fund.exchanges.slice(0, 3).map((e) => e.label + " " + e.n).join(" · ") || "—"}</div></div>
        </div>
      </>}

      {clusters.length > 0 && <>
        <div className="buy-h" style={{ marginTop: 16, color: C.cyan }}>◆ related wallets — clustered by token flow + ETH funding</div>
        {clusters.slice(0, 14).map((c) => {
          const via = [];
          if (c.seeders?.length) via.push("shared token seeder");
          if (c.ethFunders?.length) via.push("shared ETH funder");
          if (c.links?.length) via.push(c.links.length + " token transfer" + (c.links.length > 1 ? "s" : ""));
          return (
          <div className="clus" key={c.id}>
            <div className="clus-h">
              <span className="cid">group {c.id}</span>
              <span className="cmeta">{c.size} wallets</span>
              <span className="cmeta">sold near top {money(c.soldHigh)}</span>
              {(c.earlyBought > 0 || c.rallyBought > 0) && <span className="cmeta">bought {fmtTok(c.earlyBought)} then → <span style={{ color: c.rallyBought > 0 ? C.cyan : C.dim }}>{c.rallyBought > 0 ? fmtTok(c.rallyBought) : "—"}</span> now</span>}
              <span className="cmeta" style={{ color: c.rMktNet > 0 ? C.green : c.rMktNet < 0 ? C.warn : C.dim }}>real market buy {c.rMktNet ? (c.rMktNet > 0 ? "+" : "−") + fmtTok(Math.abs(c.rMktNet)) : "0"}</span>
              {c.rCtrWd > 0 && <span className="cmeta dim">vault withdraw {fmtTok(c.rCtrWd)}</span>}
              {via.length > 0 && <span className="cmeta" style={{ color: C.cyan }}>via {via.join(" + ")}</span>}
              {c.flagged && <span className="cflag">large — unverified</span>}
            </div>
            <div className="clus-b">{c.members.map((m) => (
              <div className="clus-row" key={m.a}>
                <Addr a={m.a} />{m.contract && <span title="smart contract, not a person" style={{ color: C.amber, fontSize: 9 }}>⚙</span>}
                <span className="cv">sold top {money(m.soldHigh)}</span>
                <span className={"cv" + (m.rMktNet > 0 ? "" : " neg")}>{m.rMktNet > 0 ? "mkt-buy +" + fmtTok(m.rMktNet) : m.rCtrWd > 0 ? "vault withdraw " + fmtTok(m.rCtrWd) : m.bal > 0 ? "holding " + fmtTok(m.bal) : "out"}</span>
                {m.seeder && <span className="clus-why">token ← {shortAddr(m.seeder)}</span>}
                {m.ethFunder && <span className="clus-why">ETH ← {m.ethLabel || shortAddr(m.ethFunder)}</span>}
              </div>))}
            </div>
          </div>);
        })}
        <p className="foot">Wallets grouped when they share a common pepecoin seeder, moved tokens between each other, <b>or share a private ETH funder</b> (one address sent several of them their first ETH — the token graph can't see this). Exchange funders and distributor-scale addresses never fuse a group, so one hot wallet or router can't merge the graph. A group linked by <i>both</i> a shared token seeder and a shared ETH funder is near-certain common control — still evidence, not courtroom proof.</p>
      </>}

      {reent.length > 0 && <>
        <div className="buy-h warn" style={{ marginTop: 16 }}>▼ sold out entirely, buying back (prior realized ≥ ${(d.minReentry || 5000) / 1000}k)</div>
        <div className="tscroll"><table className="dtable"><thead><tr><th>wallet</th><th className="r">prior realized</th><th className="r">ROI</th><th className="r">bought back 30d</th><th className="r">bag</th></tr></thead>
          <tbody>{reent.slice(0, 15).map((r) => (
            <tr key={r.a}><td><Addr a={r.a} /></td><td className="r pos">{money(r.realized)}</td><td className="r">{r.roi}×</td>
              <td className="r pos">+{fmtTok(r.d30)}</td><td className="r">{fmtTok(r.bal)}</td></tr>))}</tbody></table></div>
      </>}

      <p className="foot">Realized P&amp;L = matched buy→sell round-trips (FIFO), cost basis = the market price on the acquisition day. All reconstructed from public transfers — reproducible, $0. None of this is proof of coordination on its own; it's the evidence, laid out to judge.</p>
    </div>
  );
}

const ES = (a) => <a href={`https://etherscan.io/address/${a}`} target="_blank" rel="noreferrer" title="open on Etherscan" style={{ color: C.dim, marginLeft: 6, fontSize: 10 }}>etherscan ↗</a>;
const CATMETA = {
  returning: { label: "returning", color: C.cyan, note: "a person who had sold out and re-entered" },
  primed: { label: "operator-primed", color: C.warn, note: "bought on the market then forwarded the tokens straight into the staging cohort — markup plumbing, not real demand" },
  routed: { label: "routed retail", color: C.lime, note: "aggregated retail through a DEX router (MetaMask / Uniswap / Paraswap / 0x)" },
  new: { label: "new wallet", color: C.green, note: "a person's first-ever pepecoin, in the rally" },
  existing: { label: "existing holder", color: C.dim, note: "a person who already held, added more" },
  insider: { label: "insider", color: C.warn, note: "one of the early-sell cohort" },
  mm: { label: "MM / arb bot", color: C.amber, note: "market-maker or arbitrage bot — likely mirroring a CEX move" },
  vault: { label: "vault", color: C.amber, note: "a DeFi protocol contract" },
  contract: { label: "contract", color: C.amber, note: "an unverified contract" },
  cex: { label: "exchange", color: C.dim, note: "a CEX wallet" },
};
export function RallyPanel() {
  const feed = useJson("smart-money.json");
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading… (regenerates on the next daily run)</div>;
  const d = feed.data, r = d.rally;
  if (!r) return <div className="cstate">the rally breakdown regenerates on the next daily run.</div>;
  const infra = new Set(["routed", "mm", "vault", "contract"]);
  const catTag = (c) => { const m = CATMETA[c] || { label: c, color: C.dim }; return <span title={m.note} style={{ color: m.color, fontSize: 10.5 }}>{infra.has(c) ? "⚙ " : ""}{m.label}</span>; };
  const insiderPct = (r.byCat.find((c) => c.cat === "insider") || {}).pct || 0;
  const opPct = r.operatorNet != null && r.totNet ? Math.round(100 * r.operatorNet / r.totNet) : insiderPct;
  const retailPct = 100 - opPct;
  return (
    <div>
      <p className="q">Who actually pushed the price up in this rally — every wallet that <b>net-bought on the DEX</b> since {r.from}, ranked and classified. Contract buyers are labelled (a smart-account wallet is a person; a router is aggregated retail; an arb bot is not). Click any address for its full buy/sell history, or open it on Etherscan.</p>
      <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="ov-kpi"><div className="k">net pulled from pool</div><div className="v">{money(r.poolOutUsd)}</div><div className="n">{fmtTok(r.poolOutNet)} tokens — that's all it took</div></div>
        <div className="ov-kpi"><div className="k">distinct net buyers</div><div className="v">{fmtNum(r.buyers)}</div><div className="n">a crowd, not one whale</div></div>
        <div className="ov-kpi"><div className="k">top 10 buyers</div><div className="v">{r.top10Pct}%</div><div className="n">top one just {r.top1Pct}%</div></div>
        <div className="ov-kpi"><div className="k">operator-adjacent</div><div className="v warn">{opPct}%</div><div className="n">insiders + primed sock-puppets</div></div>
      </div>

      <div className="ov-lead" style={{ margin: "0 2px 14px" }}>
        The price 4×'d on only <b>{money(r.poolOutUsd)}</b> of net tokens leaving a thin pool — that's all it took. It came from <b>{r.buyers} dispersed wallets</b> (top buyer just {r.top1Pct}%), not one actor. After resolving contract buyers <i>and</i> subtracting <b style={{ color: C.warn }}>buy-then-route sock-puppets</b> that marked price up to feed the staged bag, the split is <b style={{ color: C.lime }}>~{retailPct}% genuine retail</b> (~{money((r.retailNet || 0) * d.spot)}) vs <b style={{ color: C.warn }}>~{opPct}% operator-adjacent</b> (~{money((r.operatorNet || 0) * d.spot)} — insiders + primers). Real retail did most of the buying; the operators lit the fuse and are staged to sell into it.
      </div>

      <div className="buy-h" style={{ color: C.cyan }}>◆ net market buying by who</div>
      <div className="tscroll"><table className="dtable"><thead><tr><th>category</th><th className="r">wallets</th><th className="r">net bought</th><th className="r">share</th></tr></thead>
        <tbody>{r.byCat.map((c) => (
          <tr key={c.cat}><td>{catTag(c.cat)}</td><td className="r">{fmtNum(c.n)}</td><td className="r pos">{money(c.usd)}</td>
            <td className="r"><b style={{ color: (CATMETA[c.cat] || {}).color || C.tx }}>{c.pct}%</b></td></tr>))}</tbody></table></div>
      <p className="foot"><b>routed retail</b> = end-users buying through a DEX router/aggregator (labelled per contract — MetaMask Spender, UniversalRouter, Paraswap AugustusV6, 0x MainnetSettler). <b>returning</b> = people who sold out and re-entered (incl. smart-account/EIP-7702 wallets). <b>new</b> = first-ever buyers. <b>insider</b> = the early-sell cohort. Contract buyers were resolved via on-chain metadata, so a smart-account wallet counts as a person and a bot doesn't.</p>

      <div className="buy-h good" style={{ marginTop: 16 }}>▲ the top buyers — check any of them</div>
      <div className="tscroll"><table className="dtable"><thead><tr><th>#</th><th>wallet</th><th>type / label</th><th className="r">net bought</th><th className="r">~$</th><th className="r">bag now</th></tr></thead>
        <tbody>{r.top.slice(0, 40).map((b, i) => (
          <tr key={b.a}><td className="dim">{i + 1}</td>
            <td><Addr a={b.a} />{ES(b.a)}</td>
            <td>{catTag(b.cat)}{b.ctrLabel && <span className="dim" style={{ fontSize: 10 }}> · {b.ctrLabel}</span>}</td>
            <td className="r pos">+{fmtTok(b.net)}</td><td className="r">{money(b.usd)}</td><td className="r">{fmtTok(b.bag)}</td></tr>))}</tbody></table></div>
      <p className="foot">Ranked by net tokens bought from the pool during the rally (buys − sells). Click the address to open its full buy/sell timeline over the price line, or "etherscan ↗" to verify it yourself. Router rows (UniversalRouter, Spender…) are <i>aggregated</i> retail flowing through that router, not one buyer. The near-total absence of MM/arb-bot buyers means the move wasn't a CEX-arb echo — it was real on-chain retail.</p>
    </div>
  );
}

const WATCHMETA = {
  staging: { color: C.amber, tag: "STAGING", line: "Loaded, not fired." },
  distributing: { color: C.warn, tag: "DISTRIBUTING", line: "They're offloading — the exits are moving." },
  accumulating: { color: C.green, tag: "ACCUMULATING", line: "Net buying on the open market." },
  quiet: { color: C.dim, tag: "QUIET", line: "Little net movement." },
};
export function InsiderWatchPanel() {
  const feed = useJson("insider-watch.json");
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading… (regenerates on the next daily run)</div>;
  const w = feed.data, m = WATCHMETA[w.status] || WATCHMETA.quiet;
  const daily = (w.daily || []).map((x) => ({ t: Date.parse(x.d), bought: x.bought, out: -(x.soldPool + x.toCex), net: x.net }));
  const usd = (t) => money(t * w.spot);
  const tf = (t) => new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div>
      <p className="q">The forward tripwire on the early-seller + coordinated-cluster cohort ({w.cohortSize} wallets). They've consolidated a big bag without selling — so the question is what they do <b>next</b>. This watches their outflows daily and arms if they start moving to exchanges. Every wallet is clickable + on Etherscan.</p>

      <div style={{ border: "1px solid " + m.color, background: "#0c1510", padding: "12px 14px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
        <span style={{ color: m.color, fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, letterSpacing: ".04em" }}>● {m.tag}</span>
        <span style={{ color: C.tx, fontSize: 13 }}>{m.line}</span>
        <span style={{ color: w.tripwire.armed ? C.warn : C.dim, fontFamily: "var(--mono)", fontSize: 11, marginLeft: "auto" }}>tripwire: {w.tripwire.armed ? "⚠ ARMED" : "not armed"} · to-exchange 7d: {fmtTok(w.tripwire.toCexRecent7d)}</span>
      </div>
      <p className="foot" style={{ marginTop: -8 }}>{w.why}. Window: last {w.days} days.</p>

      <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="ov-kpi"><div className="k">net bag change</div><div className={"v " + (w.totals.net >= 0 ? "good" : "warn")}>{w.totals.net >= 0 ? "+" : "−"}{money(Math.abs(w.totals.net) * w.spot)}</div><div className="n">{fmtTok(w.totals.net)} tokens</div></div>
        <div className="ov-kpi"><div className="k">bought on market</div><div className="v">{money(w.totals.bought * w.spot)}</div><div className="n">real DEX buys</div></div>
        <div className="ov-kpi"><div className="k">sold on DEX</div><div className="v">{money(w.totals.soldPool * w.spot)}</div><div className="n">two-way churn</div></div>
        <div className="ov-kpi"><div className="k">→ exchanges</div><div className={"v " + (w.totals.toCex > 0 ? "warn" : "")}>{money(w.totals.toCex * w.spot)}</div><div className="n">the offload tell</div></div>
      </div>

      <div className="buy-h" style={{ color: C.cyan }}>◆ daily flow — in (green) vs out to DEX/exchange (red)</div>
      <div style={{ width: "100%", height: 240 }}><ResponsiveContainer>
        <ComposedChart data={daily} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} stackOffset="sign">
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={tf} stroke={AXIS} minTickGap={40} />
          <YAxis tickFormatter={(v) => fmtTok(v)} stroke={AXIS} width={54} />
          <Tooltip content={Tip((v) => fmtTok(v) + " · " + usd(Math.abs(v)), (t) => tf(t))} />
          <ReferenceLine y={0} stroke={AXIS} />
          <Bar {...noAnim} dataKey="bought" name="bought" fill={C.green} stackId="s" />
          <Bar {...noAnim} dataKey="out" name="sold / to-exchange" fill={C.warn} stackId="s" />
        </ComposedChart>
      </ResponsiveContainer></div>
      <p className="foot">Bars above 0 = tokens flowing INTO the cohort (market buys); below 0 = flowing OUT (DEX sells + exchange deposits). A cohort that is staging shows little of either; a wall of red — especially exchange deposits — is distribution starting.</p>

      <div className="buy-h good" style={{ marginTop: 16 }}>▲ the cohort — sorted by exit activity, check any of them</div>
      <div className="tscroll"><table className="dtable"><thead><tr><th>wallet</th><th className="r">net (window)</th><th className="r">bought</th><th className="r">sold DEX</th><th className="r">→ exch</th><th className="r">→ fresh</th><th className="r">bag</th></tr></thead>
        <tbody>{(w.wallets || []).slice(0, 30).map((r) => (
          <tr key={r.a}><td><Addr a={r.a} />{ES(r.a)}</td>
            <td className={"r " + (r.net >= 0 ? "pos" : "neg")}>{r.net >= 0 ? "+" : "−"}{fmtTok(Math.abs(r.net))}</td>
            <td className="r">{r.bought ? fmtTok(r.bought) : "—"}</td>
            <td className={"r " + (r.soldPool ? "neg" : "dim")}>{r.soldPool ? fmtTok(r.soldPool) : "—"}</td>
            <td className={"r " + (r.toCex ? "neg" : "dim")}>{r.toCex ? fmtTok(r.toCex) : "—"}</td>
            <td className={"r " + (r.toFresh ? "" : "dim")}>{r.toFresh ? fmtTok(r.toFresh) : "—"}</td>
            <td className="r">{fmtTok(r.bag)}</td></tr>))}</tbody></table></div>
      <p className="foot">"→ exch" is the column to watch: a cohort wallet depositing to a CEX is the clearest sign it's about to sell. Click any address for its full buy/sell timeline over the price line, or "etherscan ↗" to verify. This regenerates daily — the status flips the moment the exits move.</p>
    </div>
  );
}

// ── Coordination Map: the operator cohort as bubbles (sized by capital) + connectors (shared funder / seeder /
//    token transfer / buy-then-route). Hover a bubble for its capital card; click to open its full history.
const GHASH = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const EDGEC = { fund: C.amber, seed: C.cyan, xfer: "#5fbf87", route: C.warn };
function buildGraph(sm, cap) {
  const cyc = new Set((sm.cycle || []).map((r) => r.a));
  const nodes = new Map(), edges = [];
  const capOf = (a) => cap?.wallets?.[a];
  const addW = (a, role, cluster) => { let n = nodes.get(a); if (!n) { const c = capOf(a); nodes.set(a, n = { id: a, kind: role, cluster, cap: c?.capUsd || 0, holds: c?.holds || {}, top: c?.top || [], eth: c?.ethUsd || 0, whale: c?.whale }); } else if (role === "insider") n.kind = "insider"; return n; };
  const addH = (id, label) => { let n = nodes.get(id); if (!n) nodes.set(id, n = { id, kind: "hub", label, cap: 0, holds: {} }); return n; };
  for (const c of sm.clusters || []) {
    for (const m of c.members) addW(m.a, cyc.has(m.a) ? "insider" : "member", c.id);
    for (const sd of c.seeders || []) { const h = addH("seed:" + sd, sd); for (const m of c.members) if (m.seeder === sd) edges.push({ a: m.a, b: h.id, kind: "seed" }); }
    for (const f of c.ethFunders || []) { const h = addH("fund:" + f, f); for (const m of c.members) if (m.ethFunder === f) edges.push({ a: m.a, b: h.id, kind: "fund" }); }
    for (const [f, t] of c.links || []) edges.push({ a: f, b: t, kind: "xfer" });
  }
  for (const r of sm.cycle || []) if (!nodes.has(r.a)) addW(r.a, "insider", null);
  for (const p of sm.rally?.primed || []) { addW(p.a, "primed", null); if (p.to && nodes.has(p.to)) edges.push({ a: p.a, b: p.to, kind: "route" }); }
  const N = [...nodes.values()], idx = new Map(N.map((n) => [n.id, n]));
  const W = 820, H = 560;
  N.forEach((n, i) => { const h = GHASH(n.id); n.x = W / 2 + Math.cos(h) * (40 + (i % 19) * 17); n.y = H / 2 + Math.sin(h * 1.7) * (40 + (i % 13) * 17); n.vx = 0; n.vy = 0; n.r = n.kind === "hub" ? 4 : Math.max(6, Math.min(26, 6 + Math.sqrt((n.cap || 0) / 900))); });
  const E = edges.filter((e) => idx.has(e.a) && idx.has(e.b));
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 320;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const a = N[i], b = N[j]; let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 1; const d = Math.sqrt(d2); const f = 2600 / d2; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
    for (const e of E) { const a = idx.get(e.a), b = idx.get(e.b); let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1; const f = (d - 58) * 0.03; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
    for (const n of N) { n.vx += (W / 2 - n.x) * 0.004; n.vy += (H / 2 - n.y) * 0.004; n.x += n.vx * cool * 0.5; n.y += n.vy * cool * 0.5; n.vx *= 0.82; n.vy *= 0.82; n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x)); n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y)); }
  }
  return { nodes: N, edges: E, idx, W, H };
}
export function CohortMapPanel() {
  const feed = useJson("smart-money.json");
  const capFeed = useJson("wallet-capital.json");
  const xFeed = useJson("crosstoken.json");
  const g = useMemo(() => (feed.data ? buildGraph(feed.data, capFeed.data) : null), [feed.data, capFeed.data]);
  const xt = xFeed.data;
  const xrole = (a) => xt?.wallets?.[a];
  const XR = { "sold-top": { t: "bought early → sold the top", c: C.warn }, holding: { t: "holding", c: C.cyan }, traded: { t: "traded", c: C.dim } };
  const [hover, setHover] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrap = useRef(null);
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!g) return <div className="cstate">loading…</div>;
  const ov = capFeed.data?.overlap;
  const fill = (n) => n.kind === "insider" ? C.warn : n.kind === "primed" ? C.amber : n.kind === "member" ? C.cyan : "#39434f";
  const ring = (n) => { const x = xrole(n.id); const gme = n.holds?.gme || x?.gme, booe = n.holds?.booe || x?.booe; return gme && booe ? "#fbbf24" : gme ? C.lime : booe ? "#a78bfa" : null; };
  const onMove = (e) => { const b = wrap.current?.getBoundingClientRect(); if (b) setPos({ x: e.clientX - b.left, y: e.clientY - b.top }); };
  return (
    <div>
      <p className="q">The operator cohort as a map. Each <b>bubble is a wallet</b>, sized by the <b>capital it controls</b>; <b>lines are the links</b> that tie them — a shared ETH funder, a shared token seeder, a direct transfer, or a buy-then-route feed. Bubbles ringed <span style={{ color: C.lime }}>green</span> also hold <b>GME</b>, <span style={{ color: "#a78bfa" }}>purple</span> hold <b>BOOE</b>. Hover for the wallet's holdings; click to open it.</p>
      {ov && <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="ov-kpi"><div className="k">cohort capital</div><div className="v">{money(capFeed.data.totalCapUsd)}</div><div className="n">across {ov.total} wallets</div></div>
        <div className="ov-kpi"><div className="k">also traded GME</div><div className="v" style={{ color: C.lime }}>{xt?.summary?.gme?.traded ?? ov.gme}</div><div className="n">{xt?.summary?.gme ? `${xt.summary.gme.soldTop} bought-early→sold-top` : "hold now"}</div></div>
        <div className="ov-kpi"><div className="k">also traded BOOE</div><div className="v" style={{ color: "#a78bfa" }}>{xt?.summary?.booe?.traded ?? ov.booe}</div><div className="n">{xt?.summary?.booe ? `${xt.summary.booe.soldTop} sold-top` : "hold now"}</div></div>
        <div className="ov-kpi"><div className="k">links drawn</div><div className="v">{fmtNum(g.edges.length)}</div><div className="n">funder / seeder / xfer / route</div></div>
      </div>}
      {xt?.summary?.gme && <div className="ov-lead" style={{ margin: "0 2px 12px" }}>
        <b>Same playbook, other tokens.</b> Of this cohort, <b style={{ color: C.lime }}>{xt.summary.gme.traded}</b> also traded <b>GME</b> (which topped {xt.tokens.gme.ath}, now −{xt.tokens.gme.downFromAth}%) and <b style={{ color: C.warn }}>{xt.summary.gme.soldTop} bought it early and sold into that top</b> (~{money(xt.summary.gme.soldTopUsd)}){xt.summary.booe?.traded ? <>; <b style={{ color: "#a78bfa" }}>{xt.summary.booe.traded}</b> traded BOOE ({xt.summary.booe.soldTop} sold-top)</> : ""}. The same wallets, running the same buy-early → sell-top cycle across tokens — hover a ringed bubble to see its role.
      </div>}
      <div className="glegend">
        <span><i className="gd" style={{ background: C.warn }} />insider</span>
        <span><i className="gd" style={{ background: C.cyan }} />cluster wallet</span>
        <span><i className="gd" style={{ background: C.amber }} />primed sock-puppet</span>
        <span><i className="gd" style={{ background: "#39434f" }} />funder / seeder</span>
        <span><b style={{ color: EDGEC.fund }}>—</b> ETH funder</span>
        <span><b style={{ color: EDGEC.seed }}>—</b> token seeder</span>
        <span><b style={{ color: EDGEC.xfer }}>—</b> transfer</span>
        <span><b style={{ color: EDGEC.route }}>—</b> buy→route</span>
      </div>
      <div ref={wrap} className="gwrap" onMouseMove={onMove}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {g.edges.map((e, i) => { const a = g.idx.get(e.a), b = g.idx.get(e.b); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGEC[e.kind]} strokeWidth={e.kind === "route" ? 1.6 : 1} strokeOpacity={0.5} strokeDasharray={e.kind === "route" ? "4 3" : undefined} />; })}
          {g.nodes.map((n) => { const rc = ring(n); return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: n.kind === "hub" ? "default" : "pointer" }}
               onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover((h) => (h === n ? null : h))}
               onClick={() => n.kind !== "hub" && openWin("wallet:" + n.id)}>
              {n.kind === "hub"
                ? <rect x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} transform="rotate(45)" fill={fill(n)} stroke="#1a222c" />
                : <circle r={n.r} fill={fill(n)} fillOpacity={0.85} stroke={rc || "#0c1510"} strokeWidth={rc ? 2.2 : 1} />}
            </g>); })}
        </svg>
        {hover && <div className="gcard" style={{ left: Math.min(pos.x + 14, 560), top: pos.y + 12 }}>
          {hover.kind === "hub"
            ? <><div className="gc-h">{hover.id.startsWith("fund:") ? "ETH funder" : "token seeder"}</div><div className="gc-a">{shortAddr(hover.label)}</div><div className="gc-n">funds/seeds multiple cohort wallets — a shared parent = common control</div></>
            : <><div className="gc-h" style={{ color: fill(hover) }}>{hover.kind === "insider" ? "insider (early seller)" : hover.kind === "primed" ? "primed sock-puppet" : "cluster wallet"}</div>
                <div className="gc-a">{shortAddr(hover.id)}</div>
                <div className="gc-cap">{money(hover.cap)}<span className="gc-sub"> total capital</span></div>
                <div className="gc-row"><span>ETH</span><span>{money(hover.eth)}</span></div>
                {hover.holds?.pepe && <div className="gc-row"><span>PEPECOIN</span><span>{money(hover.holds.pepe.usd)}</span></div>}
                {hover.holds?.gme && <div className="gc-row" style={{ color: C.lime }}><span>GME</span><span>{money(hover.holds.gme.usd)}</span></div>}
                {hover.holds?.booe && <div className="gc-row" style={{ color: "#a78bfa" }}><span>BOOE</span><span>{money(hover.holds.booe.usd)}</span></div>}
                {xrole(hover.id)?.gme && <div className="gc-x" style={{ color: (XR[xrole(hover.id).gme.role] || {}).c }}>GME: {(XR[xrole(hover.id).gme.role] || {}).t}{xrole(hover.id).gme.soldTopUsd > 0 ? ` · sold-top ${money(xrole(hover.id).gme.soldTopUsd)}` : ""}</div>}
                {xrole(hover.id)?.booe && <div className="gc-x" style={{ color: (XR[xrole(hover.id).booe.role] || {}).c }}>BOOE: {(XR[xrole(hover.id).booe.role] || {}).t}{xrole(hover.id).booe.soldTopUsd > 0 ? ` · sold-top ${money(xrole(hover.id).booe.soldTopUsd)}` : ""}</div>}
                {hover.whale && <div className="gc-n" style={{ color: C.amber }}>⚑ large blue-chip holdings — likely a whale / infra wallet, capital capped</div>}
                <div className="gc-n">click to open history · then Etherscan / Zerion</div></>}
        </div>}
      </div>
      <p className="foot">Capital + token holdings are read live from the chain (ETH + ERC-20 balances). A tight knot of bubbles joined by <span style={{ color: EDGEC.fund }}>funder</span> and <span style={{ color: EDGEC.seed }}>seeder</span> lines is one operator's fleet; a <span style={{ color: EDGEC.route }}>buy→route</span> line is a wallet that bought on the market and fed the staged bag. Rings show who's <i>also</i> in GME / BOOE — the same crew's other plays. Not proof of one owner; it's the network, drawn so you can trace it.</p>
      <SharedBags cohort={ov?.total} />
    </div>
  );
}
// ---- Multisig hub map: the Gnosis Safe + its direct recipients, Zerion-style card on hover ----
const HROLE = {
  hub: { c: C.warn, t: "Gnosis Safe multisig", d: "the operator treasury — top top-seller" },
  feeder: { c: C.amber, t: "primary recipient", d: "#1 wallet feeding the staged bag" },
  recipient: { c: C.cyan, t: "received from the Safe", d: "the Safe routed pepecoin here" },
  sender: { c: "#5fbf87", t: "sent into the Safe", d: "funded the Safe" },
  onward: { c: C.cyan, t: "onward from the feeder", d: "where the feeder sends next" },
  infeeder: { c: "#5fbf87", t: "sent into the feeder", d: "funded the feeder" },
};
function buildHubGraph(h) {
  const W = 820, H = 560;
  const infra = (n) => !!n.infra;
  const nodes = h.nodes.filter((n) => n.a).map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.a, n]));
  // per-node flow with the two hubs (for the hover card)
  const f = {};
  const bump = (a, k, v) => { (f[a] = f[a] || {})[k] = (f[a]?.[k] || 0) + v; };
  for (const e of h.edges) {
    if (e.to === h.hub) bump(e.from, "toHub", e.amt); if (e.from === h.hub) bump(e.to, "fromHub", e.amt);
    if (e.to === h.feeder) bump(e.from, "toFeeder", e.amt); if (e.from === h.feeder) bump(e.to, "fromFeeder", e.amt);
  }
  nodes.forEach((n) => { n.flow = f[n.a] || {}; });
  // collapse directed edges into unordered pairs for drawing (round-trips → one line, both amounts kept)
  const pmap = new Map();
  for (const e of h.edges) {
    const [x, y] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = x + "|" + y; let p = pmap.get(key);
    if (!p) pmap.set(key, p = { a: x, b: y, ab: 0, ba: 0 });
    if (e.from === x) p.ab += e.amt; else p.ba += e.amt;
  }
  const pairs = [...pmap.values()].filter((p) => byId.has(p.a) && byId.has(p.b)).map((p) => ({ ...p, amt: p.ab + p.ba, dir: p.ab && p.ba ? "bi" : p.ab ? "ab" : "ba" }));
  // seed positions: hub center, feeder just left, others by hash ring
  nodes.forEach((n, i) => {
    if (n.role === "hub") { n.x = W / 2; n.y = H / 2; }
    else if (n.role === "feeder") { n.x = W / 2 - 150; n.y = H / 2; }
    else { const g = GHASH(n.a); n.x = W / 2 + Math.cos(g) * (120 + (i % 11) * 22); n.y = H / 2 + Math.sin(g * 1.7) * (90 + (i % 7) * 22); }
    n.vx = 0; n.vy = 0;
    const base = infra(n) ? 6 : n.role === "hub" ? 20 : 8;
    n.r = infra(n) ? 6 : Math.max(9, Math.min(30, base + Math.sqrt((Math.max(n.capUsd || 0, n.bagUsd || 0)) / 700)));
  });
  const idx = byId, E = pairs;
  for (let it = 0; it < 340; it++) {
    const cool = 1 - it / 340;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 1; const d = Math.sqrt(d2); const fo = 3400 / d2; dx /= d; dy /= d; a.vx += dx * fo; a.vy += dy * fo; b.vx -= dx * fo; b.vy -= dy * fo; }
    for (const e of E) { const a = idx.get(e.a), b = idx.get(e.b); let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1; const fo = (d - 70) * 0.035; dx /= d; dy /= d; a.vx += dx * fo; a.vy += dy * fo; b.vx -= dx * fo; b.vy -= dy * fo; }
    for (const n of nodes) {
      if (n.role === "hub") { n.x = W / 2; n.y = H / 2; continue; } // pin the Safe at center
      n.vx += (W / 2 - n.x) * 0.005; n.vy += (H / 2 - n.y) * 0.005;
      n.x += n.vx * cool * 0.5; n.y += n.vy * cool * 0.5; n.vx *= 0.82; n.vy *= 0.82;
      n.x = Math.max(n.r + 6, Math.min(W - n.r - 6, n.x)); n.y = Math.max(n.r + 6, Math.min(H - n.r - 6, n.y));
    }
  }
  return { nodes, pairs, byId, W, H, hub: h.hub, feeder: h.feeder };
}
export function HubMapPanel() {
  const feed = useJson("hub.json");
  const g = useMemo(() => (feed.data ? buildHubGraph(feed.data) : null), [feed.data]);
  const [hover, setHover] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrap = useRef(null);
  const clearT = useRef(null);
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!g) return <div className="cstate">loading… (regenerates on the next daily run)</div>;
  const d = feed.data, t = d.totals;
  const tok = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : Math.round(v);
  const fill = (n) => n.infra ? "#39434f" : (HROLE[n.role]?.c || C.cyan);
  const ring = (n) => { const gme = n.holds?.gme, booe = n.holds?.booe; return gme && booe ? "#fbbf24" : gme ? C.lime : booe ? "#a78bfa" : null; };
  // interactive card: freeze it at the orb while hovered so the mouse can travel into it and click Zerion
  const enter = (n) => { if (clearT.current) { clearTimeout(clearT.current); clearT.current = null; } setHover(n); };
  const leave = () => { clearT.current = setTimeout(() => setHover(null), 160); };
  const onMove = (e) => { if (hover) return; const b = wrap.current?.getBoundingClientRect(); if (b) setPos({ x: e.clientX - b.left, y: e.clientY - b.top }); };
  const labelOf = (n) => n.role === "hub" ? d.hubLabel : n.infra ? n.infra : n.isContract ? (n.ctrLabel || "contract") : shortAddr(n.a);
  return (
    <div>
      <p className="q">The <b style={{ color: C.warn }}>multisig at the center of the operation</b> — a Gnosis Safe (<code>{shortAddr(d.hub)}</code>) that sold the most into the top — and every wallet it moves pepecoin <b>directly</b> with, plus one hop past its <b style={{ color: C.amber }}>primary recipient</b> (<code>{shortAddr(d.feeder)}</code>), which is also the #1 wallet feeding the staged bag today. <b>Hover any orb for its live portfolio card; click to open its full history</b> — every address is checkable on Etherscan / Zerion.</p>
      <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="ov-kpi"><div className="k">Safe sent out</div><div className="v warn">{money(t.hubOutUsd)}</div><div className="n">{tok(t.hubOut)} pepecoin</div></div>
        <div className="ov-kpi"><div className="k">Safe took in</div><div className="v">{money(t.hubInUsd)}</div><div className="n">{tok(t.hubIn)} pepecoin</div></div>
        <div className="ov-kpi"><div className="k">wallets in the ring</div><div className="v">{fmtNum(t.nodes)}</div><div className="n">direct + one hop</div></div>
        <div className="ov-kpi"><div className="k">flows drawn</div><div className="v">{fmtNum(t.edges)}</div><div className="n">Safe / feeder edges</div></div>
      </div>
      <div className="glegend">
        <span><i className="gd" style={{ background: C.warn }} />the Safe (multisig)</span>
        <span><i className="gd" style={{ background: C.amber }} />primary recipient</span>
        <span><i className="gd" style={{ background: C.cyan }} />received from Safe/feeder</span>
        <span><i className="gd" style={{ background: "#5fbf87" }} />sent into Safe/feeder</span>
        <span><i className="gd" style={{ background: "#39434f" }} />pool / vault / infra</span>
        <span><b style={{ color: C.lime }}>◦</b> also GME · <b style={{ color: "#a78bfa" }}>◦</b> BOOE</span>
      </div>
      <div ref={wrap} className="gwrap" onMouseMove={onMove}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <defs><marker id="hubarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={C.dim} /></marker></defs>
          {g.pairs.map((p, i) => { const a = g.byId.get(p.a), b = g.byId.get(p.b); const w = Math.max(0.8, Math.min(6, Math.sqrt(p.amt / 1e6) * 2.4));
            const src = p.dir === "ba" ? b : a, dst = p.dir === "ba" ? a : b; // arrow points to the net receiver
            return <line key={i} x1={src.x} y1={src.y} x2={dst.x} y2={dst.y} stroke={C.dim} strokeWidth={w} strokeOpacity={0.4}
              markerEnd={p.dir !== "bi" ? "url(#hubarrow)" : undefined} strokeDasharray={p.dir === "bi" ? "5 4" : undefined} />; })}
          {g.nodes.map((n) => { const rc = ring(n); return (
            <g key={n.a} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }}
               onMouseEnter={() => enter(n)} onMouseLeave={leave}
               onClick={() => openWin("wallet:" + n.a)}>
              {n.role === "hub"
                ? <rect x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} rx={3} fill={fill(n)} stroke="#0c1510" strokeWidth={2} />
                : n.isContract || n.infra
                  ? <rect x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} transform="rotate(45)" fill={fill(n)} fillOpacity={0.9} stroke={rc || "#0c1510"} strokeWidth={rc ? 2.2 : 1} />
                  : <circle r={n.r} fill={fill(n)} fillOpacity={0.88} stroke={rc || "#0c1510"} strokeWidth={rc ? 2.4 : 1} />}
              {(n.role === "hub" || n.role === "feeder") && <text y={n.r + 12} textAnchor="middle" fontSize={11} fill={fill(n)} fontWeight="700">{n.role === "hub" ? "SAFE" : "FEEDER"}</text>}
            </g>); })}
        </svg>
        {hover && <div className="gcard gcard-live" style={{ left: Math.min(pos.x + 14, 540), top: Math.min(pos.y + 12, 360), pointerEvents: "auto" }}
          onMouseEnter={() => enter(hover)} onMouseLeave={leave}>
          <div className="gc-h" style={{ color: fill(hover) }}>{HROLE[hover.role]?.t || "wallet"}</div>
          <div className="gc-a">{shortAddr(hover.a)}</div>
          {hover.infra
            ? <div className="gc-n">{hover.infra} — infrastructure ({hover.infraKind}), not a person</div>
            : <>
                {(hover.isContract) && <div className="gc-n" style={{ color: hover.ctrKind === "account" ? C.dim : C.amber }}>{hover.ctrKind === "account" ? "smart-account wallet (a person)" : "⚙ " + (hover.ctrLabel || "smart contract")}</div>}
                <div className="gc-cap">{hover.capUsd != null ? money(hover.capUsd) : "—"}<span className="gc-sub"> total capital</span></div>
                {hover.eth != null && <div className="gc-row"><span>ETH</span><span>{money(hover.ethUsd)}</span></div>}
                <div className="gc-row"><span>PEPECOIN bag</span><span>{tok(hover.bag)} · {money(hover.bagUsd)}</span></div>
                {hover.holds?.gme && <div className="gc-row" style={{ color: C.lime }}><span>GME</span><span>{money(hover.holds.gme.usd)}</span></div>}
                {hover.holds?.booe && <div className="gc-row" style={{ color: "#a78bfa" }}><span>BOOE</span><span>{money(hover.holds.booe.usd)}</span></div>}
              </>}
          {(hover.flow?.fromHub || hover.flow?.toHub) && <div className="gc-x" style={{ color: C.dim }}>with the Safe: {hover.flow.fromHub ? "← " + tok(hover.flow.fromHub) : ""}{hover.flow.fromHub && hover.flow.toHub ? " · " : ""}{hover.flow.toHub ? "→ " + tok(hover.flow.toHub) : ""}</div>}
          {(hover.flow?.fromFeeder || hover.flow?.toFeeder) && <div className="gc-x" style={{ color: C.dim }}>with the feeder: {hover.flow.fromFeeder ? "← " + tok(hover.flow.fromFeeder) : ""}{hover.flow.fromFeeder && hover.flow.toFeeder ? " · " : ""}{hover.flow.toFeeder ? "→ " + tok(hover.flow.toFeeder) : ""}</div>}
          <div className="gc-links"><a href={`https://app.zerion.io/${hover.a}/overview`} target="_blank" rel="noreferrer">Zerion ↗</a><a href={`https://etherscan.io/address/${hover.a}`} target="_blank" rel="noreferrer">Etherscan ↗</a></div>
        </div>}
      </div>
      <p className="foot">Reconstructed from public transfers (flows, exact) + live Blockscout balances (each card). The <b style={{ color: C.warn }}>Safe</b> and its <b style={{ color: C.amber }}>feeder</b> cycle millions of pepecoin back and forth (dashed = two-way) and fan it into a tight set of private wallets, a DeFi vault and the pool — the plumbing of one operation. A round-trip between two wallets isn't a market trade; it's a wallet moving its own bag. Signal, not proof — open any orb and verify it yourself. Not financial advice.</p>
    </div>
  );
}
function SharedBags({ cohort }) {
  const rf = useJson("radar.json");
  const cf = useJson("common-tokens.json");
  const radar = rf.data?.radar || [];
  const common = cf.data?.common || [];
  const dex = (a) => `https://dexscreener.com/ethereum/${a}`;
  const mc = (v) => v == null ? "?" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k";
  return (
    <>
      <div className="buy-h" style={{ marginTop: 14, color: C.amber }}>◆ under the radar — small tokens they're quietly buying</div>
      {radar.length ? <>
        <div className="tscroll"><table className="dtable"><thead><tr><th>token</th><th className="r">cohort</th><th className="r">mcap</th><th className="r">holders</th><th className="r">last buy</th><th></th></tr></thead>
          <tbody>{radar.slice(0, 16).map((t) => (
            <tr key={t.addr}><td><b style={{ color: t.recent ? C.amber : C.tx }}>{t.sym}</b> <span className="dim" style={{ fontSize: 10.5 }}>{t.name?.slice(0, 20)}</span></td>
              <td className="r"><b>{t.n}</b>{cohort ? <span className="dim"> / {cohort}</span> : ""}</td>
              <td className="r">{mc(t.mcap)}</td>
              <td className="r dim">{t.totalHolders ? fmtNum(t.totalHolders) : "?"}</td>
              <td className={"r " + (t.recent ? "pos" : "dim")}>{t.lastBuy || "—"}{t.recent ? " ⟵" : ""}</td>
              <td><a href={dex(t.addr)} target="_blank" rel="noreferrer" style={{ color: C.dim, fontSize: 10 }}>chart ↗</a></td></tr>))}</tbody></table></div>
        <p className="foot">Small, low-visibility tokens (≤{fmtNum(rf.data.thresholds.maxHolders)} holders, ≤{mc(rf.data.thresholds.maxMcap)} mcap) held by <b>≥{rf.data.thresholds.minCohort}</b> of the {rf.data.cohort} operator wallets — the opposite of their known plays. <b style={{ color: C.amber }}>Amber = a recent buy</b> (they're accumulating it now). A tiny token with several of this crew's wallets holding real, recent positions is a setup before it's visible — open the chart and check who's buying via the wallet drill-downs. Signal, not proof; DYOR.</p>
      </> : <p className="foot" style={{ marginTop: 4 }}>{rf.data ? "No small/obscure token is held by 3+ of the cohort right now — their shared bags are all large-cap / known names." : "scanning holdings…"}</p>}
      {common.length > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", color: C.dim, fontSize: 11, fontFamily: "var(--mono)" }}>▸ broader shared bags (incl. large caps)</summary>
        <div className="tscroll" style={{ marginTop: 6 }}><table className="dtable"><thead><tr><th>token</th><th className="r">cohort wallets</th><th className="r">held</th><th></th></tr></thead>
          <tbody>{common.slice(0, 14).map((t) => (
            <tr key={t.addr}><td>{t.sym} <span className="dim" style={{ fontSize: 10.5 }}>{t.name?.slice(0, 20)}</span></td>
              <td className="r">{t.n}{cohort ? <span className="dim"> / {cohort}</span> : ""}</td><td className="r">{money(t.usd)}</td>
              <td><a href={dex(t.addr)} target="_blank" rel="noreferrer" style={{ color: C.dim, fontSize: 10 }}>chart ↗</a></td></tr>))}</tbody></table></div>
      </details>}
    </>
  );
}

const OPPH = { accumulate: { c: C.green, t: "accumulate" }, distribute: { c: C.warn, t: "sell the top" }, restage: { c: C.amber, t: "re-stage now" } };
export function OperationPanel() {
  const feed = useJson("operation.json");
  const pf = useJson("price-series.json");
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading… (regenerates on the next daily run)</div>;
  const d = feed.data;
  const price = (pf.data?.series || []).map(([dt, p]) => ({ t: Date.parse(dt), price: p }));
  const byPhase = (ph) => (d.events || []).filter((e) => e.phase === ph).map((e) => ({ ...e }));
  const tf = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  const opTip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload.find((x) => x.payload && x.payload.w)?.payload; if (!p) return null;
    const m = OPPH[p.phase] || {};
    return <div className="tip" style={{ borderColor: m.c }}>
      <div className="td" style={{ color: m.c }}>{m.t}{p.src ? " · " + p.src : ""}</div>
      <div className="tr"><span>wallet</span><span>{shortAddr(p.w)}</span></div>
      <div className="tr"><span>{p.d}</span><span>{fmtUsd(p.price)}</span></div>
      <div className="tr"><span>amount</span><span>{fmtTok(p.qty)} · {money(p.usd)}</span></div>
      <div className="tr" style={{ color: C.dim }}><span /><span>click → open · Zerion</span></div>
    </div>;
  };
  const lab = (props) => { const { x, y, value } = props; if (!value) return null; return <text x={x} y={y - 9} fill="#cfe" fontSize={9} textAnchor="middle" fontFamily="var(--mono)">{value}</text>; };
  return (
    <div>
      <p className="q">The whole operation on one timeline — the operator cohort's real DEX activity over pepecoin's full price history. <b style={{ color: C.green }}>Green = they bought</b> near launch; <b style={{ color: C.warn }}>red = they sold into the top</b>; <b style={{ color: C.amber }}>amber = what they're re-staging now</b>. Each orb is sized by $ and tagged with the wallet — hover for who, click to open it (Etherscan / Zerion).</p>
      <div className="ov-kpis buyers" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="ov-kpi"><div className="k">① accumulated (pre-top)</div><div className="v" style={{ color: C.green }}>{money(d.totals.accumulateUsd)}</div><div className="n">bought near launch</div></div>
        <div className="ov-kpi"><div className="k">② distributed (the top)</div><div className="v warn">{money(d.totals.distributeUsd)}</div><div className="n">{fmtX(d.totals.distributeUsd / (d.totals.accumulateUsd || 1))} what they put in</div></div>
        <div className="ov-kpi"><div className="k">③ re-staging (now)</div><div className="v" style={{ color: C.amber }}>{money(d.totals.restageUsd)}</div><div className="n">since {d.rally}</div></div>
      </div>
      <div className="legend"><span><i className="dot" style={{ background: C.tx }} />price</span><span><i className="dot" style={{ background: C.green }} />accumulate</span><span><i className="dot" style={{ background: C.warn }} />sell the top</span><span><i className="dot" style={{ background: C.amber }} />re-stage now</span></div>
      <div style={{ width: "100%", height: 380 }}><ResponsiveContainer>
        <ComposedChart margin={{ top: 14, right: 14, bottom: 4, left: 6 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={tf} stroke={AXIS} minTickGap={44} />
          <YAxis type="number" dataKey="price" scale="log" domain={["auto", "auto"]} tickFormatter={fmtUsd} stroke={AXIS} width={64} allowDataOverflow />
          <ZAxis type="number" dataKey="usd" range={[24, 620]} />
          <Tooltip content={opTip} cursor={{ strokeDasharray: "3 3" }} />
          <ReferenceLine x={Date.parse(d.ath)} stroke={C.warn} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "top", fill: C.warn, fontSize: 10, position: "insideTopLeft" }} />
          <ReferenceLine x={Date.parse(d.rally)} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "rally", fill: C.amber, fontSize: 10, position: "insideTopRight" }} />
          <Line {...noAnim} type="monotone" data={price} dataKey="price" name="price" stroke={C.tx} strokeWidth={1.3} dot={false} strokeOpacity={0.6} />
          {["accumulate", "distribute", "restage"].map((ph) => (
            <Scatter key={ph} {...noAnim} data={byPhase(ph)} dataKey="price" fill={OPPH[ph].c} fillOpacity={0.62} stroke={OPPH[ph].c} onClick={(e) => e && e.w && openWin("wallet:" + e.w)} style={{ cursor: "pointer" }}>
              <LabelList dataKey="lab" content={lab} />
            </Scatter>))}
        </ComposedChart>
      </ResponsiveContainer></div>
      <p className="foot">Read left to right: a green field of buys near launch, a red field of sells in the {d.ath} top zone ({fmtX(d.totals.distributeUsd / (d.totals.accumulateUsd || 1))} what they accumulated — the profit), then the amber re-stage after the {d.rally} rally line. Same wallets, one cycle. Every orb is clickable to its full history; the tag is the wallet (open it for the Zerion card). Reconstructed from public transfers — reproducible.</p>
    </div>
  );
}

export function WalletDetail({ addr }) {
  const feed = useJson("smart-money.json");
  const pf = useJson("price-series.json");
  if (feed.err) return <div className="cstate err">could not load — {feed.err}</div>;
  if (!feed.data) return <div className="cstate">loading…</div>;
  const d = feed.data;
  const row = [...(d.cycle || []), ...(d.fresh || []), ...(d.cohort || []), ...(d.reentrants || []), ...(d.buysRecent || [])].find((r) => r.a === addr);
  const rb = !row && (d.rally?.top || []).find((b) => b.a === addr); // a rally-only buyer (not in a cohort) — still checkable
  const det = (d.detail || {})[addr];
  const buys = (det?.buys || []).map(([dt, p, q]) => ({ t: Date.parse(dt), p, q }));
  const sells = (det?.sells || []).map(([dt, p, q]) => ({ t: Date.parse(dt), p, q }));
  const price = (pf.data?.series || []).map(([dt, p]) => ({ t: Date.parse(dt), price: p }));
  // crop the price line to the wallet's active window (with padding) so the orbs aren't lost on a 3-yr axis
  const ts = [...buys, ...sells].map((e) => e.t);
  const lo = ts.length ? Math.min(...ts) - 20 * 864e5 : -Infinity, hi = ts.length ? Math.max(...ts) + 20 * 864e5 : Infinity;
  const pcrop = price.filter((p) => p.t >= lo && p.t <= hi);
  const tiles = row ? [
    ["realized P&L", money(row.realized), row.realized >= 0 ? "pos" : "neg"],
    ["realized ROI", row.roi + "×", "pos"],
    ["current bag", fmtTok(row.bal), ""],
    ["sold near top", money(row.soldHigh || 0), "pos"],
    ["real market buy (rally)", (row.rMktNet >= 0 ? "+" : "−") + fmtTok(Math.abs(row.rMktNet || 0)), row.rMktNet > 0 ? "pos" : row.rMktNet < 0 ? "neg" : "dim"],
    ["vault / wallet inflow", fmtTok((row.rCtrWd || 0) + (row.rWalIn || 0)), "dim"],
  ] : rb ? [
    ["net market buy (rally)", "+" + fmtTok(rb.net), "pos"],
    ["~ USD", money(rb.usd), "pos"],
    ["current bag", fmtTok(rb.bag), ""],
    ["type", (CATMETA[rb.cat] || {}).label || rb.cat, rb.cat === "contract" ? "" : "pos"],
    ["first seen", rb.first, ""],
    ["is a contract?", rb.contract ? "yes ⚙" : "no (EOA)", rb.contract ? "" : "pos"],
  ] : [];
  const tf = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  return (
    <div>
      <p className="q">Every buy (green) and sell (red) this wallet made, sized by amount, on the real price line. <a href={`https://etherscan.io/address/${addr}`} target="_blank" rel="noreferrer">Etherscan ↗</a> · <a href={`https://app.zerion.io/${addr}/overview`} target="_blank" rel="noreferrer">Zerion ↗</a></p>
      {row && (row.ethFunder || row.seeder) && <p className="foot" style={{ marginTop: -4 }}>
        {row.ethFunder && <>first ETH from {row.ethLabel ? <b>{row.ethLabel}</b> : <Addr a={row.ethFunder} />}{row.seeder ? " · " : ""}</>}
        {row.seeder && <>first pepecoin from <Addr a={row.seeder} /></>}
        {row.ethFunder && row.seeder && row.ethFunder === row.seeder && <b style={{ color: C.amber }}> — same address funded ETH & seeded tokens</b>}
      </p>}
      {(row || rb) && <div className="ov-kpis" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {tiles.map(([k, v, cls]) => <div className="ov-kpi" key={k}><div className="k">{k}</div><div className={"v " + cls}>{v}</div></div>)}
      </div>}
      <div className="legend"><span><i className="dot" style={{ background: C.tx }} />price</span><span><i className="dot" style={{ background: C.green }} />buys</span><span><i className="dot" style={{ background: C.warn }} />sells</span></div>
      <div style={{ width: "100%", height: 300 }}><ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} tickFormatter={tf} stroke={AXIS} minTickGap={40} allowDuplicatedCategory={false} />
          <YAxis type="number" dataKey="p" scale="log" domain={["auto", "auto"]} tickFormatter={fmtUsd} stroke={AXIS} width={62} allowDataOverflow />
          <ZAxis type="number" dataKey="q" range={[24, 420]} />
          <Tooltip content={Tip((v) => fmtUsd(v), (t) => new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }))} cursor={{ strokeDasharray: "3 3" }} />
          {row && row.avgCost > 0 && <ReferenceLine y={row.avgCost} stroke={C.dim} strokeDasharray="5 5" />}
          <Line {...noAnim} type="monotone" data={pcrop} dataKey="price" name="price" stroke={C.tx} strokeWidth={1.4} dot={false} strokeOpacity={0.65} />
          <Scatter {...noAnim} name="buys" data={buys} dataKey="p" fill={C.green} fillOpacity={0.7} />
          <Scatter {...noAnim} name="sells" data={sells} dataKey="p" fill={C.warn} fillOpacity={0.7} />
        </ComposedChart>
      </ResponsiveContainer></div>
      <p className="foot">White line = the real daily price. Dashed line = the wallet's average cost. Orbs sit on the day's price, sized by amount. {det ? "" : "Full history is captured for the surfaced wallets — open one from the Smart Money list."}</p>
    </div>
  );
}

const PANELS = { overview: OverviewPanel, buyers: BuyersPanel, about: AboutPanel, smart: SmartMoneyPanel, rally: RallyPanel, watch: InsiderWatchPanel, map: CohortMapPanel, op: OperationPanel, hub: HubMapPanel };
export function winContent(id) {
  if (id && id.startsWith("wallet:")) return <WalletDetail addr={id.slice(7)} />;
  const P = PANELS[id];
  if (P) return <P />;
  return chartEl(id);
}
