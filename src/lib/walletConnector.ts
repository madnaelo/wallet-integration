import EthereumProvider from "@walletconnect/ethereum-provider";
import type { Eip1193Provider } from "@/lib/wallet";

type ConnectResult = {
  provider: Eip1193Provider;
  kind: "injected" | "walletconnect";
};

let activeProvider: Eip1193Provider | null = null;
let activeKind: ConnectResult["kind"] | null = null;

const WALLETCONNECT_REQUIRED_METHODS = ["eth_sendTransaction", "personal_sign"];
const WALLETCONNECT_OPTIONAL_METHODS = [
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
  "eth_call",
  "eth_getBalance",
  "eth_sendRawTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain"
];
const WALLETCONNECT_REQUIRED_EVENTS = ["chainChanged", "accountsChanged"];
const WALLETCONNECT_OPTIONAL_EVENTS = ["disconnect", "connect", "message"];

export function getActiveProvider(): Eip1193Provider | null {
  return activeProvider;
}

export function getActiveProviderKind(): ConnectResult["kind"] | null {
  return activeKind;
}

export function hasInjectedProvider(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum;
}

export function walletSessionSupportsMethod(provider: Eip1193Provider | null, method: string): boolean | null {
  const p: any = provider;
  const methods = p?.session?.namespaces?.eip155?.methods;
  if (!Array.isArray(methods)) return null;
  return methods.includes(method);
}

export async function connectWallet(params: {
  allowedChainIds: number[];
}): Promise<ConnectResult> {
  if (typeof window === "undefined") {
    throw new Error("Wallet connection must be initiated in the browser.");
  }

  const [primaryChainId, ...additionalChainIds] = params.allowedChainIds;
  if (primaryChainId === undefined) {
    throw new Error("At least one allowed chain is required to connect a wallet.");
  }
  const walletConnectChains = [primaryChainId, ...additionalChainIds] as [number, ...number[]];

  // Prefer injected provider (MetaMask or any injected wallet)
  if (window.ethereum) {
    const injected = window.ethereum as Eip1193Provider;
    await injected.request({ method: "eth_requestAccounts" });
    activeProvider = injected;
    activeKind = "injected";
    return { provider: injected, kind: "injected" };
  }

  // Fallback to WalletConnect
  const projectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
    process.env.WALLETCONNECT_PROJECT_ID ??
    "";

  if (!projectId) {
    throw new Error(
      "WalletConnect Project ID is not configured. Set WALLETCONNECT_PROJECT_ID (or NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID)."
    );
  }

  const wc = await EthereumProvider.init({
    projectId,
    chains: walletConnectChains,
    optionalChains: walletConnectChains,
    showQrModal: true,
    methods: WALLETCONNECT_REQUIRED_METHODS,
    optionalMethods: WALLETCONNECT_OPTIONAL_METHODS,
    events: WALLETCONNECT_REQUIRED_EVENTS,
    optionalEvents: WALLETCONNECT_OPTIONAL_EVENTS,
    metadata: {
      name: "Wallet Swap MVP",
      description: "Non-custodial swap assistant",
      url: window.location.origin,
      icons: []
    }
  });

  await wc.enable();

  activeProvider = wc as unknown as Eip1193Provider;
  activeKind = "walletconnect";
  return { provider: activeProvider, kind: "walletconnect" };
}

export async function disconnectWallet(): Promise<void> {
  const p: any = activeProvider;
  try {
    // WalletConnect provider supports disconnect()
    if (p?.disconnect) await p.disconnect();
  } finally {
    activeProvider = null;
    activeKind = null;
  }
}
