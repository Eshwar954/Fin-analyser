"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AnalyticsCharts from "../../components/AnalyticsCharts";

type PriceRow = { time: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null };
type History = { symbol: string; name: string; currency: string; exchange: string; country: string; rows: PriceRow[] };
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10); };
const intervals = new Set(["1m", "2m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"]);
const formatMoney = (value: number | null | undefined, currency: string) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value);

export default function AnalyticsClient({ initialSymbol, initialStart, initialEnd, initialInterval }: { initialSymbol: string; initialStart?: string; initialEnd?: string; initialInterval?: string }) {
  const symbol = initialSymbol.toUpperCase();
  const [start, setStart] = useState(initialStart && /^\d{4}-\d{2}-\d{2}$/.test(initialStart) ? initialStart : daysAgo(365));
  const [end, setEnd] = useState(initialEnd && /^\d{4}-\d{2}-\d{2}$/.test(initialEnd) ? initialEnd : today());
  const [interval, setInterval] = useState(initialInterval && intervals.has(initialInterval) ? initialInterval : "1d");
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ symbol, start, end, interval });
        const response = await fetch(`/api/market/history?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load analytics for this security.");
        setHistory(data);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setHistory(null);
          setError(cause instanceof Error ? cause.message : "Unable to load analytics for this security.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [symbol, start, end, interval]);

  const analytics = useMemo(() => {
    const rows = history?.rows ?? [];
    if (!rows.length) return null;
    const first = rows[0].close;
    const latest = rows.at(-1)!.close;
    let peak = rows[0].close;
    let maxDrawdown = 0;
    let bestReturn = -Infinity;
    let worstReturn = Infinity;
    for (let index = 1; index < rows.length; index++) {
      const previous = rows[index - 1].close;
      if (previous !== 0) {
        const observationReturn = (rows[index].close / previous) - 1;
        bestReturn = Math.max(bestReturn, observationReturn);
        worstReturn = Math.min(worstReturn, observationReturn);
      }
      peak = Math.max(peak, rows[index].close);
      if (peak !== 0) maxDrawdown = Math.min(maxDrawdown, (rows[index].close / peak) - 1);
    }
    return {
      first, latest,
      totalReturn: first ? (latest / first) - 1 : 0,
      periodHigh: Math.max(...rows.map((row) => row.high ?? row.close)),
      periodLow: Math.min(...rows.map((row) => row.low ?? row.close)),
      maxDrawdown,
      bestReturn: Number.isFinite(bestReturn) ? bestReturn : null,
      worstReturn: Number.isFinite(worstReturn) ? worstReturn : null,
      observations: rows.length,
      averageVolume: rows.reduce((sum, row) => sum + (row.volume ?? 0), 0) / rows.length,
    };
  }, [history]);

  const query = new URLSearchParams({ symbol, start, end, interval }).toString();
  const percentage = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;

  return (
    <main className="terminal-shell analytics-shell">
      <header className="topbar">
        <Link className="brand-mark" href={`/?${query}`} transitionTypes={["nav-back"]} aria-label="Market OS terminal home"><span className="brand-glyph">↗</span><span>MARKET<span className="accent">/</span>OS</span><span className="brand-beta">RESEARCH</span></Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link className="nav-link" href={`/?${query}`} transitionTypes={["nav-back"]}>TERMINAL</Link>
          <Link className="nav-link active" href={`/analytics?${query}`} transitionTypes={["nav-forward"]} aria-current="page">ANALYTICS</Link>
          <Link className="nav-link" href={`/news?${new URLSearchParams({ symbol, company: history?.name ?? symbol, country: history?.country ?? "US", start, end, interval }).toString()}`} transitionTypes={["nav-forward"]}>NEWS</Link>
          <Link className="nav-link" href={`/compare?symbols=${encodeURIComponent(symbol)}&start=${start}&end=${end}&interval=${interval}`} transitionTypes={["nav-forward"]}>COMPARE</Link>
        </nav>
        <div className="market-status"><span className="status-dot" />SECURITY ANALYSIS <span className="status-time">HISTORICAL MARKET DATA</span></div>
      </header>
      <section className="analytics-hero">
        <div><span className="eyebrow"><span className="eyebrow-line" />SELECTED SECURITY · {symbol}</span><h1>Performance,<br /><span>in context.</span></h1><p>Explore returns, trading volume, and drawdowns for the selected security over a date range.</p></div>
        <div className="analytics-security-card"><span className="section-kicker">ANALYZING</span><strong>{history?.name ?? symbol}</strong><span>{history ? `${history.exchange} · ${history.country || history.currency}` : "Loading security details…"}</span></div>
      </section>
      <section className="analytics-controls panel">
        <div className="analytics-controls-heading"><span className="section-kicker">ANALYSIS WINDOW</span><p>Change the date range or sampling interval.</p></div>
        <label>FROM<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label>
        <label>TO<input type="date" value={end} min={start} max={today()} onChange={(event) => setEnd(event.target.value)} /></label>
        <label>INTERVAL<select value={interval} onChange={(event) => setInterval(event.target.value)}>{[["1d", "1 day"], ["1wk", "1 week"], ["1mo", "1 month"], ["60m", "60 minutes"], ["30m", "30 minutes"], ["15m", "15 minutes"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <span className="analytics-load-state">{loading ? "UPDATING CHARTS…" : history ? `${history.rows.length.toLocaleString()} OBSERVATIONS` : ""}</span>
      </section>
      {error ? <div className="notice error-notice analytics-error">{error}</div> : loading && !history ? <div className="panel analytics-empty">LOADING MARKET DATA…</div> : history?.rows.length ? (
        <>
          <section className="analytics-summary">
            <article><span>PERIOD RETURN</span><strong className={analytics && analytics.totalReturn >= 0 ? "positive" : "negative"}>{percentage(analytics?.totalReturn ?? null)}</strong><small>{formatMoney(analytics?.first, history.currency)} → {formatMoney(analytics?.latest, history.currency)}</small></article>
            <article><span>MAXIMUM DRAWDOWN</span><strong className="negative">{percentage(analytics?.maxDrawdown ?? null)}</strong><small>peak-to-trough in this window</small></article>
            <article><span>PERIOD HIGH / LOW</span><strong>{formatMoney(analytics?.periodHigh, history.currency)}</strong><small>Low {formatMoney(analytics?.periodLow, history.currency)}</small></article>
            <article><span>BEST / WORST OBSERVATION</span><strong className="positive">{percentage(analytics?.bestReturn ?? null)}</strong><small className="negative">Worst {percentage(analytics?.worstReturn ?? null)}</small></article>
            <article><span>AVERAGE VOLUME</span><strong>{analytics?.averageVolume.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"}</strong><small>{analytics?.observations.toLocaleString()} observations</small></article>
          </section>
          <AnalyticsCharts rows={history.rows} currency={history.currency} />
          <p className="analytics-note">Returns are calculated from the selected historical price series. Drawdown compares each close with the highest prior close in this range. Volume is shown per observation; data is provided by Yahoo Finance.</p>
        </>
      ) : <div className="panel analytics-empty">No price observations were found for {symbol} in this date range.</div>}
      <footer><span>MARKET/OS RESEARCH TERMINAL</span><span>ANALYTICS · YAHOO FINANCE</span><span><Link href={`/?${query}`} transitionTypes={["nav-back"]}>RETURN TO TERMINAL ↗</Link></span></footer>
    </main>
  );
}
