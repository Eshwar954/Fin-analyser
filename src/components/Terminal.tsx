"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PriceChart from "./PriceChart";

type SymbolResult = { symbol: string; name: string; exchange: string; country?: string };
type PriceRow = {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};
type Filing = {
  form: string;
  filed: string;
  reportDate: string;
  description: string;
  url: string;
  indexUrl: string;
};
type ReportSource = { name: string; url: string };
type ProfileOfficer = { name: string; title: string; age: number | null; fiscalYear: number | null; totalPay: number | null };
type ProfileHolder = { name: string; percent: number | null; shares: number | null; reportDate: string | null };
type CompanyProfile = {
  symbol: string;
  asOf: string;
  source: string;
  profile: { name: string; country: string | null; sector: string | null; industry: string | null; description: string | null; founded: string | null; employees: number | null; website: string | null; headquarters: string | null; officers: ProfileOfficer[] };
  growth: { revenueGrowth: number | null; earningsGrowth: number | null; quarterlyEarningsGrowth: number | null; revenue: number | null; ebitda: number | null; profitMargin: number | null; returnOnEquity: number | null; revenueCurrency: string | null; mostRecentQuarter: string | null };
  ownership: { sharesOutstanding: number | null; floatShares: number | null; insiderPercent: number | null; institutionPercent: number | null; institutionsCount: number | null; holders: ProfileHolder[] };
  marketCap: number | null;
};
type History = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  country: string;
  rows: PriceRow[];
};
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const countryCode = (value = "") => {
  const aliases: Record<string, string> = { "united states": "US", "united states of america": "US", "united kingdom": "GB", "great britain": "GB", india: "IN", canada: "CA", australia: "AU", japan: "JP", germany: "DE", france: "FR", netherlands: "NL", switzerland: "CH" };
  return aliases[value.trim().toLowerCase()] ?? (/^[A-Z]{2}$/.test(value) ? value.toUpperCase() : "");
};
const dateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDay(date);
};
const money = (value: number | null | undefined, currency = "USD") =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);

