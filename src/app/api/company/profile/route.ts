import { NextRequest } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const validTicker = /^[A-Z0-9.^=_-]{1,24}$/;
const valueOf = (value: unknown) => {
  if (typeof value === "number" || typeof value === "string") return value;
  if (value && typeof value === "object" && "raw" in value) return (value as { raw?: unknown }).raw;
  return null;
};

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  if (!validTicker.test(symbol)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });

  try {
    const result = await yahoo.quoteSummary(symbol, {
      modules: ["assetProfile", "financialData", "defaultKeyStatistics", "majorHoldersBreakdown", "institutionOwnership", "fundOwnership", "price"],
    });
    const profile = result.assetProfile;
    const financials = result.financialData;
    const statistics = result.defaultKeyStatistics;
    const price = result.price;
    const summary = profile?.longBusinessSummary ?? "";
    const foundedMatch = summary.match(/\b(?:founded|established)\s+(?:in\s+)?((?:18|19|20)\d{2})\b/i);
    const ownershipRows = [
      ...(result.institutionOwnership?.ownershipList ?? []),
      ...(result.fundOwnership?.ownershipList ?? []),
    ].sort((a, b) => (b.pctHeld ?? 0) - (a.pctHeld ?? 0));

    return Response.json({
      symbol,
      asOf: new Date().toISOString(),
      source: "Yahoo Finance",
      profile: {
        name: price?.longName ?? price?.shortName ?? symbol,
        country: profile?.country ?? null,
        sector: profile?.sectorDisp ?? profile?.sector ?? null,
        industry: profile?.industryDisp ?? profile?.industry ?? null,
        description: summary || null,
        founded: foundedMatch?.[1] ?? null,
        employees: valueOf(profile?.fullTimeEmployees),
        website: profile?.website ?? null,
        headquarters: [profile?.address1, profile?.city, profile?.state, profile?.country].filter(Boolean).join(", ") || null,
        officers: (profile?.companyOfficers ?? []).map((officer) => ({ name: officer.name, title: officer.title, age: officer.age, fiscalYear: officer.fiscalYear, totalPay: officer.totalPay })),
      },
      growth: {
        revenueGrowth: valueOf(financials?.revenueGrowth),
        earningsGrowth: valueOf(financials?.earningsGrowth),
        quarterlyEarningsGrowth: valueOf(statistics?.earningsQuarterlyGrowth),
        revenue: valueOf(financials?.totalRevenue),
        ebitda: valueOf(financials?.ebitda),
        profitMargin: valueOf(financials?.profitMargins),
        returnOnEquity: valueOf(financials?.returnOnEquity),
        revenueCurrency: financials?.financialCurrency ?? price?.currency ?? null,
        mostRecentQuarter: valueOf(statistics?.mostRecentQuarter),
      },
      ownership: {
        sharesOutstanding: valueOf(statistics?.sharesOutstanding),
        floatShares: valueOf(statistics?.floatShares),
        insiderPercent: valueOf(result.majorHoldersBreakdown?.insidersPercentHeld),
        institutionPercent: valueOf(result.majorHoldersBreakdown?.institutionsPercentHeld),
        institutionsCount: valueOf(result.majorHoldersBreakdown?.institutionsCount),
        holders: ownershipRows.slice(0, 10).map((holder) => ({ name: holder.organization, percent: valueOf(holder.pctHeld), shares: valueOf(holder.position), reportDate: valueOf(holder.reportDate) })),
      },
      marketCap: valueOf(price?.marketCap),
    });
  } catch {
    return Response.json({ error: "Company profile data is unavailable from Yahoo Finance right now." }, { status: 502 });
  }
}
