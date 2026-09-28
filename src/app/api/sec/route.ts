import { NextRequest } from "next/server";

type TickerEntry = { cik_str: number; ticker: string; title: string };
const headers = { "User-Agent": process.env.SEC_USER_AGENT ?? "MarketOS research terminal contact support@example.com", Accept: "application/json" };

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9.^=_-]{1,24}$/.test(ticker)) return Response.json({ error: "Enter a valid stock ticker." }, { status: 400 });
  try {
    const mappingResponse = await fetch("https://www.sec.gov/files/company_tickers.json", { headers, signal: AbortSignal.timeout(12000), cache: "force-cache", next: { revalidate: 86400 } });
    if (!mappingResponse.ok) return Response.json({ error: "SEC ticker directory is unavailable." }, { status: 502 });
    const mapping = await mappingResponse.json() as Record<string, TickerEntry>;
    const company = Object.values(mapping).find((entry) => entry.ticker.toUpperCase() === ticker);
    if (!company) return Response.json({ ticker, company: null, filings: [] });
    const cik = String(company.cik_str).padStart(10, "0");
    const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers, signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok) return Response.json({ error: "SEC company filings are unavailable." }, { status: 502 });
    const data = await response.json();
    const recent = data.filings?.recent;
    const filings = (recent?.accessionNumber ?? []).flatMap((accession: string, index: number) => {
      const form = recent.form[index];
      if (!["10-K", "10-Q", "8-K", "20-F", "6-K", "DEF 14A"].includes(form)) return [];
      const accessionPath = accession.replaceAll("-", "");
      const primary = recent.primaryDocument[index];
      return [{ form, filed: recent.filingDate[index], reportDate: recent.reportDate[index], description: recent.primaryDocDescription?.[index] ?? "SEC filing", url: `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accessionPath}/${primary}`, indexUrl: `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accessionPath}/` }];
    }).slice(0, 24);
    return Response.json({ ticker, company: data.name, cik, filings });
  } catch {
    return Response.json({ error: "Could not reach SEC EDGAR. Try again shortly." }, { status: 502 });
  }
}
