import { ViewTransition } from "react";
import CompareClient from "./CompareClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const symbols = (first(params.symbols) ?? "AAPL,MSFT").split(",").filter((symbol) => /^[A-Za-z0-9.^=_-]{1,24}$/.test(symbol)).slice(0, 6);
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <CompareClient initialSymbols={symbols.length ? symbols : ["AAPL", "MSFT"]} initialStart={first(params.start)} initialEnd={first(params.end)} initialInterval={first(params.interval)} />
    </ViewTransition>
  );
}
