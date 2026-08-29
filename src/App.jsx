import { useEffect, useRef, useState, useCallback } from "react";
import { useOnchain, last, fmtUsd } from "./data.js";
import { GROUPS, CHARTS, chartById, chartsInGroup } from "./charts-catalog.js";
import { winContent } from "./charts.jsx";

// icon (emoji) per window id
const ICON = {
  overview: "🖥️", buyers: "💰", about: "ℹ️",
  realized: "📉", mvrv: "⚖️", nupl: "🧮", supplyprofit: "💚",
  hodl: "🌊", lthsth: "⏳", holders: "👥", wealthtiers: "🪙",
  urpd: "🧱", urpdage: "🗺️",
  concentration: "🎯", gini: "📐", whales: "🐋", clusters: "🕸️",
  sopr: "🔁", nrpl: "💵", liveliness: "⚡", cexsupply: "🏦",
};
const TITLE = (id) => (id === "overview" ? "Overview" : id === "buyers" ? "Who's Buying" : id === "about" ? "About" : (chartById(id)?.title || id));
const DEFSIZE = (id) => (id === "overview" ? [740, 580] : id === "buyers" ? [760, 540] : id === "about" ? [480, 380] : id === "whales" || id === "clusters" ? [720, 520] : [680, 480]);

// desktop icons (curated)
const DESKTOP = ["overview", "buyers", "realized", "mvrv", "hodl", "urpd", "whales", "concentration", "about"];

const useMobile = () => {
  const [m, setM] = useState(() => matchMedia("(max-width:720px), (pointer:coarse)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width:720px), (pointer:coarse)");
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on); window.addEventListener("resize", on);
    return () => { mq.removeEventListener("change", on); window.removeEventListener("resize", on); };
  }, []);
  return m;
};

// ── boot / login ──
const BOOT_LINES = [
  "PEPECOIN BIOS v4.20 — Plug and Pepe",
  "Detecting on-chain memory ......... 675,019 transfers OK",
  "FIFO cost-basis engine ............ OK",
  "Mounting /public/onchain.json ..... daily OK",
  "Loading valuation desktop ......... OK",
  "",
  "PEPECOIN Init Completed.",
];
function Boot({ onEnter }) {
  const [n, setN] = useState(0);
  useEffect(() => { if (n >= BOOT_LINES.length) return; const t = setTimeout(() => setN(n + 1), n === 0 ? 250 : 230); return () => clearTimeout(t); }, [n]);
  const done = n >= BOOT_LINES.length;
  if (done) return (
    <div className="boot-enter" onClick={onEnter}>
      <div className="enter-card">
        <div className="frog">🐸</div>
        <div className="ttl">Pepecoin Terminal</div>
        <div className="sb">open · reproducible · on-chain valuation desktop</div>
        <button className="enter-btn" onClick={onEnter}>Enter ▸</button>
      </div>
    </div>
  );
  return (
    <div className="boot">
      {BOOT_LINES.slice(0, n).map((l, i) => <div className="bl" key={i}>{l}</div>)}
      <div className="bl cur" />
    </div>
  );
}

// ── one window ──
function Win({ w, mobile, focused, onFocus, onClose, onMin, onMax, onDrag, onResize }) {
  const style = mobile || w.max
    ? { left: 0, top: 0, right: 0, bottom: 0, zIndex: w.z }
    : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z };
  return (
    <div className={"win" + (w.min ? " min" : "") + ((mobile || w.max) ? " max" : "") + (focused ? "" : " blur")} style={style} onMouseDown={onFocus}>
      <div className="win-tb" onPointerDown={(e) => !mobile && !w.max && onDrag(e, w.id)} onDoubleClick={() => !mobile && onMax(w.id)}>
        <span className="win-ico">{ICON[w.id] || "▪"}</span>
        <span className="win-title">{TITLE(w.id)}</span>
        <span className="win-btns">
          <button className="wb" title="minimize" onClick={(e) => { e.stopPropagation(); onMin(w.id); }}>_</button>
          {!mobile && <button className="wb" title="maximize" onClick={(e) => { e.stopPropagation(); onMax(w.id); }}>▢</button>}
          <button className="wb x" title="close" onClick={(e) => { e.stopPropagation(); onClose(w.id); }}>✕</button>
        </span>
      </div>
      <div className="win-body">{winContent(w.id)}</div>
      {!mobile && !w.max && <div className="win-rz" onPointerDown={(e) => onResize(e, w.id)} />}
    </div>
  );
}

