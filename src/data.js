import { useEffect, useState } from "react";

// Loads the committed on-chain suite (public/onchain.json → served at /onchain.json).
// Every number the site shows comes from here, reconstructed by the local FIFO engine.
export function useOnchain() {
  const [state, setState] = useState({ rows: null, err: null });
  useEffect(() => {
    let live = true;
    fetch("onchain.json")
      .then((r) => { if (!r.ok) throw new Error(`onchain.json ${r.status}`); return r.json(); })
      .then((rows) => { if (live) setState({ rows, err: null }); })
      .catch((e) => { if (live) setState({ rows: null, err: String(e.message || e) }); });
    return () => { live = false; };
  }, []);
  return state;
}

export const last = (rows) => rows[rows.length - 1];

export const fmtUsd = (v) => {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(4);
  return "$" + v.toPrecision(2);
};
export const fmtNum = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString());
export const fmtPct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d) + "%");
export const fmtX = (v, d = 2) => (v == null || !isFinite(v) ? "—" : v.toFixed(d) + "×");

// Compact date for axis ticks: "Jan '24"
export const shortDate = (d) => {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + " '" + String(dt.getUTCFullYear()).slice(2);
};
