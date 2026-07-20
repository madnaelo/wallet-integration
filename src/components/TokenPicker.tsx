"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TokenInfo } from "@/lib/tokens";

const MAX_VISIBLE_TOKENS = 100;
const TOKEN_MATCH_SCORE_COUNT = 14;

export type TokenPickerNetwork = {
  id: string;
  name: string;
};

export type TokenPickerOption = TokenInfo & {
  networkId: string;
  networkName: string;
  quoteChainId?: number;
  supportedQuoteChainIds?: number[];
};

type TokenPickerProps = {
  label: string;
  value: string;
  selectedNetworkId: string;
  networks: TokenPickerNetwork[];
  tokens: TokenPickerOption[];
  loading: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (token: TokenPickerOption) => void;
  onNetworkChange?: (networkId: string | "all") => void;
  onResolveAddress?: (
    networkId: string,
    address: string,
    signal: AbortSignal
  ) => Promise<TokenPickerOption | null>;
};

export function TokenPicker({
  label,
  value,
  selectedNetworkId,
  networks,
  tokens,
  loading,
  invalid,
  describedBy,
  onChange,
  onNetworkChange,
  onResolveAddress
}: TokenPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [networkFilter, setNetworkFilter] = useState<string | "all">(selectedNetworkId);
  const [resolvedAddressToken, setResolvedAddressToken] = useState<TokenPickerOption | null>(null);
  const [addressLookupState, setAddressLookupState] = useState<"idle" | "loading" | "not-found" | "error">("idle");
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const selectedToken = useMemo(() => findToken(tokens, value, selectedNetworkId), [tokens, value, selectedNetworkId]);
  const filteredTokens = useMemo(
    () => tokens.filter((token) => networkFilter === "all" || token.networkId === networkFilter),
    [networkFilter, tokens]
  );
  const matchingTokens = useMemo(() => searchTokens(filteredTokens, query), [filteredTokens, query]);
  const visibleTokens = matchingTokens.slice(0, MAX_VISIBLE_TOKENS);
  const exactAddressQuery = query.trim();
  const looksLikeAddress = isTokenAddressQuery(exactAddressQuery);
  const hasExactAddressMatch = filteredTokens.some((token) => sameToken(token.address, exactAddressQuery));
  const useNetworkMenu = networks.length > 12;

  const selectNetwork = (networkId: string | "all") => {
    setNetworkFilter(networkId);
    onNetworkChange?.(networkId);
  };

  useEffect(() => {
    if (!open) return;

    const updatePanelPosition = () => setPanelPosition(calculatePanelPosition(rootRef.current));
    updatePanelPosition();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPosition(null);
      return;
    }

    setPanelPosition(calculatePanelPosition(rootRef.current));
  }, [open, filteredTokens.length, query]);

  useEffect(() => {
    if (!open) setNetworkFilter(selectedNetworkId);
  }, [open, selectedNetworkId]);

  useEffect(() => {
    setResolvedAddressToken(null);
    if (
      !open
      || !onResolveAddress
      || networkFilter === "all"
      || !looksLikeAddress
      || hasExactAddressMatch
    ) {
      setAddressLookupState("idle");
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setAddressLookupState("loading");
      void onResolveAddress(networkFilter, exactAddressQuery, controller.signal)
        .then((token) => {
          if (controller.signal.aborted) return;
          setResolvedAddressToken(token);
          setAddressLookupState(token ? "idle" : "not-found");
        })
        .catch((error: any) => {
          if (controller.signal.aborted || error?.name === "AbortError") return;
          setAddressLookupState("error");
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [exactAddressQuery, hasExactAddressMatch, looksLikeAddress, networkFilter, onResolveAddress, open]);

  return (
    <div className={`tokenPicker${open ? " tokenPickerOpen" : ""}`} ref={rootRef}>
      <div className="label">{label}</div>
      <button
        ref={triggerRef}
        className="tokenPickerButton"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={`${label}: ${selectedToken?.symbol ?? "select token"}`}
        aria-describedby={describedBy}
        data-invalid={invalid ? "true" : undefined}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
          setNetworkFilter(selectedNetworkId);
        }}
      >
        <span className="tokenPickerSymbol">{selectedToken?.symbol ?? "Select token"}</span>
        <span className="tokenPickerName">
          {selectedToken ? selectedTokenCaption(selectedToken) : ""}
        </span>
        <span className="tokenPickerChevron" aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          className="tokenPickerPanel"
          role="dialog"
          aria-label={`${label} options`}
          style={panelPosition ? {
            left: panelPosition.left,
            top: panelPosition.top,
            width: panelPosition.width,
            maxHeight: panelPosition.maxHeight
          } : undefined}
        >
          {useNetworkMenu ? (
            <select
              className="input tokenNetworkSelect"
              aria-label={`${label} network`}
              value={networkFilter}
              onChange={(event) => selectNetwork(event.target.value)}
            >
              <option value="all">All networks</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>{shortNetworkName(network.name)}</option>
              ))}
            </select>
          ) : (
            <div className="tokenNetworkTabs" role="group" aria-label={`${label} networks`}>
              <button
                className={`tokenNetworkTab${networkFilter === "all" ? " tokenNetworkTabActive" : ""}`}
                type="button"
                aria-pressed={networkFilter === "all"}
                onClick={() => selectNetwork("all")}
              >
                All
              </button>
              {networks.map((network) => (
                <button
                  className={`tokenNetworkTab${networkFilter === network.id ? " tokenNetworkTabActive" : ""}`}
                  type="button"
                  aria-pressed={networkFilter === network.id}
                  key={network.id}
                  onClick={() => selectNetwork(network.id)}
                >
                  {shortNetworkName(network.name)}
                </button>
              ))}
            </div>
          )}
          <input
            className="input tokenSearch"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={loading ? "Loading tokens..." : `Search ${filteredTokens.length} tokens`}
            aria-label={`${label} search`}
          />
          <div className="tokenPickerList">
            {resolvedAddressToken ? (
              <button
                className="tokenPickerOption tokenPickerResolvedOption"
                type="button"
                onClick={() => {
                  onChange(resolvedAddressToken);
                  setOpen(false);
                  window.requestAnimationFrame(() => triggerRef.current?.focus());
                }}
              >
                <span className="tokenPickerOptionSymbol">{resolvedAddressToken.symbol}</span>
                <span className="tokenPickerOptionMeta">
                  <span>{tokenCaption(resolvedAddressToken)}</span>
                  <span>{resolvedAddressToken.networkName}</span>
                  <span className="mono">{shortAddress(resolvedAddressToken.address)}</span>
                  <span className="tokenPickerResolvedWarning">Added by address. Check it carefully.</span>
                </span>
              </button>
            ) : null}
            {visibleTokens.map((token) => (
              <button
                className={`tokenPickerOption${token.isCustom ? " tokenPickerResolvedOption" : ""}${sameToken(token.address, value) && token.networkId === selectedNetworkId ? " tokenPickerOptionSelected" : ""}`}
                type="button"
                key={`${token.networkId}:${token.address}`}
                onClick={() => {
                  onChange(token);
                  setOpen(false);
                  window.requestAnimationFrame(() => triggerRef.current?.focus());
                }}
              >
                <span className="tokenPickerOptionSymbol">{token.symbol}</span>
                <span className="tokenPickerOptionMeta">
                  <span>{tokenCaption(token)}</span>
                  <span>{token.networkName}</span>
                  <span className="mono">{token.isNative ? "" : shortAddress(token.address)}</span>
                  {token.isCustom ? (
                    <span className="tokenPickerResolvedWarning">Added by address. Check it carefully.</span>
                  ) : null}
                </span>
              </button>
            ))}
            {looksLikeAddress && networkFilter === "all" ? (
              <div className="tokenPickerEmpty">Choose a network to search this address.</div>
            ) : null}
            {addressLookupState === "loading" ? <div className="tokenPickerEmpty">Checking this address...</div> : null}
            {addressLookupState === "not-found" ? (
              <div className="tokenPickerEmpty">No token was found at this address on the selected network.</div>
            ) : null}
            {addressLookupState === "error" ? (
              <div className="tokenPickerEmpty">Token search is unavailable right now.</div>
            ) : null}
            {!loading
              && !visibleTokens.length
              && !resolvedAddressToken
              && !looksLikeAddress
              ? <div className="tokenPickerEmpty">No matching tokens.</div>
              : null}
          </div>
          {matchingTokens.length > visibleTokens.length ? (
            <div className="small tokenPickerHint">Keep typing to narrow the list.</div>
          ) : null}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function calculatePanelPosition(root: HTMLDivElement | null) {
  const viewportMargin = Math.min(12, Math.max(4, Math.floor(window.innerWidth / 20)));
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.max(0, Math.min(360, viewportWidth - viewportMargin * 2));

  if (!root) {
    return {
      left: viewportMargin,
      top: viewportMargin,
      width,
      maxHeight: Math.max(0, viewportHeight - viewportMargin * 2)
    };
  }

  const rect = root.getBoundingClientRect();
  const left = Math.max(
    viewportMargin,
    Math.min(rect.left, viewportWidth - width - viewportMargin)
  );
  const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - viewportMargin);
  const availableAbove = Math.max(0, rect.top - gap - viewportMargin);
  const openAbove = availableBelow < 280 && availableAbove > availableBelow;
  const availableHeight = openAbove ? availableAbove : availableBelow;
  const top = openAbove
    ? Math.max(viewportMargin, rect.top - gap - Math.min(420, availableAbove))
    : Math.min(rect.bottom + gap, viewportHeight - viewportMargin);
  const maxHeight = Math.max(0, Math.min(420, availableHeight, viewportHeight - viewportMargin * 2));

  return { left, top, width, maxHeight };
}

