"use client";

import type { ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { base, mainnet, polygon, sepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { getAllowedChainIds } from "@/lib/chains";

const rawProjectId = (
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  process.env.NEXT_PUBLIC_WALLETCONNECT_ID ??
  ""
).trim();
const placeholderProjectId = "your_walletconnect_project_id_here";
const projectId = rawProjectId || placeholderProjectId;

export const isAppKitConfigured = Boolean(rawProjectId) && !/^your[_-]/i.test(rawProjectId);

const networkByChainId: Record<number, AppKitNetwork> = {
  1: mainnet,
  11155111: sepolia,
  137: polygon,
  8453: base
};

const configuredNetworks = getAllowedChainIds()
  .map((chainId) => networkByChainId[chainId])
  .filter((network): network is AppKitNetwork => Boolean(network));

const networks = (configuredNetworks.length ? configuredNetworks : [sepolia]) as [AppKitNetwork, ...AppKitNetwork[]];

createAppKit({
  adapters: [new EthersAdapter()],
  projectId,
  networks,
  defaultNetwork: networks[0],
  metadata: {
    name: "The Wallet",
    description: "Your Personal Swap Aggregator",
    url: typeof window === "undefined" ? "https://thewallet.local" : window.location.origin,
    icons: []
  },
  features: {
    analytics: false,
    email: false,
    socials: false
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#6ea8fe",
    "--w3m-border-radius-master": "2px"
  }
});

export function AppKitProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
