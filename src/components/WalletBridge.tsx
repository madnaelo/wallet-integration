"use client";

import "@/context/appkit";
import { useEffect, useMemo } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
  useDisconnect,
  useWalletInfo
} from "@reown/appkit/react";
import type { Eip1193Provider } from "@/lib/wallet";

export type WalletNamespace = "eip155" | "bip122";
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
  evmProvider?: Eip1193Provider;
  providerType?: string;
  evmWalletName?: string;
  bitcoinWalletName?: string;
  bitcoinWalletType?: string;
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
  const { walletProvider, walletProviderType } = useAppKitProvider<Eip1193Provider>("eip155");
  const { walletInfo: evmWalletInfo } = useWalletInfo("eip155");
  const { walletInfo: bitcoinWalletInfo } = useWalletInfo("bip122");
  const { disconnect } = useDisconnect();

  const actions = useMemo<WalletBridgeActions>(
    () => ({
      open: async (options) => {
        await open(options);
      },
      disconnect: async (options) => {
        await disconnect(options);
      }
    }),
    [disconnect, open]
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
      evmProvider: walletProvider,
      providerType: walletProviderType,
      evmWalletName: evmWalletInfo?.name,
      bitcoinWalletName: bitcoinWalletInfo?.name,
      bitcoinWalletType: bitcoinWalletInfo?.type,
      embeddedUser: evmAccount.embeddedWalletInfo?.user
    });
  }, [
    bitcoinAccount.address,
    bitcoinWalletInfo?.name,
    bitcoinWalletInfo?.type,
    evmAccount.address,
    evmAccount.embeddedWalletInfo?.user,
    evmAccount.isConnected,
    evmWalletInfo?.name,
    onState,
    walletProvider,
    walletProviderType
  ]);

  return null;
}
