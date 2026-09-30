"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Line } from "react-chartjs-2";
import { CategoryScale, Chart as ChartJS, LineElement, LinearScale, PointElement, Tooltip, type ChartOptions } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

type Row = { time: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null };
type Stock = { symbol: string; name: string; currency: string; exchange: string; country?: string; rows: Row[] };
type SearchResult = { symbol: string; name: string; exchange: string; country?: string };
const colors = ["#39d78a", "#70a7ff", "#ffb454", "#d88bff", "#ff7185", "#51d4d8"];
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10); };
const formatMoney = (value: number | null | undefined, currency: string) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value);

export default function CompareClient({ initialSymbols, initialStart, initialEnd, initialInterval }: { initialSymbols: string[]; initialStart?: string; initialEnd?: string; initialInterval?: string }) {
  const [selected, setSelected] = useState([...new Set(initialSymbols.map((item) => item.toUpperCase()))].slice(0, 6));
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [start, setStart] = useState(initialStart && /^\d{4}-\d{2}-\d{2}$/.test(initialStart) ? initialStart : daysAgo(365));
  const [end, setEnd] = useState(initialEnd && /^\d{4}-\d{2}-\d{2}$/.test(initialEnd) ? initialEnd : today());
  const [interval, setInterval] = useState(initialInterval && ["1d", "1wk", "1mo", "60m", "30m", "15m"].includes(initialInterval) ? initialInterval : "1d");
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/market/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await response.json();
        setSuggestions(data.quotes ?? []);
      } catch { if (!controller.signal.aborted) setSuggestions([]); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (!selected.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      Promise.all(selected.map(async (symbol) => {
        const params = new URLSearchParams({ symbol, start, end, interval });
        const response = await fetch(`/api/market/history?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(`${symbol}: ${data.error ?? "Unable to load price history."}`);
        return data as Stock;
      })).then(setStocks).catch((cause: unknown) => {
        if (!controller.signal.aborted) { setStocks([]); setError(cause instanceof Error ? cause.message : "Unable to load comparison data."); }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected, start, end, interval]);

  const queryString = new URLSearchParams({ symbols: selected.join(","), start, end, interval }).toString();
  const chart = useMemo(() => {
    const dates = [...new Set(stocks.flatMap((stock) => stock.rows.map((row) => row.time.slice(0, 10))))].sort();
    return { labels: dates, datasets: stocks.map((stock, index) => {
      const base = stock.rows[0]?.close;
      const byDate = new Map(stock.rows.map((row) => [row.time.slice(0, 10), row.close]));
      return { label: `${stock.symbol} (%)`, data: dates.map((date) => { const close = byDate.get(date); return close == null || !base ? null : ((close / base) - 1) * 100; }), borderColor: colors[index % colors.length], backgroundColor: colors[index % colors.length], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, spanGaps: true, tension: 0.2 };
    }) };
  }, [stocks]);
  const options = useMemo<ChartOptions<"line">>(() => ({ responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" }, plugins: { legend: { labels: { color: "#aebbbf", usePointStyle: true, boxWidth: 7 } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(2)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: "#71818a", maxTicksLimit: 8, maxRotation: 0 } }, y: { grid: { color: "rgba(89, 107, 115, .2)" }, ticks: { color: "#71818a", callback: (value) => `${Number(value).toFixed(0)}%` }, title: { display: true, text: "Return from first observation", color: "#71818a" } } } }), []);

  function add(symbol: string) { const ticker = symbol.toUpperCase(); setSelected((current) => current.includes(ticker) || current.length >= 6 ? current : [...current, ticker]); setQuery(""); setSuggestions([]); }
  function downloadCsv() {
    const header = "Symbol,Name,Currency,Date,Open,High,Low,Close,Volume";
    const rows = stocks.flatMap((stock) => stock.rows.map((row) => [stock.symbol, `"${stock.name.replaceAll('"', '""')}"`, stock.currency, row.time, row.open ?? "", row.high ?? "", row.low ?? "", row.close, row.volume ?? ""].join(",")));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `stock-comparison-${start}-${end}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <main className="terminal-shell analytics-shell compare-shell">
    <header className="topbar">
      <Link className="brand-mark" href={`/?${new URLSearchParams({ symbol: selected[0] ?? "AAPL", start, end, interval })}`}><span className="brand-glyph">↗</span><span>MARKET<span className="accent">/</span>OS</span><span className="brand-beta">RESEARCH</span></Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link className="nav-link" href={`/?${new URLSearchParams({ symbol: selected[0] ?? "AAPL", start, end, interval })}`} transitionTypes={["nav-back"]}>TERMINAL</Link>
        <Link className="nav-link" href={`/analytics?${new URLSearchParams({ symbol: selected[0] ?? "AAPL", start, end, interval })}`} transitionTypes={["nav-forward"]}>ANALYTICS</Link>
        <Link className="nav-link" href={`/news?${new URLSearchParams({ symbol: selected[0] ?? "AAPL", company: stocks[0]?.name ?? selected[0] ?? "AAPL", country: stocks[0]?.country ?? "US", start, end, interval })}`} transitionTypes={["nav-forward"]}>NEWS</Link>
        <Link className="nav-link active" href={`/compare?${queryString}`} aria-current="page">COMPARE</Link>
      </nav>
      <div className="market-status"><span className="status-dot" />MULTI SECURITY <span className="status-time">YAHOO FINANCE</span></div>
    </header>
    <section className="analytics-hero compare-hero"><div><span className="eyebrow"><span className="eyebrow-line" />MULTI SECURITY WORKSPACE</span><h1>Compare<br /><span>the field.</span></h1><p>Track prices, returns, and trading activity for up to six stocks over the same window.</p></div><div className="analytics-security-card"><span className="section-kicker">COMPARING</span><strong>{selected.length} securities</strong><span>Normalized performance · shared period</span></div></section>
    <section className="panel compare-picker"><div className="compare-picker-head"><div><span className="section-kicker">01 / SELECT SECURITIES</span><p>Search company names or ticker symbols. Select up to six.</p></div><span>{selected.length} / 6 SELECTED</span></div><div className="compare-chips">{selected.map((symbol, index) => <span className="compare-chip" key={symbol} style={{ "--stock-color": colors[index % colors.length] } as CSSProperties}>{symbol}<button aria-label={`Remove ${symbol}`} onClick={() => { const remaining = selected.filter((item) => item !== symbol); setSelected(remaining); if (!remaining.length) setStocks([]); }}>×</button></span>)}</div><div className="compare-search"><input value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setSuggestions([]); }} onKeyDown={(event) => { if (event.key === "Enter" && /^[A-Za-z0-9.^=_-]{1,24}$/.test(query.trim())) { event.preventDefault(); add(query.trim()); } }} placeholder="Add a company or ticker…" aria-label="Search stocks to compare" /><button className="load-button" onClick={() => /^[A-Za-z0-9.^=_-]{1,24}$/.test(query.trim()) && add(query.trim())} disabled={selected.length >= 6}>ADD STOCK +</button>{suggestions.length > 0 && <div className="compare-suggestions">{suggestions.map((item) => <button key={item.symbol} onClick={() => add(item.symbol)} disabled={selected.includes(item.symbol)}><strong>{item.symbol}</strong><span>{item.name}</span><small>{item.exchange}</small></button>)}</div>}</div></section>
    <section className="analytics-controls panel"><div className="analytics-controls-heading"><span className="section-kicker">02 / COMPARISON WINDOW</span><p>Apply the same dates and interval to every stock.</p></div><label>FROM<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label><label>TO<input type="date" value={end} min={start} max={today()} onChange={(event) => setEnd(event.target.value)} /></label><label>INTERVAL<select value={interval} onChange={(event) => setInterval(event.target.value)}>{[["1d", "1 day"], ["1wk", "1 week"], ["1mo", "1 month"], ["60m", "60 minutes"], ["30m", "30 minutes"], ["15m", "15 minutes"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="outline-button compare-export" onClick={downloadCsv} disabled={!stocks.some((stock) => stock.rows.length)}>↓ EXPORT ALL CSV</button></section>
    {error ? <div className="notice error-notice analytics-error">{error}</div> : loading && !stocks.length ? <div className="panel analytics-empty">LOADING COMPARISON DATA…</div> : stocks.length ? <>
      <section className="compare-metrics">{stocks.map((stock, index) => { const first = stock.rows[0]?.close; const last = stock.rows.at(-1)?.close; const change = first && last ? (last / first) - 1 : null; return <article key={stock.symbol} style={{ "--stock-color": colors[index % colors.length] } as CSSProperties}><span>{stock.symbol}</span><strong>{formatMoney(last, stock.currency)}</strong><small className={change == null ? "" : change >= 0 ? "positive" : "negative"}>{change == null ? "No observations" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`} period return</small><small>{stock.name}</small></article>; })}</section>
      <section className="panel compare-chart-panel"><div className="chart-header"><div><span className="section-kicker">03 / RELATIVE PERFORMANCE</span><h3>Return comparison <span>· rebased to first observation</span></h3></div><span className="chart-currency">RETURN %</span></div><div className="compare-chart"><Line data={chart} options={options} aria-label="Normalized stock performance comparison" /></div></section>
      <section className="panel compare-table-wrap"><div className="compare-table-title"><div><span className="section-kicker">04 / PRICE AND ANALYTICS</span><p>Latest close, range, period return, and average daily volume.</p></div><span>{start} → {end} · {interval}</span></div><div className="compare-table-scroll"><table className="compare-table"><thead><tr><th>STOCK</th><th>LATEST</th><th>PERIOD RETURN</th><th>PERIOD HIGH</th><th>PERIOD LOW</th><th>AVG VOLUME</th><th>OBS.</th></tr></thead><tbody>{stocks.map((stock, index) => { const closes = stock.rows.map((row) => row.close); const first = closes[0]; const last = closes.at(-1); const change = first && last ? (last / first) - 1 : null; const high = Math.max(...stock.rows.map((row) => row.high ?? row.close)); const low = Math.min(...stock.rows.map((row) => row.low ?? row.close)); const avgVolume = stock.rows.reduce((sum, row) => sum + (row.volume ?? 0), 0) / (stock.rows.length || 1); return <tr key={stock.symbol}><td><i style={{ background: colors[index % colors.length] }} /> <strong>{stock.symbol}</strong><small>{stock.name}</small></td><td>{formatMoney(last, stock.currency)}</td><td className={change == null ? "" : change >= 0 ? "positive" : "negative"}>{change == null ? "—" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`}</td><td>{formatMoney(Number.isFinite(high) ? high : null, stock.currency)}</td><td>{formatMoney(Number.isFinite(low) ? low : null, stock.currency)}</td><td>{avgVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td><td>{stock.rows.length}</td></tr>; })}</tbody></table></div></section>
      <p className="analytics-note">The line chart shows percentage change from each stock’s first available close, allowing direct comparison across different share prices. Market data is provided by Yahoo Finance; stocks may have different trading calendars.</p>
    </> : <div className="panel analytics-empty">Select at least one stock to load comparison data.</div>}
    <footer><span>MARKET/OS RESEARCH TERMINAL</span><span>COMPARE · YAHOO FINANCE</span><span><Link href={`/?${queryString}`}>RETURN TO TERMINAL ↗</Link></span></footer>
  </main>;
}
