"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TokenInfo } from "@/lib/tokens";

const MAX_VISIBLE_TOKENS = 100;

export type TokenPickerChain = {
  chainId: number;
  name: string;
};

export type TokenPickerOption = TokenInfo & {
  chainId: number;
  chainName: string;
};

type TokenPickerProps = {
  label: string;
  value: string;
  selectedChainId: number;
  chains: TokenPickerChain[];
  tokens: TokenPickerOption[];
  loading: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (address: string, chainId: number) => void;
};

export function TokenPicker({
  label,
  value,
  selectedChainId,
  chains,
  tokens,
  loading,
  invalid,
  describedBy,
  onChange
}: TokenPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [networkFilter, setNetworkFilter] = useState<number | "all">(selectedChainId);
  const selectedToken = useMemo(() => findToken(tokens, value, selectedChainId), [tokens, value, selectedChainId]);
  const filteredTokens = useMemo(
    () => tokens.filter((token) => networkFilter === "all" || token.chainId === networkFilter),
    [networkFilter, tokens]
  );
  const matchingTokens = useMemo(() => searchTokens(filteredTokens, query), [filteredTokens, query]);
  const visibleTokens = matchingTokens.slice(0, MAX_VISIBLE_TOKENS);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setNetworkFilter(selectedChainId);
  }, [open, selectedChainId]);

  return (
    <div className={`tokenPicker${open ? " tokenPickerOpen" : ""}`} ref={rootRef}>
      <div className="label">{label}</div>
      <button
        className="tokenPickerButton"
        type="button"
        aria-expanded={open}
        aria-describedby={describedBy}
        data-invalid={invalid ? "true" : undefined}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
          setNetworkFilter(selectedChainId);
        }}
      >
        <span className="tokenPickerSymbol">{selectedToken?.symbol ?? "Select token"}</span>
        <span className="tokenPickerName">
          {selectedToken ? selectedTokenCaption(selectedToken) : ""}
        </span>
        <span className="tokenPickerChevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="tokenPickerPanel">
          <div className="tokenNetworkTabs" role="group" aria-label={`${label} networks`}>
            <button
              className={`tokenNetworkTab${networkFilter === "all" ? " tokenNetworkTabActive" : ""}`}
              type="button"
              onClick={() => setNetworkFilter("all")}
            >
              All
            </button>
            {chains.map((chain) => (
              <button
                className={`tokenNetworkTab${networkFilter === chain.chainId ? " tokenNetworkTabActive" : ""}`}
                type="button"
                key={chain.chainId}
                onClick={() => setNetworkFilter(chain.chainId)}
              >
                {shortNetworkName(chain.name)}
              </button>
            ))}
          </div>
          <input
            className="input tokenSearch"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={loading ? "Loading tokens..." : `Search ${filteredTokens.length} tokens`}
            aria-label={`${label} search`}
          />
          <div className="tokenPickerList">
            {visibleTokens.map((token) => (
              <button
                className={`tokenPickerOption${sameToken(token.address, value) && token.chainId === selectedChainId ? " tokenPickerOptionSelected" : ""}`}
                type="button"
                key={`${token.chainId}:${token.address}`}
                onClick={() => {
                  onChange(token.address, token.chainId);
                  setOpen(false);
                }}
              >
                <span className="tokenPickerOptionSymbol">{token.symbol}</span>
                <span className="tokenPickerOptionMeta">
                  <span>{tokenCaption(token)}</span>
                  <span>{displayNetworkName(token)}</span>
                  <span className="mono">{token.isNative ? "" : shortAddress(token.address)}</span>
                </span>
              </button>
            ))}
            {!loading && !visibleTokens.length ? <div className="tokenPickerEmpty">No matching tokens.</div> : null}
          </div>
          {matchingTokens.length > visibleTokens.length ? (
            <div className="small tokenPickerHint">Keep typing to narrow the list.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function searchTokens(tokens: TokenPickerOption[], query: string): TokenPickerOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tokens;

  return tokens
    .map((token, order) => ({ token, order, score: scoreTokenMatch(token, normalized) }))
    .filter((match) => match.score < Number.POSITIVE_INFINITY)
    .sort((first, second) => first.score - second.score || first.order - second.order)
    .map((match) => match.token);
}

function scoreTokenMatch(token: TokenPickerOption, query: string): number {
  const symbol = token.symbol.toLowerCase();
  const name = (token.name ?? "").toLowerCase();
  const address = token.address.toLowerCase();
  const network = displayNetworkName(token).toLowerCase();
  const aliases = (token.searchAliases ?? []).map((alias) => alias.toLowerCase());

  if (address === query) return 0;
  if (symbol === query) return 1;
  if (aliases.some((alias) => alias === query)) return 2;
  if (name === query) return 3;
  if (network === query) return 4;
  if (symbol.startsWith(query)) return 5;
  if (aliases.some((alias) => alias.startsWith(query))) return 6;
  if (name.startsWith(query)) return 7;
  if (network.startsWith(query)) return 8;
  if (symbol.includes(query)) return 9;
  if (aliases.some((alias) => alias.includes(query))) return 10;
  if (name.includes(query)) return 11;
  if (network.includes(query)) return 12;
  if (address.includes(query)) return 13;
  return Number.POSITIVE_INFINITY;
}

function findToken(tokens: TokenPickerOption[], address: string, chainId: number): TokenPickerOption | undefined {
  return tokens.find((token) => token.chainId === chainId && sameToken(token.address, address));
}

function sameToken(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function selectedTokenCaption(token: TokenPickerOption): string {
  const name = token.isNative ? token.name ?? "Native" : token.name ?? token.symbol;
  return `${displayNetworkName(token)}${name ? ` - ${name}` : ""}`;
}

function tokenCaption(token: TokenPickerOption): string {
  if (token.assetKind === "bitcoin") return token.name ?? token.symbol;
  return token.isNative ? "Native token" : token.name ?? token.symbol;
}

function displayNetworkName(token: TokenPickerOption): string {
  return token.assetKind === "bitcoin" ? token.networkName ?? "Bitcoin network" : token.chainName;
}

function shortNetworkName(value: string): string {
  return value
    .replace(/\s+Mainnet$/i, "")
    .replace(/\s+Network$/i, "")
    .trim();
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
