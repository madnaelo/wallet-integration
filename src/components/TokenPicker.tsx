"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TokenInfo } from "@/lib/tokens";

const MAX_VISIBLE_TOKENS = 100;

type TokenPickerProps = {
  label: string;
  value: string;
  tokens: TokenInfo[];
  loading: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (address: string) => void;
};

export function TokenPicker({
  label,
  value,
  tokens,
  loading,
  invalid,
  describedBy,
  onChange
}: TokenPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedToken = useMemo(() => findToken(tokens, value), [tokens, value]);
  const matchingTokens = useMemo(() => searchTokens(tokens, query), [tokens, query]);
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
          <input
            className="input tokenSearch"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={loading ? "Loading tokens..." : `Search ${tokens.length} tokens`}
            aria-label={`${label} search`}
          />
          <div className="tokenPickerList">
            {visibleTokens.map((token) => (
              <button
                className={`tokenPickerOption${sameToken(token.address, value) ? " tokenPickerOptionSelected" : ""}`}
                type="button"
                key={token.address}
                onClick={() => {
                  onChange(token.address);
                  setOpen(false);
                }}
              >
                <span className="tokenPickerOptionSymbol">{token.symbol}</span>
                <span className="tokenPickerOptionMeta">
                  <span>{tokenCaption(token)}</span>
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

function searchTokens(tokens: TokenInfo[], query: string): TokenInfo[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tokens;

  return tokens
    .map((token, order) => ({ token, order, score: scoreTokenMatch(token, normalized) }))
    .filter((match) => match.score < Number.POSITIVE_INFINITY)
    .sort((first, second) => first.score - second.score || first.order - second.order)
    .map((match) => match.token);
}

function scoreTokenMatch(token: TokenInfo, query: string): number {
  const symbol = token.symbol.toLowerCase();
  const name = (token.name ?? "").toLowerCase();
  const address = token.address.toLowerCase();
  const aliases = (token.searchAliases ?? []).map((alias) => alias.toLowerCase());

  if (address === query) return 0;
  if (symbol === query) return 1;
  if (aliases.some((alias) => alias === query)) return 2;
  if (name === query) return 3;
  if (symbol.startsWith(query)) return 4;
  if (aliases.some((alias) => alias.startsWith(query))) return 5;
  if (name.startsWith(query)) return 6;
  if (symbol.includes(query)) return 7;
  if (aliases.some((alias) => alias.includes(query))) return 8;
  if (name.includes(query)) return 9;
  if (address.includes(query)) return 10;
  return Number.POSITIVE_INFINITY;
}

function findToken(tokens: TokenInfo[], address: string): TokenInfo | undefined {
  return tokens.find((token) => sameToken(token.address, address));
}

function sameToken(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function selectedTokenCaption(token: TokenInfo): string {
  if (token.assetKind === "bitcoin") return token.networkName ?? "Bitcoin";
  return token.isNative ? "Native" : token.name ?? token.symbol;
}

function tokenCaption(token: TokenInfo): string {
  if (token.assetKind === "bitcoin") return token.networkName ?? token.name ?? token.symbol;
  return token.isNative ? "Native token" : token.name ?? token.symbol;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
