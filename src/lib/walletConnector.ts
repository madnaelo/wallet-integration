import EthereumProvider from "@walletconnect/ethereum-provider";
import type { Eip1193Provider } from "@/lib/wallet";

type ConnectResult = {
  provider: Eip1193Provider;
  kind: "injected" | "walletconnect";
};

let activeProvider: Eip1193Provider | null = null;
let activeKind: ConnectResult["kind"] | null = null;

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
    methods: [
      "eth_accounts",
      "eth_requestAccounts",
      "eth_chainId",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "eth_sendTransaction",
      "eth_sign",
      "personal_sign",
      "eth_signTypedData",
      "eth_signTypedData_v4"
    ],
    events: ["accountsChanged", "chainChanged", "disconnect"]
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
