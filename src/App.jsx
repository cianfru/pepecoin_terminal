import { useOnchain, last, fmtUsd, fmtNum, fmtPct, fmtX } from "./data.js";
import { RealizedPriceChart, MvrvChart, SupplyProfitChart, HodlWavesChart, ConcentrationChart } from "./charts.jsx";

const CA = "0xA9E8aCf069C58aEc8825542845Fd754e41a9489A";

function Kpi({ k, v, n, cls }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className={"v " + (cls || "")}>{v}</div>
      {n && <div className="n">{n}</div>}
    </div>
  );
}

export default function App() {
  const { rows, err } = useOnchain();

  return (
    <div className="wrap">
      <div className="mast">
        <h1>pepecoin&nbsp;·&nbsp;terminal</h1>
        <span className="sub">open · reproducible · on-chain</span>
      </div>
      <div className="ca">{CA} · Ethereum · 18 decimals</div>
      <hr className="hair" />

      {err && <div className="err">could not load on-chain data — {err}</div>}
      {!rows && !err && <div className="loading">loading on-chain data…</div>}

      {rows && (() => {
        const c = last(rows);
        return (
          <>
            <div className="kpis">
              <Kpi k="price" v={fmtUsd(c.spot)} n={"as of " + c.d} />
              <Kpi k="realized cost basis" v={fmtUsd(c.rp)} n="avg held-coin cost" cls="good" />
              <Kpi k="MVRV" v={fmtX(c.mvrv)} n={c.mvrv < 1 ? "holders underwater" : "above cost"} cls={c.mvrv < 1 ? "warn" : "good"} />
              <Kpi k="supply in profit" v={fmtPct(c.sip)} n="of held supply" />
              <Kpi k="holders" v={fmtNum(c.holders)} n="ETH, ≥ dust" />
              <Kpi k="held 1y+" v={fmtPct(c.age[4])} n="diamond base" cls="good" />
              <Kpi k="top-100" v={fmtPct(c.top100)} n="concentration" />
              <Kpi k="held supply" v={fmtNum(c.heldTokens / 1e6) + "M"} n="tokens, ex-infra" />
            </div>

            <RealizedPriceChart rows={rows} />
            <MvrvChart rows={rows} />
            <SupplyProfitChart rows={rows} />
            <HodlWavesChart rows={rows} />
            <ConcentrationChart rows={rows} />

            <p className="note">
              Every number here is reconstructed from the public Ethereum transfer history with a local FIFO
              cost-basis engine — no black box. Data as of {c.d}. On-chain reads are valuation/position
              statements, never buy or sell signals. Concentration figures are an upper bound while the
              infrastructure exclude list is still being verified.
            </p>
          </>
        );
      })()}
    </div>
  );
}
