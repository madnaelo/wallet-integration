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
  const matchingTokens = useMemo(() => filterTokens(tokens, query), [tokens, query]);
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
    <div className="tokenPicker" ref={rootRef}>
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
          {selectedToken?.isNative ? "Native" : selectedToken?.name ?? selectedToken?.symbol ?? ""}
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
                  <span>{token.isNative ? "Native token" : token.name ?? token.symbol}</span>
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

function filterTokens(tokens: TokenInfo[], query: string): TokenInfo[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tokens;

  return tokens.filter((token) =>
    [token.symbol, token.name ?? "", token.address].some((value) => value.toLowerCase().includes(normalized))
  );
}

function findToken(tokens: TokenInfo[], address: string): TokenInfo | undefined {
  return tokens.find((token) => sameToken(token.address, address));
}

function sameToken(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
