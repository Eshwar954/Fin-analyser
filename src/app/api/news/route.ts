import { NextRequest } from "next/server";

type NewsItem = { title: string; link: string; publishedAt: string; source: string; summary: string };
const locales: Record<string, { hl: string; ceid: string }> = {
  US: { hl: "en-US", ceid: "US:en" },
  IN: { hl: "en-IN", ceid: "IN:en" },
  GB: { hl: "en-GB", ceid: "GB:en" },
  CA: { hl: "en-CA", ceid: "CA:en" },
  AU: { hl: "en-AU", ceid: "AU:en" },
  JP: { hl: "ja-JP", ceid: "JP:ja" },
  DE: { hl: "de-DE", ceid: "DE:de" },
  FR: { hl: "fr-FR", ceid: "FR:fr" },
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function field(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";
  const country = params.get("country")?.trim().toUpperCase() ?? "US";
  if (!query || query.length > 120) return Response.json({ error: "Enter a company name or ticker to search news." }, { status: 400 });

  const locale = locales[country] ?? locales.US;
  const feedUrl = new URL("https://news.google.com/rss/search");
  feedUrl.searchParams.set("q", query);
  feedUrl.searchParams.set("hl", locale.hl);
  feedUrl.searchParams.set("gl", locales[country] ? country : "US");
  feedUrl.searchParams.set("ceid", locale.ceid);

  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 MarketOS News Reader/1.0", Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ error: `Google News returned ${response.status}.` }, { status: 502 });
    const xml = await response.text();
    const items: NewsItem[] = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 20).flatMap((match) => {
      const item = match[1];
      const title = field(item, "title");
      const link = field(item, "link");
      if (!title || !link) return [];
      return [{ title, link, publishedAt: field(item, "pubDate"), source: field(item, "source") || "Google News", summary: field(item, "description") }];
    });
    return Response.json({ query, country, source: "Google News RSS", feedUrl: feedUrl.toString(), items });
  } catch {
    return Response.json({ error: "Could not load Google News right now. Please try again." }, { status: 502 });
  }
}
