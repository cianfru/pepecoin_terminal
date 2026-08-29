import { useEffect, useState } from "react";

// Cached JSON loader — each feed fetched at most once across the whole app.
const _cache = new Map();
export function useJson(path) {
  const [state, setState] = useState(() => (_cache.has(path) ? { data: _cache.get(path), err: null } : { data: null, err: null }));
  useEffect(() => {
    if (_cache.has(path)) { setState({ data: _cache.get(path), err: null }); return; }
    let live = true;
    fetch(path)
      .then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); })
      .then((d) => { _cache.set(path, d); if (live) setState({ data: d, err: null }); })
      .catch((e) => { if (live) setState({ data: null, err: String(e.message || e) }); });
    return () => { live = false; };
  }, [path]);
  return state;
}

export const useOnchain = () => useJson("onchain.json");
export const last = (rows) => rows[rows.length - 1];

export const fmtUsd = (v) => {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(4);
  return "$" + v.toPrecision(2);
};
export const fmtNum = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString());
export const fmtTok = (v) => {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return Math.round(v).toLocaleString();
};
export const fmtPct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(d) + "%");
export const fmtX = (v, d = 2) => (v == null || !isFinite(v) ? "—" : v.toFixed(d) + "×");
export const shortAddr = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

export const shortDate = (d) => {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + " '" + String(dt.getUTCFullYear()).slice(2);
};
