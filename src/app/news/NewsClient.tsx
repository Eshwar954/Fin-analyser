"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type NewsItem = { title: string; link: string; publishedAt: string; source: string; summary: string };
type NewsResponse = { query: string; country: string; source: string; feedUrl: string; items: NewsItem[] };

export default function NewsClient({ symbol, company, country, start, end, interval }: { symbol: string; company: string; country: string; start?: string; end?: string; interval?: string }) {
  const [query, setQuery] = useState(company || symbol);
  const [submittedQuery, setSubmittedQuery] = useState(company || symbol);
  const [refreshKey, setRefreshKey] = useState(0);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const range = new URLSearchParams({ symbol, ...(start ? { start } : {}), ...(end ? { end } : {}), ...(interval ? { interval } : {}) }).toString();
  const companyQuery = new URLSearchParams({ symbol, company, country, ...(start ? { start } : {}), ...(end ? { end } : {}), ...(interval ? { interval } : {}) }).toString();

  useEffect(() => {
    if (!submittedQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: submittedQuery, country });
        const response = await fetch(`/api/news?${params}`, { signal: controller.signal });
        const data = await response.json() as NewsResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load news.");
        setItems(data.items ?? []);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setItems([]);
          setError(cause instanceof Error ? cause.message : "Unable to load news.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [submittedQuery, country, refreshKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;
    if (nextQuery === submittedQuery) setRefreshKey((key) => key + 1);
    else setSubmittedQuery(nextQuery);
  }

  return (
    <main className="terminal-shell news-shell">
      <header className="topbar">
        <Link className="brand-mark" href={`/?${range}`} transitionTypes={["nav-back"]} aria-label="Market OS terminal home"><span className="brand-glyph">↗</span><span>MARKET<span className="accent">/</span>OS</span><span className="brand-beta">RESEARCH</span></Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link className="nav-link" href={`/?${range}`} transitionTypes={["nav-back"]}>TERMINAL</Link>
          <Link className="nav-link" href={`/analytics?${range}`} transitionTypes={["nav-forward"]}>ANALYTICS</Link>
          <Link className="nav-link active" href={`/news?${companyQuery}`} aria-current="page">NEWS</Link>
          <Link className="nav-link" href={`/compare?symbols=${encodeURIComponent(symbol)}${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}${interval ? `&interval=${interval}` : ""}`} transitionTypes={["nav-forward"]}>COMPARE</Link>
        </nav>
        <div className="market-status"><span className="status-dot" />COMPANY NEWS <span className="status-time">GOOGLE NEWS RSS</span></div>
      </header>
      <section className="news-hero">
        <div><span className="eyebrow"><span className="eyebrow-line" />SECURITY NEWS · {symbol}</span><h1>News,<br /><span>in context.</span></h1><p>Headlines for {company || symbol}, localized to {country || "the selected region"}.</p></div>
        <div className="news-security-card"><span className="section-kicker">SELECTED SECURITY</span><strong>{company || symbol}</strong><span>{symbol} · {country || "Region not set"}</span></div>
      </section>
      <section className="news-search panel">
        <div><span className="section-kicker">GOOGLE NEWS SEARCH</span><p>Search news by company name, ticker, or topic.</p></div>
        <form onSubmit={submit}><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="News search query" placeholder="Company or topic" /><button className="load-button" type="submit" disabled={loading}>{loading ? "LOADING…" : "↻ SEARCH NEWS"}</button></form>
      </section>
      <section className="news-feed panel" aria-live="polite">
        <div className="news-feed-heading"><div><span className="section-kicker">01 / HEADLINES</span><h2>{submittedQuery}</h2></div><span className="news-feed-source">SOURCE · GOOGLE NEWS RSS</span></div>
        {error ? <div className="news-message error-notice">{error}</div> : loading && !items.length ? <div className="news-message">FETCHING HEADLINES…</div> : items.length ? <div className="news-list">{items.map((item, index) => <article className="news-item" key={`${item.link}-${index}`}><div className="news-item-meta"><span>{item.source}</span><time>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "Recent"}</time></div><h3><a href={item.link} target="_blank" rel="noreferrer">{item.title} ↗</a></h3>{item.summary && <p>{item.summary}</p>}<a className="news-open" href={item.link} target="_blank" rel="noreferrer">OPEN ARTICLE ↗</a></article>)}</div> : <div className="news-message">No headlines found for this query. Try the full company name or ticker.</div>}
        <div className="news-feed-footer">HEADLINES AGGREGATED BY GOOGLE NEWS · OPEN THE PUBLISHER LINK TO READ THE ARTICLE</div>
      </section>
      <footer><span>MARKET/OS RESEARCH TERMINAL</span><span>NEWS · GOOGLE NEWS RSS</span><span><Link href={`/?${range}`} transitionTypes={["nav-back"]}>RETURN TO TERMINAL ↗</Link></span></footer>
    </main>
  );
}
