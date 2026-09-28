"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SymbolResult = { symbol: string; name: string; exchange: string };
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
type History = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  rows: PriceRow[];
};
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

export default function Terminal() {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [symbol, setSymbol] = useState("AAPL");
  const [name, setName] = useState("Apple Inc.");
  const [exchange, setExchange] = useState("NASDAQ");
  const [start, setStart] = useState(dateDaysAgo(365));
  const [end, setEnd] = useState(isoDay(new Date()));
  const [interval, setInterval] = useState("1d");
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
    if (term.length < 1) {
      setSymbols([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
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

  async function loadHistory(ticker = symbol) {
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

  async function loadFilings(ticker = symbol) {
    setLoadingFilings(true);
    setFilingError("");
    try {
      const response = await fetch(
        `/api/sec?ticker=${encodeURIComponent(ticker)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load SEC filings.");
      setFilings(data.filings ?? []);
      setCompany(data.company ?? "");
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
    setQuery("");
    setSymbols([]);
    void loadHistory(ticker);
    void loadFilings(ticker);
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
  const chart = useMemo(() => {
    if (!values.length) return "";
    const min = Math.min(...values),
      max = Math.max(...values),
      spread = max - min || 1;
    return values
      .map(
        (value, i) =>
          `${i ? "L" : "M"}${(i / (values.length - 1 || 1)) * 1000},${210 - ((value - min) / spread) * 185}`,
      )
      .join(" ");
  }, [values]);
  const first = values[0],
    last = values.at(-1),
    delta = first != null && last != null ? last - first : null;
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
    void loadHistory("AAPL");
    void loadFilings("AAPL"); // initial import
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  <>
                    <div className="chart-gridlines">
                      <span>
                        {money(Math.max(...values), history.currency)}
                      </span>
                      <span>
                        {money(
                          (Math.max(...values) + Math.min(...values)) / 2,
                          history.currency,
                        )}
                      </span>
                      <span>
                        {money(Math.min(...values), history.currency)}
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 1000 230"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={`${symbol} historical price chart`}
                    >
                      <defs>
                        <linearGradient
                          id="history-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#39d78a"
                            stopOpacity=".22"
                          />
                          <stop
                            offset="100%"
                            stopColor="#39d78a"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>
                      <path
                        d={`${chart} L1000,230 L0,230 Z`}
                        fill="url(#history-fill)"
                      />
                      <path
                        d={chart}
                        fill="none"
                        stroke="#39d78a"
                        strokeWidth="2.4"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <div className="chart-axis">
                      <span>{history.rows[0].time.slice(0, 10)}</span>
                      <span>
                        {history.rows[
                          Math.floor(history.rows.length / 2)
                        ]?.time.slice(0, 10)}
                      </span>
                      <span>{history.rows.at(-1)?.time.slice(0, 10)}</span>
                    </div>
                  </>
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
              <span className="section-kicker">02 / SEC EDGAR</span>
              <h2>Company reports</h2>
              <p>{company || name} · official filings</p>
            </div>
            <button
              className="refresh-button"
              onClick={() => void loadFilings()}
              disabled={loadingFilings}
            >
              {loadingFilings ? "…" : "↻"}
            </button>
          </div>
          <div className="filing-tabs">
            {["10-K", "10-Q", "8-K", "ALL"].map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "selected" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {filingError ? (
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
            FILINGS PROVIDED BY THE U.S. SEC
            <br />
            <a
              href={`https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(symbol)}`}
              target="_blank"
              rel="noreferrer"
            >
              VIEW ALL ON SEC.GOV ↗
            </a>
          </div>
        </aside>
      </section>
      <footer>
        <span>MARKET/OS RESEARCH TERMINAL</span>
        <span>PRICE HISTORY · YAHOO FINANCE</span>
        <span>FILINGS · SEC EDGAR</span>
      </footer>
    </main>
  );
}
