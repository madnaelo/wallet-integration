"use client";

import "@/context/appkit";
import { useEffect, useMemo, useRef } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
  useDisconnect,
  useWalletInfo
} from "@reown/appkit/react";
import type { BitcoinConnector } from "@reown/appkit-adapter-bitcoin";
import {
  useAppKitConnection,
  type Connection as SolanaConnection,
  type Provider as SolanaProvider
} from "@reown/appkit-adapter-solana/react";
import type { WalletNamespace } from "@/lib/ecosystems";
import type { Eip1193Provider } from "@/lib/wallet";

export type { WalletNamespace } from "@/lib/ecosystems";
export type WalletBridgeOpenOptions = {
  view: "Connect" | "Account";
  namespace: WalletNamespace;
};
export type WalletBridgeDisconnectOptions = {
  namespace: WalletNamespace;
};
export type WalletBridgeState = {
  evmAddress?: string;
  evmConnected: boolean;
  bitcoinAddress?: string;
  bitcoinConnected?: boolean;
  solanaAddress?: string;
  solanaConnected?: boolean;
  evmProvider?: Eip1193Provider;
  bitcoinProvider?: BitcoinConnector;
  solanaProvider?: SolanaProvider;
  solanaConnection?: SolanaConnection;
  providerType?: string;
  bitcoinProviderType?: string;
  solanaProviderType?: string;
  evmWalletName?: string;
  bitcoinWalletName?: string;
  bitcoinWalletType?: string;
  solanaWalletName?: string;
  solanaWalletType?: string;
  embeddedUser?: {
    username?: string | null;
    email?: string | null;
  };
};
export type WalletBridgeActions = {
  open: (options: WalletBridgeOpenOptions) => Promise<void>;
  disconnect: (options: WalletBridgeDisconnectOptions) => Promise<void>;
};

type WalletBridgeProps = {
  onState: (state: WalletBridgeState) => void;
  onActions: (actions: WalletBridgeActions | null) => void;
};

export default function WalletBridge({ onState, onActions }: WalletBridgeProps) {
  const { open } = useAppKit();
  const evmAccount = useAppKitAccount({ namespace: "eip155" });
  const bitcoinAccount = useAppKitAccount({ namespace: "bip122" });
  const solanaAccount = useAppKitAccount({ namespace: "solana" });
  const { walletProvider, walletProviderType } = useAppKitProvider<Eip1193Provider>("eip155");
  const { walletProvider: bitcoinProvider, walletProviderType: bitcoinProviderType } =
    useAppKitProvider<BitcoinConnector>("bip122");
  const { walletProvider: solanaProvider, walletProviderType: solanaProviderType } =
    useAppKitProvider<SolanaProvider>("solana");
  const { connection: solanaConnection } = useAppKitConnection();
  const { walletInfo: evmWalletInfo } = useWalletInfo("eip155");
  const { walletInfo: bitcoinWalletInfo } = useWalletInfo("bip122");
  const { walletInfo: solanaWalletInfo } = useWalletInfo("solana");
  const { disconnect } = useDisconnect();
  const openRef = useRef(open);
  const disconnectRef = useRef(disconnect);

  useEffect(() => {
    openRef.current = open;
    disconnectRef.current = disconnect;
  }, [disconnect, open]);

  const actions = useMemo<WalletBridgeActions>(
    () => ({
      open: async (options) => {
        await openRef.current(options);
      },
      disconnect: async (options) => {
        await disconnectRef.current(options);
      }
    }),
    []
  );

  useEffect(() => {
    onActions(actions);
    return () => onActions(null);
  }, [actions, onActions]);

  useEffect(() => {
    onState({
      evmAddress: evmAccount.address,
      evmConnected: evmAccount.isConnected,
      bitcoinAddress: bitcoinAccount.address,
      bitcoinConnected: bitcoinAccount.isConnected,
      solanaAddress: solanaAccount.address,
      solanaConnected: solanaAccount.isConnected,
      evmProvider: walletProvider,
      bitcoinProvider,
      solanaProvider,
      solanaConnection,
      providerType: walletProviderType,
      bitcoinProviderType,
      solanaProviderType,
      evmWalletName: evmWalletInfo?.name,
      bitcoinWalletName: bitcoinWalletInfo?.name,
      bitcoinWalletType: bitcoinWalletInfo?.type,
      solanaWalletName: solanaWalletInfo?.name,
      solanaWalletType: solanaWalletInfo?.type,
      embeddedUser: evmAccount.embeddedWalletInfo?.user
    });
  }, [
    bitcoinAccount.address,
    bitcoinAccount.isConnected,
    bitcoinProvider,
    bitcoinProviderType,
    bitcoinWalletInfo?.name,
    bitcoinWalletInfo?.type,
    evmAccount.address,
    evmAccount.embeddedWalletInfo?.user,
    evmAccount.isConnected,
    evmWalletInfo?.name,
    onState,
    solanaAccount.address,
    solanaAccount.isConnected,
    solanaConnection,
    solanaProvider,
    solanaProviderType,
    solanaWalletInfo?.name,
    solanaWalletInfo?.type,
    walletProvider,
    walletProviderType
  ]);

  return null;
}
