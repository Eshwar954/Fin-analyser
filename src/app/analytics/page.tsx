import { ViewTransition } from "react";
import AnalyticsClient from "./AnalyticsClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const symbol = first(params.symbol);
  const start = first(params.start);
  const end = first(params.end);
  const interval = first(params.interval);
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <AnalyticsClient initialSymbol={symbol && /^[A-Za-z0-9.^=_-]{1,24}$/.test(symbol) ? symbol : "AAPL"} initialStart={start} initialEnd={end} initialInterval={interval} />
    </ViewTransition>
  );
}