// ── start menu ──
function StartMenu({ onOpen, onClose }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={onClose} />
      <div className="smwrap" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head"><span className="frog">🐸</span><div><div className="who">pepecoin</div><div className="sub">valuation terminal</div></div></div>
        <div className="sm-scroll">
          <div className="sm-grp">desk</div>
          {["overview", "buyers", "about"].map((id) => (
            <div className="sm-item" key={id} onClick={() => onOpen(id)}>
              <span className="ig">{ICON[id]}</span><div><div className="it">{TITLE(id)}</div></div>
            </div>
          ))}
          {GROUPS.map((g) => (
            <div key={g.id}>
              <div className="sm-grp">{g.name}</div>
              {chartsInGroup(g.id).map((c) => (
                <div className="sm-item" key={c.id} onClick={() => onOpen(c.id)}>
                  <span className="ig">{ICON[c.id] || "▪"}</span>
                  <div><div className="it">{c.title}</div><div className="id">{c.blurb}</div></div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="sm-foot">{CHARTS.length} charts · reconstructed from public Ethereum data</div>
      </div>
    </>
  );
}

// ── taskbar ──
function Tray() {
  const { data: rows } = useOnchain();
  const [clk, setClk] = useState("");
  useEffect(() => { const t = setInterval(() => setClk(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })), 1000); setClk(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })); return () => clearInterval(t); }, []);
  let px = null, up = false;
  if (rows) { const c = last(rows); px = c.spot; up = rows.length > 1 && c.spot >= rows[rows.length - 2].spot; }
  return (
    <div className="tray">
      {px != null && <div className="px"><span className="lbl">PEPE </span><span className={up ? "up" : "dn"}>{fmtUsd(px)} {up ? "▲" : "▼"}</span></div>}
      <div className="clk">{clk}</div>
    </div>
  );
}

export default function App() {
  const mobile = useMobile();
  const [booted, setBooted] = useState(() => { try { return sessionStorage.getItem("pepe-booted") === "1"; } catch { return false; } });
  const [wins, setWins] = useState([]);
  const [start, setStart] = useState(false);
  const zc = useRef(10);
  const drag = useRef(null);

  const focus = useCallback((id) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zc.current, min: false } : w))), []);
  const open = useCallback((id) => {
    setStart(false);
    setWins((ws) => {
      const ex = ws.find((w) => w.id === id);
      if (ex) return ws.map((w) => (w.id === id ? { ...w, z: ++zc.current, min: false } : w));
      const [dw, dh] = DEFSIZE(id);
      const n = ws.length;
      const x = Math.min(60 + n * 28, Math.max(20, window.innerWidth - dw - 20));
      const y = Math.min(28 + n * 26, Math.max(10, window.innerHeight - dh - 90));
      return [...ws, { id, x, y, w: dw, h: dh, z: ++zc.current, min: false, max: mobile }];
    });
  }, [mobile]);
  const close = useCallback((id) => setWins((ws) => ws.filter((w) => w.id !== id)), []);
  const toggleMin = useCallback((id) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, min: !w.min } : w))), []);
  const toggleMax = useCallback((id) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, max: !w.max, z: ++zc.current } : w))), []);

  const startDrag = useCallback((e, id) => {
    e.preventDefault(); focus(id);
    const w = wins.find((x) => x.id === id); if (!w) return;
    drag.current = { id, type: "move", ox: e.clientX - w.x, oy: e.clientY - w.y };
  }, [wins, focus]);
  const startResize = useCallback((e, id) => {
    e.preventDefault(); e.stopPropagation(); focus(id);
    const w = wins.find((x) => x.id === id); if (!w) return;
    drag.current = { id, type: "resize", sx: e.clientX, sy: e.clientY, sw: w.w, sh: w.h };
  }, [wins, focus]);
  useEffect(() => {
    const move = (e) => {
      const d = drag.current; if (!d) return;
      setWins((ws) => ws.map((w) => {
        if (w.id !== d.id) return w;
        if (d.type === "move") return { ...w, x: Math.max(-w.w + 90, Math.min(window.innerWidth - 60, e.clientX - d.ox)), y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - d.oy)) };
        return { ...w, w: Math.max(320, d.sw + (e.clientX - d.sx)), h: Math.max(220, d.sh + (e.clientY - d.sy)) };
      }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const enter = () => { try { sessionStorage.setItem("pepe-booted", "1"); } catch {} setBooted(true); open("overview"); };
  // open overview on first desktop paint if nothing open (post-boot returns)
  useEffect(() => { if (booted && wins.length === 0) open("overview"); }, [booted]); // eslint-disable-line

  if (!booted) return <Boot onEnter={enter} />;

  const topId = wins.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]?.id;
  // on mobile only render the focused window
  const visible = mobile ? wins.filter((w) => w.id === topId && !w.min) : wins;

  return (
    <div className="os">
      <div className="desk">
        {!mobile && (
          <div className="icons">
            {DESKTOP.map((id) => (
              <div className="dicon" key={id} onClick={() => open(id)}>
                <div className="gl">{ICON[id]}</div><div className="lb">{TITLE(id)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="wm">
          {visible.map((w) => (
            <Win key={w.id} w={w} mobile={mobile} focused={w.id === topId}
              onFocus={() => focus(w.id)} onClose={close} onMin={toggleMin} onMax={toggleMax}
              onDrag={startDrag} onResize={startResize} />
          ))}
        </div>
      </div>

      {start && <StartMenu onOpen={open} onClose={() => setStart(false)} />}

      <div className="taskbar">
        <button className={"start" + (start ? " on" : "")} onClick={() => setStart((s) => !s)}>
          <span className="frog">🐸</span>start
        </button>
        <div className="tasks">
          {wins.map((w) => (
            <div key={w.id} className={"taskbtn" + (w.id === topId && !w.min ? " on" : "")}
              onClick={() => (w.id === topId && !w.min ? toggleMin(w.id) : focus(w.id))}>
              <span>{ICON[w.id] || "▪"}</span><span className="t">{TITLE(w.id)}</span>
            </div>
          ))}
        </div>
        <Tray />
      </div>
    </div>
  );
}
