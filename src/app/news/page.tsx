import { ViewTransition } from "react";
import NewsClient from "./NewsClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawSymbol = first(params.symbol);
  const symbol = rawSymbol && /^[A-Za-z0-9.^=_-]{1,24}$/.test(rawSymbol) ? rawSymbol.toUpperCase() : "AAPL";
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <NewsClient symbol={symbol} company={first(params.company) || symbol} country={first(params.country) || "US"} start={first(params.start)} end={first(params.end)} interval={first(params.interval)} />
    </ViewTransition>
  );
}
