"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenPickerOption } from "@/components/TokenPicker";
import { listTokens, resolveTokenAddress } from "@/lib/tokenClient";
import {
  buildFallbackTokensByChain,
  buildTokenPickerNetworks,
  buildTokenPickerOptions,
  getEvmNetworkId
} from "@/lib/tokenPickerOptions";
import type { TokenInfo } from "@/lib/tokens";

type TokenCatalogChain = {
  chainId: number;
  name: string;
  networkId?: string;
};

export function useTokenCatalog(
  chains: TokenCatalogChain[],
  activeChainIds: number[]
) {
  const allowedChainIds = useMemo(
    () => new Set(chains.map((chain) => chain.chainId)),
    [chains]
  );
  const chainByNetworkId = useMemo(
    () => new Map(chains.map((chain) => [
      chain.networkId ?? getEvmNetworkId(chain.chainId),
      chain
    ])),
    [chains]
  );
  const [tokensByChain, setTokensByChain] = useState<Record<number, TokenInfo[]>>(() =>
    buildFallbackTokensByChain(chains.map((chain) => chain.chainId))
  );
  const [tokensLoadingByChain, setTokensLoadingByChain] = useState<Record<number, boolean>>({});
  const [tokenListNotice, setTokenListNotice] = useState("");
  const loadedTokenChainsRef = useRef<Set<number>>(new Set());
  const tokenLoadControllersRef = useRef<Map<number, AbortController>>(new Map());

  const tokenPickerTokens = useMemo(
    () => buildTokenPickerOptions(chains, tokensByChain),
    [chains, tokensByChain]
  );
  const tokenPickerNetworks = useMemo(
    () => buildTokenPickerNetworks(chains, tokenPickerTokens),
    [chains, tokenPickerTokens]
  );
  const tokensLoading = useMemo(
    () => chains.some((chain) => tokensLoadingByChain[chain.chainId]),
    [chains, tokensLoadingByChain]
  );

  const loadTokensForChain = useCallback((chainId: number) => {
    if (
      !allowedChainIds.has(chainId) ||
      loadedTokenChainsRef.current.has(chainId) ||
      tokenLoadControllersRef.current.has(chainId)
    ) {
      return;
    }

    const controller = new AbortController();
    tokenLoadControllersRef.current.set(chainId, controller);
    setTokensLoadingByChain((current) => ({ ...current, [chainId]: true }));
    void listTokens(chainId, controller.signal)
      .then((availableTokens) => {
        loadedTokenChainsRef.current.add(chainId);
        if (!availableTokens.length) return;
        setTokensByChain((current) => ({ ...current, [chainId]: availableTokens }));
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setTokenListNotice("Showing popular tokens while the full list is unavailable.");
      })
      .finally(() => {
        if (tokenLoadControllersRef.current.get(chainId) !== controller) return;
        tokenLoadControllersRef.current.delete(chainId);
        if (controller.signal.aborted) return;
        setTokensLoadingByChain((current) => ({ ...current, [chainId]: false }));
      });
  }, [allowedChainIds]);

  const handleTokenPickerNetworkChange = useCallback((networkId: string | "all") => {
    if (networkId === "all") return;
    const chain = chainByNetworkId.get(networkId);
    if (chain) loadTokensForChain(chain.chainId);
  }, [chainByNetworkId, loadTokensForChain]);

  const resolveTokenPickerAddress = useCallback(async (
    networkId: string,
    address: string,
    signal: AbortSignal
  ): Promise<TokenPickerOption | null> => {
    const chain = chainByNetworkId.get(networkId);
    if (!chain || !allowedChainIds.has(chain.chainId)) return null;

    const token = await resolveTokenAddress(chain.chainId, address, signal);
    if (!token) return null;
    setTokensByChain((current) => {
      const existing = current[chain.chainId] ?? [];
      if (existing.some((candidate) => normalizeTokenKey(candidate.address) === normalizeTokenKey(token.address))) {
        return current;
      }
      return { ...current, [chain.chainId]: [...existing, token] };
    });
    return buildTokenPickerOptions([chain], { [chain.chainId]: [token] })[0] ?? null;
  }, [allowedChainIds, chainByNetworkId]);

  useEffect(() => {
    setTokensByChain((current) => {
      const next = { ...current };
      const fallbacks = buildFallbackTokensByChain(chains.map((chain) => chain.chainId));
      for (const chain of chains) {
        next[chain.chainId] = next[chain.chainId] ?? fallbacks[chain.chainId] ?? [];
      }
      return next;
    });
  }, [chains]);

  useEffect(() => {
    for (const chainId of new Set(activeChainIds)) loadTokensForChain(chainId);
  }, [activeChainIds, loadTokensForChain]);

  useEffect(() => () => {
    tokenLoadControllersRef.current.forEach((controller) => controller.abort());
    tokenLoadControllersRef.current.clear();
  }, []);

  return {
    handleTokenPickerNetworkChange,
    resolveTokenPickerAddress,
    tokenListNotice,
    tokenPickerNetworks,
    tokenPickerTokens,
    tokensByChain,
    tokensLoadingByChain,
    tokensLoading
  };
}

function normalizeTokenKey(address: string): string {
  const normalized = address.trim();
  return /^0x/i.test(normalized) || /^(eth|bitcoin)$/i.test(normalized)
    ? normalized.toLowerCase()
    : normalized;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
