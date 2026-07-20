"use client";

import { createAppKit } from "@reown/appkit/react";
import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { bitcoin, type AppKitNetwork } from "@reown/appkit/networks";
import { getAllowedChains } from "@/lib/chains";
import { WALLETCONNECT_PROJECT_ID } from "@/lib/walletConfig";

const placeholderProjectId = "your_walletconnect_project_id_here";
const projectId = WALLETCONNECT_PROJECT_ID || placeholderProjectId;

const configuredNetworks = getAllowedChains().flatMap(toAppKitNetwork);

const evmNetworks = configuredNetworks.length ? configuredNetworks : [fallbackSepoliaNetwork()];
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  evmNetworks[0]!,
  ...evmNetworks.slice(1),
  bitcoin
];
const appUrl = typeof window === "undefined"
  ? (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://swapassistant.local")
  : window.location.origin;
type AppKitMetadataWithRedirect = {
  name: string;
  description: string;
  url: string;
  icons: string[];
  redirect?: {
    universal?: string;
  };
};
const metadata: AppKitMetadataWithRedirect = {
  name: "Swap Assistant",
  description: "Your Personal Swap Assistant",
  url: appUrl,
  icons: [new URL("/icon-192.png", appUrl).toString()],
  redirect: {
    universal: appUrl
  }
};

createAppKit({
  adapters: [new EthersAdapter(), new BitcoinAdapter({ projectId })],
  projectId,
  networks,
  defaultNetwork: evmNetworks[0],
  metadata,
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

function toAppKitNetwork(chain: ReturnType<typeof getAllowedChains>[number]): AppKitNetwork[] {
  if (!chain.rpcUrls?.length || !chain.nativeCurrency) return [];
  const explorerUrl = chain.blockExplorerUrls?.[0];
  return [{
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: { default: { http: chain.rpcUrls } },
    ...(explorerUrl ? {
      blockExplorers: { default: { name: `${chain.name} explorer`, url: explorerUrl } }
    } : {})
  }];
}

function fallbackSepoliaNetwork(): AppKitNetwork {
  return {
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.sepolia.org"] } },
    blockExplorers: { default: { name: "Sepolia explorer", url: "https://sepolia.etherscan.io" } }
  };
}
