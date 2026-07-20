import {
  NATIVE_BITCOIN_NETWORK_ID,
  SOLANA_NETWORK_ID,
  type AddressFamily,
  type WalletNamespace
} from "@/lib/ecosystems";
import { isAddress, isBitcoinMainnetAddress, isSolanaAddress } from "@/lib/validation";

type RecipientImportClient = {
  connect: (params: {
    requiredNamespaces: Record<string, {
      chains: string[];
      methods: string[];
      events: string[];
    }>;
  }) => Promise<{ uri?: string; approval: () => Promise<RecipientImportSession> }>;
  disconnect: (params: { topic: string; reason: { code: number; message: string } }) => Promise<void>;
};

type RecipientImportSession = {
  topic: string;
  namespaces?: Record<string, { accounts?: unknown }>;
  peer?: {
    metadata?: {
      name?: unknown;
    };
  };
};

type RecipientWalletImportParams = {
  projectId: string;
  chainId: number;
  addressFamily: AddressFamily;
  origin: string;
};

type ImportedRecipientAddress = {
  address: string;
  topic: string;
  walletName?: string;
};

type RecipientWalletImport = {
  qrDataUrl: string;
  waitForAddress: () => Promise<ImportedRecipientAddress>;
  disconnect: (topic: string) => Promise<void>;
};

let clientPromise: Promise<RecipientImportClient> | null = null;

export async function createRecipientWalletImport({
  projectId,
  chainId,
  addressFamily,
  origin
}: RecipientWalletImportParams): Promise<RecipientWalletImport> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) throw new Error("Wallet import is unavailable right now.");

  const client = await getRecipientImportClient(normalizedProjectId, origin);
  const { uri, approval } = await client.connect({ requiredNamespaces: recipientAddressNamespaces(chainId, addressFamily) });

  if (!uri) throw new Error("Could not start wallet import.");

  const qrDataUrl = await createQrDataUrl(uri, {
    margin: 1,
    width: 260,
    color: {
      dark: "#111827",
      light: "#ffffff"
    }
  });

  return {
    qrDataUrl,
    waitForAddress: async () => {
      const session = await approval();
      const namespace = walletNamespaceForFamily(addressFamily);
      const account = getAccountFromSession(session, namespace, networkIdForFamily(chainId, addressFamily));
      const address = account?.split(":").pop() ?? "";
      if (!isAddressForFamily(address, addressFamily)) throw new Error("Wallet did not return a valid address.");

      return {
        address,
        topic: session.topic,
        walletName: getWalletNameFromSession(session)
      };
    },
    disconnect: async (topic: string) => {
      await client.disconnect({
        topic,
        reason: {
          code: 6000,
          message: "Recipient address imported"
        }
      });
    }
  };
}

function getRecipientImportClient(projectId: string, origin: string): Promise<RecipientImportClient> {
  if (!clientPromise) {
    clientPromise = import("@walletconnect/sign-client").then(({ default: SignClient }) => SignClient.init({
      projectId,
      metadata: {
        name: "Swap Assistant",
        description: "Your Personal Swap Assistant",
        url: origin,
        icons: []
      }
    }));
  }

  return clientPromise;
}

async function createQrDataUrl(
  uri: string,
  options: {
    margin: number;
    width: number;
    color: {
      dark: string;
      light: string;
    };
  }
): Promise<string> {
  const qrCode = await import("qrcode");
  return qrCode.toDataURL(uri, options);
}

export function recipientAddressNamespaces(chainId: number, addressFamily: AddressFamily = "evm") {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Choose a valid network.");
  const namespace = walletNamespaceForFamily(addressFamily);
  const networkId = networkIdForFamily(chainId, addressFamily);
  return {
    [namespace]: {
      chains: [networkId],
      methods: [],
      events: []
    }
  };
}

function getAccountFromSession(session: RecipientImportSession, namespace: WalletNamespace, networkId: string): string {
  const accounts = session?.namespaces?.[namespace]?.accounts;
  if (!Array.isArray(accounts)) return "";

  return (
    accounts.find((account: unknown) => typeof account === "string" && account.startsWith(`${networkId}:`)) ??
    accounts.find((account: unknown) => typeof account === "string") ??
    ""
  );
}

function walletNamespaceForFamily(addressFamily: AddressFamily): WalletNamespace {
  if (addressFamily === "bitcoin") return "bip122";
  if (addressFamily === "solana") return "solana";
  return "eip155";
}

function networkIdForFamily(chainId: number, addressFamily: AddressFamily): string {
  if (addressFamily === "bitcoin") return NATIVE_BITCOIN_NETWORK_ID;
  if (addressFamily === "solana") return SOLANA_NETWORK_ID;
  return `eip155:${chainId}`;
}

function isAddressForFamily(address: string, addressFamily: AddressFamily): boolean {
  if (addressFamily === "bitcoin") return isBitcoinMainnetAddress(address);
  if (addressFamily === "solana") return isSolanaAddress(address);
  return isAddress(address);
}

function getWalletNameFromSession(session: RecipientImportSession): string | undefined {
  const name = session?.peer?.metadata?.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}
