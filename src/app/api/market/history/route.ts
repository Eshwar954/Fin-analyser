import { NextRequest } from "next/server";

const intervals = new Set(["1m", "2m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = params.get("symbol")?.trim().toUpperCase() ?? "";
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";
  const interval = params.get("interval") ?? "1d";
  if (!/^[A-Z0-9.^=_-]{1,24}$/.test(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !intervals.has(interval)) {
    return Response.json({ error: "Enter a valid ticker, date range, and interval." }, { status: 400 });
  }
  const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000);
  if (!Number.isFinite(period1) || !Number.isFinite(period2) || period1 >= period2) return Response.json({ error: "Start date must be before end date." }, { status: 400 });

  try {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("period1", String(period1));
    url.searchParams.set("period2", String(period2));
    url.searchParams.set("interval", interval);
    url.searchParams.set("events", "div,splits");
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 MarketOS/1.0" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) return Response.json({ error: `Yahoo Finance returned ${response.status} for ${symbol}.` }, { status: 502 });
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (!result) return Response.json({ error: payload?.chart?.error?.description ?? `No price history found for ${symbol}.` }, { status: 404 });
    const quote = result.indicators.quote[0];
    const rows = (result.timestamp ?? []).flatMap((time: number, index: number) => quote.close[index] == null ? [] : [{ time: new Date(time * 1000).toISOString(), open: quote.open[index], high: quote.high[index], low: quote.low[index], close: quote.close[index], volume: quote.volume[index] }]);
    return Response.json({ symbol, currency: result.meta.currency, exchange: result.meta.fullExchangeName ?? result.meta.exchangeName, name: result.meta.longName ?? result.meta.shortName ?? symbol, rows });
  } catch {
    return Response.json({ error: "Could not fetch Yahoo Finance history. Try again shortly." }, { status: 502 });
  }
}