function searchTokens(tokens: TokenPickerOption[], query: string): TokenPickerOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tokens;

  const matches = Array.from(
    { length: TOKEN_MATCH_SCORE_COUNT },
    () => [] as TokenPickerOption[]
  );
  for (const token of tokens) {
    const score = scoreTokenMatch(token, normalized);
    if (score < TOKEN_MATCH_SCORE_COUNT) matches[score]!.push(token);
  }
  return matches.flat();
}

function scoreTokenMatch(token: TokenPickerOption, query: string): number {
  const symbol = token.symbol.toLowerCase();
  const name = (token.name ?? "").toLowerCase();
  const address = token.address.toLowerCase();
  const network = token.networkName.toLowerCase();
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

function findToken(tokens: TokenPickerOption[], address: string, networkId: string): TokenPickerOption | undefined {
  return tokens.find((token) => token.networkId === networkId && sameToken(token.address, address));
}

function sameToken(first: string, second: string): boolean {
  const left = first.trim();
  const right = second.trim();
  return /^0x[0-9a-f]{40}$/i.test(left) && /^0x[0-9a-f]{40}$/i.test(right)
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isTokenAddressQuery(value: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function selectedTokenCaption(token: TokenPickerOption): string {
  if (token.isCustom) return `${token.networkName} - Added by address`;
  const name = token.isNative ? token.name ?? "Native" : token.name ?? token.symbol;
  return `${token.networkName}${name ? ` - ${name}` : ""}`;
}

function tokenCaption(token: TokenPickerOption): string {
  return token.isNative ? "Native token" : token.name ?? token.symbol;
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
