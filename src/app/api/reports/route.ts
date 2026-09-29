import { NextRequest } from "next/server";

type TickerEntry = { cik_str: number; ticker: string; title: string };
const headers = { "User-Agent": process.env.SEC_USER_AGENT ?? "MarketOS research terminal contact support@example.com", Accept: "application/json" };
const sources: Record<string, { name: string; url: string | ((company: string) => string) }[]> = {
  IN: [{ name: "Ministry of Corporate Affairs (MCA)", url: "https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html" }, { name: "National Stock Exchange of India", url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements" }, { name: "BSE India", url: "https://www.bseindia.com/corporates/ann.html" }],
  GB: [{ name: "UK Companies House", url: (company: string) => `https://find-and-update.company-information.service.gov.uk/search?q=${encodeURIComponent(company)}` }],
  CA: [{ name: "SEDAR+", url: "https://www.sedarplus.ca/landingpage/" }],
  AU: [{ name: "ASIC company and business names", url: "https://asic.gov.au/online-services/search-asic-registers/" }, { name: "ASX announcements", url: (company: string) => `https://www.asx.com.au/markets/company/${encodeURIComponent(company)}` }],
  JP: [{ name: "Japan EDINET", url: "https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx" }],
  DE: [{ name: "German Company Register", url: (company: string) => `https://www.unternehmensregister.de/ureg/search1.html?submitaction=show&search=company&query=${encodeURIComponent(company)}` }],
  FR: [{ name: "Infogreffe", url: "https://www.infogreffe.fr/recherche-entreprise" }],
  NL: [{ name: "Dutch KVK Business Register", url: "https://www.kvk.nl/zoeken/" }],
  CH: [{ name: "Swiss Official Gazette of Commerce", url: "https://www.zefix.ch/en/search/entity/list" }],
};
const normalizeCountry = (raw: string) => {
  const country = raw.trim().toLowerCase();
  const codes: Record<string, string> = { "united states": "US", "united states of america": "US", usa: "US", india: "IN", "united kingdom": "GB", uk: "GB", canada: "CA", australia: "AU", japan: "JP", germany: "DE", france: "FR", netherlands: "NL", switzerland: "CH" };
  return codes[country] ?? (/^[A-Z]{2}$/.test(raw) ? raw.toUpperCase() : "");
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ticker = params.get("ticker")?.trim().toUpperCase() ?? "";
  const companyName = params.get("company")?.trim() || ticker;
  const country = normalizeCountry(params.get("country") ?? "");
  if (!/^[A-Z0-9.^=_-]{1,24}$/.test(ticker)) return Response.json({ error: "Enter a valid stock ticker." }, { status: 400 });

  if (country !== "US") {
    const companySources = sources[country] ?? [{ name: "OpenCorporates company search", url: (company: string) => `https://opencorporates.com/companies?q=${encodeURIComponent(company)}` }];
    return Response.json({ ticker, company: companyName, country: country || "Unknown", filings: [], sources: companySources.map((source) => ({ name: source.name, url: typeof source.url === "function" ? source.url(companyName) : source.url })) });
  }

  try {
    const mappingResponse = await fetch("https://www.sec.gov/files/company_tickers.json", { headers, signal: AbortSignal.timeout(12000), cache: "force-cache", next: { revalidate: 86400 } });
    if (!mappingResponse.ok) return Response.json({ error: "SEC ticker directory is unavailable." }, { status: 502 });
    const mapping = await mappingResponse.json() as Record<string, TickerEntry>;
    const company = Object.values(mapping).find((entry) => entry.ticker.toUpperCase() === ticker);
    if (!company) return Response.json({ ticker, company: companyName, country, filings: [], sources: [{ name: "U.S. SEC EDGAR", url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(companyName)}` }] });
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
    return Response.json({ ticker, company: data.name, country, cik, filings, sources: [{ name: "U.S. SEC EDGAR", url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(company.title)}` }] });
  } catch {
    return Response.json({ error: "Could not reach SEC EDGAR. Try again shortly." }, { status: 502 });
  }
}
