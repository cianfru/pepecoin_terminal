import { useEffect, useState } from "react";
import { useOnchain, last, fmtUsd, fmtNum, fmtPct, fmtX, fmtTok } from "./data.js";
import { GROUPS, CHARTS, FEATURED, chartById, chartsInGroup } from "./charts-catalog.js";
import { chartEl, Spark, SPARK } from "./charts.jsx";

const CA = "0xA9E8aCf069C58aEc8825542845Fd754e41a9489A";

// ── tiny query-string router (no dependency) ──
function parse() {
  const p = new URLSearchParams(location.search);
  return { view: p.get("view") || "home", chart: p.get("chart") || null };
}
function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    history.pushState({}, "", qs ? "?" + qs : location.pathname);
    setR(parse());
    window.scrollTo(0, 0);
  };
  return [r, go];
}

function Link({ to, className, children }) {
  const [, go] = useRouteCtx();
  const href = "?" + new URLSearchParams(Object.entries(to).filter(([, v]) => v)).toString();
  return <a href={href} className={className} onClick={(e) => { e.preventDefault(); go(to); }}>{children}</a>;
}

// share the router via module-level holder (single App instance)
let _go = () => {};
let _route = parse();
const useRouteCtx = () => [_route, _go];

function Nav({ route }) {
  return (
    <nav className="tnav">
      <Link to={{}} className="brand">pepecoin<span className="c">·</span>terminal</Link>
      <div className="tnav-links">
        <Link to={{}} className={route.view === "home" && !route.chart ? "on" : ""}>home</Link>
        <Link to={{ view: "charts" }} className={route.view === "charts" || route.chart ? "on" : ""}>charts</Link>
      </div>
    </nav>
  );
}

function Kpi({ k, v, n, cls }) {
  return <div className="kpi"><div className="k">{k}</div><div className={"v " + (cls || "")}>{v}</div>{n && <div className="n">{n}</div>}</div>;
}

function KpiStrip() {
  const { data: rows } = useOnchain();
  if (!rows) return <div className="kpis"><div className="kpi"><div className="k">loading…</div></div></div>;
  const c = last(rows);
  return (
    <div className="kpis">
      <Kpi k="price" v={fmtUsd(c.spot)} n={"as of " + c.d} />
      <Kpi k="realized cost basis" v={fmtUsd(c.rp)} n="avg held-coin cost" cls="good" />
      <Kpi k="MVRV" v={fmtX(c.mvrv)} n={c.mvrv < 1 ? "underwater" : "above cost"} cls={c.mvrv < 1 ? "warn" : "good"} />
      <Kpi k="supply in profit" v={fmtPct(c.sip)} n="of held supply" />
      <Kpi k="holders" v={fmtNum(c.holders)} n="ETH, ≥ dust" />
      <Kpi k="held 1y+" v={fmtPct(c.age[4])} n="diamond base" cls="good" />
      <Kpi k="top-100" v={fmtPct(c.top100)} n="concentration" />
      <Kpi k="held supply" v={fmtTok(c.heldTokens)} n="tokens, ex-infra" />
    </div>
  );
}

function Tile({ chart, rows }) {
  const sp = SPARK[chart.id];
  return (
    <Link to={{ chart: chart.id }} className="tile">
      <div className="tile-top"><span className="tile-title">{chart.title}</span><span className="tile-go">→</span></div>
      <div className="tile-blurb">{chart.blurb}</div>
      {sp ? <Spark rows={rows} pick={sp.pick} color={sp.color} /> : <div className="spark ph" />}
    </Link>
  );
}

function Home() {
  return (
    <>
      <KpiStrip />
      <p className="lead">
        An open, reproducible on-chain read on <b>pepecoin</b>. Every number is reconstructed from the
        public Ethereum transfer history with a local FIFO cost-basis engine — no black box.
        <Link to={{ view: "charts" }} className="lead-cta"> Browse all {CHARTS.length} charts →</Link>
      </p>
      <div className="featgrid">
        {FEATURED.map((c) => <div key={c.id}>{chartEl(c.id)}<Link to={{ chart: c.id }} className="feat-more">open {c.title} →</Link></div>)}
      </div>
      <p className="note">
        Data as of the latest daily refresh. On-chain reads are valuation / position statements, never buy
        or sell signals. Concentration is an upper bound while the infrastructure exclude list is verified.
      </p>
    </>
  );
}

function Gallery({ rows }) {
  return (
    <>
      <h1 className="page-h">Charts</h1>
      <p className="page-sub">{CHARTS.length} on-chain charts across {GROUPS.length} families. All reconstructed from public transfer data.</p>
      {GROUPS.map((g) => (
        <section key={g.id} className="grp">
          <div className="grp-h"><h2>{g.name}</h2><span>{g.blurb}</span></div>
          <div className="tilegrid">{chartsInGroup(g.id).map((c) => <Tile key={c.id} chart={c} rows={rows} />)}</div>
        </section>
      ))}
    </>
  );
}

function ChartPage({ id }) {
  const c = chartById(id);
  if (!c) return <div className="cstate err">unknown chart: {id}</div>;
  const siblings = chartsInGroup(c.group).filter((s) => s.id !== id);
  return (
    <>
      <Link to={{ view: "charts" }} className="back">← all charts</Link>
      {chartEl(id)}
      {siblings.length > 0 && (
        <div className="more">
          <span className="more-h">more in {GROUPS.find((g) => g.id === c.group).name.toLowerCase()}</span>
          <div className="more-links">{siblings.map((s) => <Link key={s.id} to={{ chart: s.id }} className="chip">{s.title}</Link>)}</div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [route, go] = useRoute();
  _go = go; _route = route;
  const { data: rows } = useOnchain();
  return (
    <div className="wrap">
      <Nav route={route} />
      <div className="ca">{CA} · Ethereum · 18 decimals · open &amp; reproducible</div>
      <hr className="hair" />
      {route.chart ? <ChartPage id={route.chart} /> : route.view === "charts" ? <Gallery rows={rows} /> : <Home />}
      <footer className="site-foot">
        pepecoin terminal · reconstructed from public Ethereum data · methodology open ·
        <span className="dim"> not financial advice</span>
      </footer>
    </div>
  );
}
