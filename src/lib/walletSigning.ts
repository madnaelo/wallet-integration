import type { Eip1193Provider } from "@/lib/wallet";

const SIGNING_ATTEMPT_TIMEOUT_MS = 90_000;
const WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS = 300_000;
const SIGNING_ATTEMPT_EXPIRY_SECONDS = 300;
const ETHEREUM_SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

export type WalletProviderKind = "injected" | "walletconnect" | null;

type SignPersonalMessageOptions = {
  provider: Eip1193Provider;
  walletAddress: string;
  message: string;
  providerKind: WalletProviderKind;
  walletName?: string;
  setNotice?: (message: string) => void;
};

export async function signPersonalMessage(options: SignPersonalMessageOptions): Promise<string> {
  const {
    provider,
    walletAddress,
    message,
    providerKind,
    walletName = "your wallet",
    setNotice = () => undefined
  } = options;
  const supportsPersonalSign = walletSessionSupportsMethod(provider, "personal_sign");
  if (providerKind === "walletconnect" && supportsPersonalSign === false) {
    throw new Error(
      "The connected WalletConnect session did not approve personal_sign. Disconnect, reconnect, and approve message signing."
    );
  }

  const hexMessage = utf8ToHex(message);
  const attempts = providerKind === "walletconnect"
    ? [
        { label: "wallet text signature", params: [message, walletAddress] },
        { label: "wallet hex signature", params: [hexMessage, walletAddress] }
      ]
    : [
        { label: "wallet hex signature", params: [hexMessage, walletAddress] },
        { label: "wallet text signature", params: [message, walletAddress] }
      ];

  let lastError: unknown = null;
  for (const [index, attempt] of attempts.entries()) {
    try {
      setNotice("Open " + walletName + " and approve sign-in. This only proves the wallet is yours.");
      const signature = await requestWithTimeout(
        requestWalletSignature(provider, attempt.params, providerKind),
        providerKind === "walletconnect"
          ? WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS
          : SIGNING_ATTEMPT_TIMEOUT_MS,
        attempt.label + " did not return a signature."
      );
      if (typeof signature !== "string" || !ETHEREUM_SIGNATURE_PATTERN.test(signature)) {
        throw new Error("Wallet did not return a valid signature.");
      }
      return signature;
    } catch (error) {
      if (isUserRejectedWalletRequest(error)) throw error;
      if (isWalletRequestTimeout(error)) {
        throw new Error(
          "The connected wallet did not return a signature. Reopen the wallet request, or disconnect and reconnect the wallet."
        );
      }
      lastError = error;
      if (index === 0) {
        setNotice("The wallet did not accept the first signing format. Trying the alternate signing format...");
      }
    }
  }

  if (lastError instanceof Error && lastError.message) throw lastError;
  throw new Error("Wallet did not return a signature.");
}

export function isUserRejectedWalletRequest(error: unknown): boolean {
  const item = error as { code?: number; message?: string } | null;
  const message = String(item?.message ?? error ?? "");
  return item?.code === 4001 || /reject|denied|cancel/i.test(message);
}

function requestWalletSignature(
  provider: Eip1193Provider,
  params: string[],
  providerKind: WalletProviderKind
): Promise<unknown> {
  const args = { method: "personal_sign", params };
  return providerKind === "walletconnect"
    ? provider.request(args, undefined, SIGNING_ATTEMPT_EXPIRY_SECONDS)
    : provider.request(args);
}

function walletSessionSupportsMethod(provider: Eip1193Provider, method: string): boolean | null {
  const sessionProvider = provider as Eip1193Provider & {
    session?: { namespaces?: { eip155?: { methods?: unknown } } };
  };
  const methods = sessionProvider.session?.namespaces?.eip155?.methods;
  return Array.isArray(methods) ? methods.includes(method) : null;
}

function requestWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      const error = new Error(message);
      error.name = "WalletRequestTimeout";
      reject(error);
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => globalThis.clearTimeout(timeoutId));
  });
}

function isWalletRequestTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "WalletRequestTimeout";
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return "0x" + Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
