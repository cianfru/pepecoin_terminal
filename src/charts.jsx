import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { fmtUsd, fmtPct, fmtX, shortDate } from "./data.js";

const GRID = "#141b24";
const AXIS = "#5f6d7c";

export function ChartCard({ title, q, foot, legend, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {q && <p className="q">{q}</p>}
      {legend && (
        <div className="legend">
          {legend.map((l) => (
            <span key={l.label}><i className="dot" style={{ background: l.c }} />{l.label}</span>
          ))}
        </div>
      )}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
      {foot && <p className="foot">{foot}</p>}
    </section>
  );
}

const Tip = (fmt) => ({ active, payload, label }) =>
  active && payload && payload.length ? (
    <div className="tip">
      <div className="td">{label}</div>
      {payload.map((p) => (
        <div className="tr" key={p.name} style={{ color: p.color }}>
          <span>{p.name}</span><span>{fmt(p.value, p.name)}</span>
        </div>
      ))}
    </div>
  ) : null;

const xAxis = { dataKey: "d", tickFormatter: shortDate, stroke: AXIS, minTickGap: 44 };

// ── Realized price vs spot, with the crowd's-cost-basis floor zone (0.8× / 0.5× realized) ──
export function RealizedPriceChart({ rows }) {
  const data = rows.map((r) => ({ d: r.d, spot: r.spot, rp: r.rp, f8: r.rp * 0.8, f5: r.rp * 0.5 }));
  return (
    <ChartCard
      title="Realized price & floor"
      q="What did the average held coin cost — and where has price found support beneath it?"
      legend={[{ label: "price", c: "#dfe7ee" }, { label: "realized cost basis", c: "#4ade80" }, { label: "0.5–0.8× floor zone", c: "#fb7185" }]}
      foot="Realized price = average USD cost basis of every coin currently held (FIFO). The 0.5×–0.8× band is where price has historically found support — descriptive, not a promise."
    >
      <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xAxis} />
        <YAxis scale="log" domain={["auto", "auto"]} stroke={AXIS} tickFormatter={fmtUsd} width={62} allowDataOverflow />
        <Tooltip content={Tip((v) => fmtUsd(v))} />
        <Line isAnimationActive={false} type="monotone" dataKey="f5" name="0.5×" stroke="#fb7185" strokeDasharray="4 4" strokeWidth={1} dot={false} strokeOpacity={0.6} />
        <Line isAnimationActive={false} type="monotone" dataKey="f8" name="0.8×" stroke="#fb7185" strokeDasharray="4 4" strokeWidth={1} dot={false} strokeOpacity={0.6} />
        <Line isAnimationActive={false} type="monotone" dataKey="rp" name="realized cost basis" stroke="#4ade80" strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} type="monotone" dataKey="spot" name="price" stroke="#dfe7ee" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartCard>
  );
}

// ── MVRV: price ÷ realized price. <1 = holders underwater in aggregate ──
export function MvrvChart({ rows }) {
  const data = rows.map((r) => ({ d: r.d, mvrv: r.mvrv }));
  return (
    <ChartCard
      title="MVRV"
      q="Is the market above or below what holders paid? Below 1× means the average holder is underwater."
      foot="MVRV = price ÷ realized price. A reading well under 1× marks deep-value / capitulation territory (position, not signal)."
    >
      <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xAxis} />
        <YAxis stroke={AXIS} tickFormatter={(v) => v + "×"} width={46} />
        <Tooltip content={Tip((v) => fmtX(v))} />
        <ReferenceLine y={1} stroke="#93a1b0" strokeDasharray="5 5" />
        <Line isAnimationActive={false} type="monotone" dataKey="mvrv" name="MVRV" stroke="#22d3ee" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartCard>
  );
}

// ── Supply in profit ──
export function SupplyProfitChart({ rows }) {
  const data = rows.map((r) => ({ d: r.d, sip: r.sip }));
  return (
    <ChartCard
      title="Supply in profit"
      q="What share of held supply is sitting above its cost basis right now?"
      foot="Share of held coins whose FIFO cost basis is below the current price."
    >
      <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="sip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xAxis} />
        <YAxis stroke={AXIS} domain={[0, 100]} tickFormatter={(v) => v + "%"} width={44} />
        <Tooltip content={Tip((v) => fmtPct(v))} />
        <ReferenceLine y={50} stroke="#93a1b0" strokeDasharray="5 5" />
        <Area isAnimationActive={false} type="monotone" dataKey="sip" name="in profit" stroke="#4ade80" strokeWidth={2} fill="url(#sip)" />
      </AreaChart>
    </ChartCard>
  );
}

// ── HODL waves (age bands as % of held supply) ──
const AGE = [
  { key: "a0", label: "0–1m", c: "#fb7185" },
  { key: "a1", label: "1–3m", c: "#fbbf24" },
  { key: "a2", label: "3–6m", c: "#a3e635" },
  { key: "a3", label: "6–12m", c: "#4ade80" },
  { key: "a4", label: "1y+", c: "#22d3ee" },
];
export function HodlWavesChart({ rows }) {
  const data = rows.map((r) => ({ d: r.d, a0: r.age[0], a1: r.age[1], a2: r.age[2], a3: r.age[3], a4: r.age[4] }));
  return (
    <ChartCard
      title="HODL waves"
      q="How old is the held supply? A thick 1y+ band is a deep, patient holder base."
      legend={AGE.map((a) => ({ label: a.label, c: a.c }))}
      foot="Each coin bucketed by how long it has been held (FIFO acquisition age), as a share of held supply."
    >
      <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }} stackOffset="expand">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xAxis} />
        <YAxis stroke={AXIS} tickFormatter={(v) => Math.round(v * 100) + "%"} width={44} />
        <Tooltip content={Tip((v) => fmtPct(v))} />
        {AGE.map((a) => (
          <Area isAnimationActive={false} key={a.key} type="monotone" dataKey={a.key} name={a.label} stackId="1" stroke={a.c} fill={a.c} fillOpacity={0.55} strokeWidth={0.5} />
        ))}
      </AreaChart>
    </ChartCard>
  );
}

// ── Concentration: top-10 / top-100 share of held supply ──
export function ConcentrationChart({ rows }) {
  const data = rows.map((r) => ({ d: r.d, top10: r.top10, top100: r.top100 }));
  return (
    <ChartCard
      title="Concentration"
      q="How much of the held supply do the largest wallets control over time?"
      legend={[{ label: "top 10", c: "#fb7185" }, { label: "top 100", c: "#22d3ee" }]}
      foot="Share of held supply held by the largest N wallets, infrastructure (pools / CEX / burn) excluded. An upper bound while the exclude list is still being verified."
    >
      <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xAxis} />
        <YAxis stroke={AXIS} domain={[0, 100]} tickFormatter={(v) => v + "%"} width={44} />
        <Tooltip content={Tip((v) => fmtPct(v))} />
        <Line isAnimationActive={false} type="monotone" dataKey="top100" name="top 100" stroke="#22d3ee" strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} type="monotone" dataKey="top10" name="top 10" stroke="#fb7185" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartCard>
  );
}
