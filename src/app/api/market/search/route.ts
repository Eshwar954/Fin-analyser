import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length > 80) return Response.json({ quotes: [] });

  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`, {
      headers: { "User-Agent": "Mozilla/5.0 MarketOS/1.0" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ error: "Yahoo Finance search is unavailable." }, { status: 502 });
    const data = await response.json();
    const quotes = (data?.quotes ?? []).filter((item: { quoteType?: string; symbol?: string }) => item.quoteType === "EQUITY" && item.symbol);
    return Response.json({ quotes: quotes.map((item: Record<string, unknown>) => ({ symbol: item.symbol, name: item.shortname ?? item.longname ?? item.symbol, exchange: item.exchDisp ?? item.exchange ?? "", country: item.country ?? "" })) });
  } catch {
    return Response.json({ error: "Could not reach Yahoo Finance. Try again shortly." }, { status: 502 });
  }
}