export default function Terminal({ initialSymbol = "AAPL", initialStart, initialEnd, initialInterval }: { initialSymbol?: string; initialStart?: string; initialEnd?: string; initialInterval?: string }) {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [name, setName] = useState(initialSymbol === "AAPL" ? "Apple Inc." : initialSymbol);
  const [exchange, setExchange] = useState("NASDAQ");
  const [country, setCountry] = useState("");
  const [reportSources, setReportSources] = useState<ReportSource[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const profileRequestId = useRef(0);
  const [start, setStart] = useState(initialStart && /^\d{4}-\d{2}-\d{2}$/.test(initialStart) ? initialStart : dateDaysAgo(365));
  const [end, setEnd] = useState(initialEnd && /^\d{4}-\d{2}-\d{2}$/.test(initialEnd) ? initialEnd : isoDay(new Date()));
  const [interval, setInterval] = useState(initialInterval && ["1m", "2m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"].includes(initialInterval) ? initialInterval : "1d");
  const [history, setHistory] = useState<History | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [company, setCompany] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingFilings, setLoadingFilings] = useState(false);
  const [error, setError] = useState("");
  const [filingError, setFilingError] = useState("");
  const [activeTab, setActiveTab] = useState("10-K");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/market/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        setSymbols(data.quotes ?? []);
      } catch {
        if (!controller.signal.aborted) setSymbols([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function loadHistory(ticker = symbol, countryHint = country, companyHint = name) {
    setLoadingHistory(true);
    setError("");
    try {
      const params = new URLSearchParams({
        symbol: ticker,
        start,
        end,
        interval,
      });
      const response = await fetch(`/api/market/history?${params}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load market history.");
      setHistory(data);
      setName(data.name);
      setExchange(data.exchange ?? exchange);
      if (data.country) {
        setCountry(data.country);
        if (data.country !== countryCode(countryHint)) void loadFilings(ticker, data.country, data.name || companyHint);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load market history.",
      );
      setHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadProfile(ticker = symbol) {
    const requestId = ++profileRequestId.current;
    setLoadingProfile(true);
    setProfile(null);
    setProfileError("");
    try {
      const response = await fetch(`/api/company/profile?symbol=${encodeURIComponent(ticker)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load company profile.");
      if (requestId === profileRequestId.current) setProfile(data as CompanyProfile);
    } catch (cause) {
      if (requestId === profileRequestId.current) {
        setProfile(null);
        setProfileError(cause instanceof Error ? cause.message : "Unable to load company profile.");
      }
    } finally {
      if (requestId === profileRequestId.current) setLoadingProfile(false);
    }
  }

  async function loadFilings(ticker = symbol, countryCode = country, companyName = name) {
    setLoadingFilings(true);
    setFilingError("");
    try {
      const response = await fetch(
        `/api/reports?ticker=${encodeURIComponent(ticker)}&country=${encodeURIComponent(countryCode)}&company=${encodeURIComponent(companyName)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load SEC filings.");
      setFilings(data.filings ?? []);
      setCompany(data.company ?? companyName);
      setReportSources(data.sources ?? []);
    } catch (cause) {
      setFilingError(
        cause instanceof Error ? cause.message : "Unable to load SEC filings.",
      );
      setFilings([]);
    } finally {
      setLoadingFilings(false);
    }
  }

  function select(item: SymbolResult) {
    const ticker = item.symbol.toUpperCase();
    setSymbol(ticker);
    setName(item.name);
    setExchange(item.exchange);
    const selectedCountry = countryCode(item.country);
    setCountry(selectedCountry);
    setQuery("");
    setSymbols([]);
    void loadHistory(ticker, selectedCountry, item.name);
    void loadProfile(ticker);
    if (selectedCountry) void loadFilings(ticker, selectedCountry, item.name);
  }
  function searchSubmit(event: FormEvent) {
    event.preventDefault();
    const exact = symbols.find(
      (item) => item.symbol.toUpperCase() === query.trim().toUpperCase(),
    );
    if (exact) select(exact);
    else if (/^[A-Za-z0-9.^=_-]{1,24}$/.test(query.trim()))
      select({
        symbol: query.trim().toUpperCase(),
        name: query.trim().toUpperCase(),
        exchange: "",
        country: "",
      });
  }
  function applyPreset(preset: string) {
    const map: Record<string, number> = {
      "1M": 30,
      "3M": 90,
      "6M": 180,
      "1Y": 365,
      "5Y": 1825,
    };
    const days = map[preset] ?? 365;
    setStart(dateDaysAgo(days));
    setEnd(isoDay(new Date()));
    setInterval(days <= 6 ? "15m" : days <= 180 ? "1d" : "1wk");
  }
  const values = history?.rows.map((row) => row.close) ?? [];
  const first = values[0],
    last = values.at(-1),
    delta = first != null && last != null ? last - first : null;
  const periodHigh = history?.rows.length
    ? Math.max(...history.rows.map((row) => row.high ?? row.close))
    : null;
  const periodLow = history?.rows.length
    ? Math.min(...history.rows.map((row) => row.low ?? row.close))
    : null;
  const changePercent = delta != null && first
    ? (delta / first) * 100
    : null;
  const latestRow = history?.rows.at(-1);
  const visibleFilings =
    activeTab === "ALL"
      ? filings
      : filings.filter((filing) => filing.form === activeTab);
  const downloadCsv = () => {
    if (!history?.rows.length) return;
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      ...history.rows.map((row) =>
        [row.time, row.open, row.high, row.low, row.close, row.volume].join(
          ",",
        ),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${symbol}-${start}-${end}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadHistory(initialSymbol, "", initialSymbol);
      void loadProfile(initialSymbol);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSymbol]);

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <a className="brand-mark" href="#top">
          <span className="brand-glyph">↗</span>
          <span>
            MARKET<span className="accent">/</span>OS
          </span>
          <span className="brand-beta">RESEARCH</span>
        </a>
        <div className="market-status">
          <span className="status-dot" />
          ON-DEMAND DATA WORKSPACE{" "}
          <span className="status-time">YAHOO FINANCE · SEC EDGAR</span>
        </div>
        <nav className="site-nav" aria-label="Main navigation">
          <Link className="nav-link active" href={`/?${new URLSearchParams({ symbol, start, end, interval }).toString()}`} aria-current="page">TERMINAL</Link>
          <Link className="nav-link" href={`/analytics?${new URLSearchParams({ symbol, start, end, interval }).toString()}`} transitionTypes={["nav-forward"]}>ANALYTICS</Link>
          <Link className="nav-link" href={`/news?${new URLSearchParams({ symbol, company: name, country, start, end, interval }).toString()}`} transitionTypes={["nav-forward"]}>NEWS</Link>
          <Link className="nav-link" href={`/compare?symbols=${encodeURIComponent(symbol)}&start=${start}&end=${end}&interval=${interval}`} transitionTypes={["nav-forward"]}>COMPARE</Link>
        </nav>
        <div className="top-actions">
          <span className="top-action">
            ⌘ K <span>SEARCH</span>
          </span>
          <span className="avatar">EQ</span>
        </div>
      </header>
      <section className="hero-grid" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            EQUITY RESEARCH TERMINAL
          </div>
          <h1>
            Markets,
            <br />
            <span>in focus.</span>
          </h1>
          <p>
            Search a company, import its price history, and open official SEC
            reports in one workspace.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <span>PRICE DATA</span>
            <strong>YAHOO FINANCE</strong>
          </div>
          <div>
            <span>FILINGS</span>
            <strong>SEC EDGAR</strong>
          </div>
          <div>
            <span>SELECTED</span>
            <strong>
              {symbol} <i />
            </strong>
          </div>
        </div>
      </section>
      <section className="search-zone">
        <form className="search-wrap" onSubmit={searchSubmit}>
          <span className="search-prefix">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticker or company name..."
            aria-label="Search ticker or company name"
            autoComplete="off"
          />
          <button className="search-submit" type="submit">
            LOAD SECURITY ↵
          </button>
        </form>
        {query && (
          <div className="search-results">
            {symbols.length ? (
              symbols.map((item) => (
                <button
                  key={`${item.symbol}-${item.exchange}`}
                  onClick={() => select(item)}
                >
                  <span className="result-symbol">{item.symbol}</span>
                  <span className="result-name">{item.name}</span>
                  <span className="result-exchange">{item.exchange}</span>
                  <span className="result-load">OPEN →</span>
                </button>
              ))
            ) : (
              <div className="empty-result">
                {searching
                  ? "SEARCHING YAHOO FINANCE…"
                  : "NO MATCHES — TRY ANOTHER COMPANY OR TICKER"}
              </div>
            )}
          </div>
        )}
        <div className="search-meta">
          <span>ENTER A SYMBOL OR COMPANY</span>
          <span>DATA IS LOADED ON DEMAND</span>
        </div>
      </section>
      <section className="control-panel panel">
        <div className="control-label">
          <span className="section-kicker">01 / PRICE HISTORY</span>
          <h2>Set your window</h2>
          <p>Choose a custom date range and sampling interval.</p>
        </div>
        <div className="date-controls">
          <label>
            FROM
            <input
              type="date"
              value={start}
              max={end}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            TO
            <input
              type="date"
              value={end}
              min={start}
              max={isoDay(new Date())}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label>
            INTERVAL
            <select
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
            >
              {[
                ["1m", "1 minute"],
                ["2m", "2 minutes"],
                ["5m", "5 minutes"],
                ["15m", "15 minutes"],
                ["30m", "30 minutes"],
                ["60m", "60 minutes"],
                ["1d", "1 day"],
                ["1wk", "1 week"],
                ["1mo", "1 month"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="load-button"
            onClick={() => void loadHistory()}
            disabled={loadingHistory}
          >
            {loadingHistory ? "IMPORTING…" : "↻ IMPORT DATA"}
          </button>
        </div>
        <div className="preset-row">
          <span>QUICK RANGE</span>
          {["1M", "3M", "6M", "1Y", "5Y"].map((preset) => (
            <button key={preset} onClick={() => applyPreset(preset)}>
              {preset}
            </button>
          ))}
        </div>
      </section>
      <section className="workspace-grid">
        <section className="detail-panel panel">
          <div className="detail-top">
            <div className="selected-title">
              <span className="selected-badge">{symbol.slice(0, 1)}</span>
              <div>
                <div className="selected-line">
                  <h2>{symbol}</h2>
                  <span className="exchange-tag">
                    {history?.exchange || exchange || "EQUITY"}
                  </span>
                </div>
                <p>{history?.name ?? name}</p>
              </div>
            </div>
            <div className="detail-actions">
              <button
                className="outline-button"
                onClick={downloadCsv}
                disabled={!history?.rows.length}
              >
                ↓ EXPORT CSV
              </button>
              <span className="source-chip">SOURCE · YAHOO</span>
            </div>
          </div>
          {error ? (
            <div className="notice error-notice">{error}</div>
          ) : (
            <>
              <div className="quote-row">
                <div>
                  <span className="quote-label">LATEST CLOSE</span>
                  <strong>{money(last, history?.currency)}</strong>
                </div>
                <div>
                  <span className="quote-label">PERIOD CHANGE</span>
                  <strong
                    className={
                      delta == null ? "" : delta >= 0 ? "positive" : "negative"
                    }
                  >
                    {delta == null
                      ? "—"
                      : `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta), history?.currency)}`}
                  </strong>
                </div>
                <div>
                  <span className="quote-label">OBSERVATIONS</span>
                  <strong>{history?.rows.length ?? "—"}</strong>
                </div>
                <div className="as-of">
                  <span className="live-dot" />
                  IMPORTED
                  <br />
                  <small>
                    {history?.rows.at(-1)?.time.slice(0, 10) ??
                      "Waiting for data"}
                  </small>
                </div>
              </div>
              <div className="chart-header">
                <div>
                  <span className="section-kicker">
                    {symbol} / HISTORICAL CLOSE
                  </span>
                  <h3>
                    {start}{" "}
                    <span>
                      → {end} · {interval}
                    </span>
                  </h3>
                </div>
                <span className="chart-currency">
                  {history?.currency ?? ""}
                </span>
              </div>
              <div className="main-chart">
                {history?.rows.length ? (
                  <PriceChart
                    rows={history.rows}
                    currency={history.currency}
                    symbol={symbol}
                    formatMoney={money}
                  />
                ) : (
                  <div className="chart-empty">
                    {loadingHistory ? (
                      <>
                        <span className="spinner" />
                        IMPORTING PRICE SERIES FROM YAHOO FINANCE
                      </>
                    ) : (
                      "Choose a ticker and import a date range to view its price history."
                    )}
                  </div>
                )}
              </div>
              <div className="data-strip">
                <span>
                  OPEN{" "}
                  <b>{money(history?.rows.at(-1)?.open, history?.currency)}</b>
                </span>
                <span>
                  HIGH{" "}
                  <b>{money(history?.rows.at(-1)?.high, history?.currency)}</b>
                </span>
                <span>
                  LOW{" "}
                  <b>{money(history?.rows.at(-1)?.low, history?.currency)}</b>
                </span>
                <span>
                  VOLUME{" "}
                  <b>{history?.rows.at(-1)?.volume?.toLocaleString() ?? "—"}</b>
                </span>
                <span>
                  INTERVAL <b>{interval}</b>
                </span>
              </div>
            </>
          )}
        </section>
        <aside className="filings-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">02 / {country || "LOCAL"} FILINGS</span>
              <h2>Company reports</h2>
              <p>{company || name} · {country === "US" ? "U.S. SEC EDGAR" : "official local sources"}</p>
            </div>
            <button
              className="refresh-button"
              onClick={() => void loadFilings()}
              disabled={loadingFilings}
            >
              {loadingFilings ? "…" : "↻"}
            </button>
          </div>
          {country === "US" && <div className="filing-tabs">
            {["10-K", "10-Q", "8-K", "ALL"].map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "selected" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>}
          {country !== "US" && !filingError && !loadingFilings ? (
            <div className="filing-list local-source-list">
              {reportSources.map((source) => (
                <article className="filing-item" key={source.name}>
                  <div className="filing-top"><span className="filing-form">{country || "LOCAL"} SOURCE</span><span>OFFICIAL</span></div>
                  <p>{source.name}</p>
                  <div className="filing-bottom"><span>COMPANY REGISTRY / EXCHANGE</span><a href={source.url} target="_blank" rel="noreferrer">SEARCH REPORTS ↗</a></div>
                </article>
              ))}
            </div>
          ) : filingError ? (
            <div className="filing-empty error-notice">{filingError}</div>
          ) : loadingFilings ? (
            <div className="filing-empty">CONNECTING TO EDGAR…</div>
          ) : visibleFilings.length ? (
            <div className="filing-list">
              {visibleFilings.map((filing, index) => (
                <article
                  className="filing-item"
                  key={`${filing.form}-${filing.filed}-${index}`}
                >
                  <div className="filing-top">
                    <span className="filing-form">{filing.form}</span>
                    <span>{filing.filed}</span>
                  </div>
                  <p>{filing.description}</p>
                  <div className="filing-bottom">
                    <span>PERIOD {filing.reportDate || "—"}</span>
                    <a href={filing.url} target="_blank" rel="noreferrer">
                      OPEN REPORT ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="filing-empty">
              No {activeTab === "ALL" ? "matching" : activeTab} filings found
              for {symbol}.<br />
              <a
                href={`https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(symbol)}`}
                target="_blank"
                rel="noreferrer"
              >
                SEARCH EDGAR ↗
              </a>
            </div>
          )}
          <div className="edgar-foot">
            {country === "US" ? "FILINGS PROVIDED BY THE U.S. SEC" : `REPORT SOURCES · ${country || "COUNTRY NOT IDENTIFIED"}`}
            <br />
            <a
              href={reportSources[0]?.url ?? `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(symbol)}`}
              target="_blank"
              rel="noreferrer"
            >
              {country === "US" ? "VIEW ALL ON SEC.GOV ↗" : "OPEN COUNTRY SOURCES ↗"}
            </a>
          </div>
        </aside>
      </section>
      <section className="company-profile panel" aria-labelledby="profile-title">
        <div className="profile-heading">
          <div>
            <span className="section-kicker">03 / COMPANY PROFILE</span>
            <h2 id="profile-title">{profile?.profile.name ?? history?.name ?? name}</h2>
            <p>Business, leadership, growth, and reported ownership information.</p>
          </div>
          <div className="profile-heading-actions">
            <span className="profile-source">PROFILE SOURCE · {profile?.source ?? "YAHOO FINANCE"}</span>
            <button className="refresh-button" aria-label="Refresh company profile" onClick={() => void loadProfile()} disabled={loadingProfile}>{loadingProfile ? "…" : "↻"}</button>
          </div>
        </div>
        {profileError ? <div className="profile-empty error-notice">{profileError}</div> : loadingProfile && !profile ? <div className="profile-empty">LOADING COMPANY PROFILE…</div> : profile ? (
          <>
            <section className="profile-about">
              <div className="profile-section-title"><span>BUSINESS OVERVIEW</span><small>{profile.profile.sector ?? "Sector not reported"}{profile.profile.industry ? ` · ${profile.profile.industry}` : ""}</small></div>
              <p className="profile-description">{profile.profile.description ?? "Business description is not available from the current profile source."}</p>
              <div className="profile-facts">
                <div className="profile-fact"><span>ESTABLISHED</span><strong>{profile.profile.founded ?? "Not reported"}</strong></div>
                <div className="profile-fact"><span>EMPLOYEES</span><strong>{profile.profile.employees?.toLocaleString() ?? "Not reported"}</strong></div>
                <div className="profile-fact"><span>HEADQUARTERS</span><strong>{profile.profile.headquarters ?? "Not reported"}</strong></div>
                <div className="profile-fact"><span>WEBSITE</span><strong>{profile.profile.website ? <a href={profile.profile.website} target="_blank" rel="noreferrer">OPEN COMPANY SITE ↗</a> : "Not reported"}</strong></div>
                <div className="profile-fact"><span>MARKET CAPITALIZATION</span><strong>{profile.marketCap != null ? money(profile.marketCap, history?.currency) : "Not reported"}</strong></div>
              </div>
            </section>
            <div className="profile-columns">
              <section className="profile-section">
                <div className="profile-section-title"><span>LEADERSHIP</span><small>{profile.profile.officers.length ? `${profile.profile.officers.length} reported officers` : "Not reported"}</small></div>
                {profile.profile.officers.length ? <div className="profile-list">{profile.profile.officers.map((officer, index) => <div className="profile-person" key={`${officer.name}-${officer.title}-${index}`}><div><strong>{officer.name}</strong><span>{officer.title}</span></div><small>{officer.fiscalYear ? `FY ${officer.fiscalYear}` : ""}</small></div>)}</div> : <p className="profile-muted">Officer details are not available from the current source.</p>}
              </section>
              <section className="profile-section">
                <div className="profile-section-title"><span>GROWTH & FINANCIALS</span><small>{profile.growth.mostRecentQuarter ? `Latest quarter · ${new Date(profile.growth.mostRecentQuarter).toLocaleDateString()}` : "Most recently reported"}</small></div>
                <div className="growth-grid">
                  <div className="growth-metric"><span>REVENUE GROWTH</span><strong className={typeof profile.growth.revenueGrowth === "number" ? profile.growth.revenueGrowth >= 0 ? "positive" : "negative" : ""}>{profile.growth.revenueGrowth == null ? "—" : `${(profile.growth.revenueGrowth * 100).toFixed(1)}%`}</strong><small>year over year</small></div>
                  <div className="growth-metric"><span>EARNINGS GROWTH</span><strong className={typeof profile.growth.earningsGrowth === "number" ? profile.growth.earningsGrowth >= 0 ? "positive" : "negative" : ""}>{profile.growth.earningsGrowth == null ? "—" : `${(profile.growth.earningsGrowth * 100).toFixed(1)}%`}</strong><small>year over year</small></div>
                  <div className="growth-metric"><span>QUARTERLY EARNINGS GROWTH</span><strong>{profile.growth.quarterlyEarningsGrowth == null ? "—" : `${(profile.growth.quarterlyEarningsGrowth * 100).toFixed(1)}%`}</strong></div>
                  <div className="growth-metric"><span>REVENUE</span><strong>{profile.growth.revenue == null ? "—" : money(profile.growth.revenue, profile.growth.revenueCurrency ?? "USD")}</strong></div>
                  <div className="growth-metric"><span>EBITDA</span><strong>{profile.growth.ebitda == null ? "—" : money(profile.growth.ebitda, profile.growth.revenueCurrency ?? "USD")}</strong></div>
                  <div className="growth-metric"><span>PROFIT MARGIN</span><strong>{profile.growth.profitMargin == null ? "—" : `${(profile.growth.profitMargin * 100).toFixed(1)}%`}</strong></div>
                </div>
              </section>
              <section className="profile-section ownership-section">
                <div className="profile-section-title"><span>OWNERSHIP & SHAREHOLDERS</span><small>Reported major holders; public data may be delayed</small></div>
                <div className="ownership-totals">
                  <div><span>INSIDER OWNERSHIP</span><strong>{profile.ownership.insiderPercent == null ? "—" : `${(profile.ownership.insiderPercent * 100).toFixed(2)}%`}</strong></div>
                  <div><span>INSTITUTIONAL OWNERSHIP</span><strong>{profile.ownership.institutionPercent == null ? "—" : `${(profile.ownership.institutionPercent * 100).toFixed(2)}%`}</strong></div>
                  <div><span>INSTITUTIONS</span><strong>{profile.ownership.institutionsCount?.toLocaleString() ?? "—"}</strong></div>
                  <div><span>SHARES OUTSTANDING</span><strong>{profile.ownership.sharesOutstanding?.toLocaleString() ?? "—"}</strong></div>
                  <div><span>PUBLIC FLOAT</span><strong>{profile.ownership.floatShares?.toLocaleString() ?? "—"}</strong></div>
                </div>
                {profile.ownership.holders.length ? <div className="holder-list"><div className="holder-row holder-header"><span>REPORTED HOLDER</span><span>SHARES</span><span>OWNED</span><span>REPORT DATE</span></div>{profile.ownership.holders.map((holder, index) => <div className="holder-row" key={`${holder.name}-${holder.reportDate}-${index}`}><strong>{holder.name}</strong><span>{holder.shares?.toLocaleString() ?? "—"}</span><span>{holder.percent == null ? "—" : `${(holder.percent * 100).toFixed(2)}%`}</span><span>{holder.reportDate ? new Date(holder.reportDate).toLocaleDateString() : "—"}</span></div>)}</div> : <p className="profile-muted">Major holder details are not reported by the current source.</p>}
              </section>
            </div>
            <p className="profile-disclaimer">Company profile and ownership data are provided by Yahoo Finance and may be incomplete or delayed. Public ownership filings show reportable major holders, not every shareholder. Establishment year is extracted from the company description when stated.</p>
          </>
        ) : <div className="profile-empty">No company profile is available for {symbol}.</div>}
      </section>
      <section className="company-snapshot panel" aria-labelledby="snapshot-title">
        <div className="snapshot-heading">
          <div>
            <span className="section-kicker">04 / TRADING DATA</span>
            <h2 id="snapshot-title">{history?.name ?? name}</h2>
            <p>Selected company and imported market data for {start} through {end}.</p>
          </div>
          <span className="snapshot-symbol">{symbol}</span>
        </div>
        <div className="snapshot-grid">
          <div className="snapshot-item"><span>COMPANY</span><strong title={history?.name ?? name}>{history?.name ?? name}</strong></div>
          <div className="snapshot-item"><span>TICKER</span><strong>{symbol}</strong></div>
          <div className="snapshot-item"><span>COUNTRY</span><strong>{country || "Not identified"}</strong></div>
          <div className="snapshot-item"><span>EXCHANGE</span><strong>{history?.exchange || exchange || "—"}</strong></div>
          <div className="snapshot-item"><span>CURRENCY</span><strong>{history?.currency || "—"}</strong></div>
          <div className="snapshot-item"><span>PRICE INTERVAL</span><strong>{interval}</strong></div>
          <div className="snapshot-item"><span>OBSERVATIONS</span><strong>{history?.rows.length.toLocaleString() ?? "—"}</strong></div>
          <div className="snapshot-item"><span>FIRST CLOSE</span><strong>{money(first, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>LATEST CLOSE</span><strong>{money(last, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>PERIOD CHANGE</span><strong className={delta == null ? "" : delta >= 0 ? "positive" : "negative"}>{delta == null ? "—" : `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta), history?.currency)}`}</strong></div>
          <div className="snapshot-item"><span>CHANGE %</span><strong className={changePercent == null ? "" : changePercent >= 0 ? "positive" : "negative"}>{changePercent == null ? "—" : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`}</strong></div>
          <div className="snapshot-item"><span>PERIOD HIGH</span><strong>{money(periodHigh, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>PERIOD LOW</span><strong>{money(periodLow, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>LATEST OPEN</span><strong>{money(latestRow?.open, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>LATEST HIGH</span><strong>{money(latestRow?.high, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>LATEST LOW</span><strong>{money(latestRow?.low, history?.currency)}</strong></div>
          <div className="snapshot-item"><span>LATEST VOLUME</span><strong>{latestRow?.volume?.toLocaleString() ?? "—"}</strong></div>
          <div className="snapshot-item"><span>DATA SOURCE</span><strong>Yahoo Finance</strong></div>
        </div>
      </section>
      <footer>
        <span>MARKET/OS RESEARCH TERMINAL</span>
        <span>PRICE HISTORY · YAHOO FINANCE</span>
        <span>REPORTS · COUNTRY-SPECIFIC SOURCES</span>
      </footer>
    </main>
  );
}
