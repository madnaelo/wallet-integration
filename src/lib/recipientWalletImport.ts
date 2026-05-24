import SignClient from "@walletconnect/sign-client";
import QRCode from "qrcode";
import { isAddress } from "@/lib/validation";

type RecipientImportClient = Awaited<ReturnType<typeof SignClient.init>>;

type RecipientWalletImportParams = {
  projectId: string;
  chainId: number;
  origin: string;
};

type ImportedRecipientAddress = {
  address: string;
  topic: string;
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
  origin
}: RecipientWalletImportParams): Promise<RecipientWalletImport> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) throw new Error("Wallet import is unavailable right now.");

  const client = await getRecipientImportClient(normalizedProjectId, origin);
  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        chains: [`eip155:${chainId}`],
        methods: ["eth_sendTransaction", "personal_sign"],
        events: ["accountsChanged", "chainChanged"]
      }
    }
  });

  if (!uri) throw new Error("Could not start wallet import.");

  const qrDataUrl = await QRCode.toDataURL(uri, {
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
      const account = getEvmAccountFromSession(session, chainId);
      const address = account?.split(":").pop() ?? "";
      if (!isAddress(address)) throw new Error("Wallet did not return a valid address.");

      return {
        address,
        topic: session.topic
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
    clientPromise = SignClient.init({
      projectId,
      metadata: {
        name: "The Wallet",
        description: "Your Personal Swap Aggregator",
        url: origin,
        icons: []
      }
    });
  }

  return clientPromise;
}

function getEvmAccountFromSession(session: any, chainId: number): string {
  const accounts = session?.namespaces?.eip155?.accounts;
  if (!Array.isArray(accounts)) return "";

  return (
    accounts.find((account: unknown) => typeof account === "string" && account.startsWith(`eip155:${chainId}:`)) ??
    accounts.find((account: unknown) => typeof account === "string") ??
    ""
  );
}
