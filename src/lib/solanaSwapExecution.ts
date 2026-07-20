import type { Connection, Provider } from "@reown/appkit-adapter-solana/react";
import { PublicKey, Transaction, VersionedTransaction, type TransactionSignature } from "@solana/web3.js";
import type { QuoteResponse } from "@/lib/types";
import { SOLANA_CHAIN_ID } from "@/lib/ecosystems";
import { isSolanaAddress } from "@/lib/validation";

const MAX_SOLANA_TRANSACTION_BYTES = 393_216;

export async function executeSolanaQuote(params: {
  quote: QuoteResponse;
  provider: Provider;
  connection: Connection;
  sourceAddress: string;
}): Promise<TransactionSignature> {
  const { quote, provider, connection, sourceAddress } = params;
  if (quote.providerId !== "lifi" || quote.fromChainId !== SOLANA_CHAIN_ID) {
    throw new Error("This Solana quote cannot be executed safely.");
  }
  if (!isSolanaAddress(sourceAddress)) throw new Error("Reconnect your Solana wallet and refresh the quote.");

  const bytes = decodeBase64Transaction(quote.data);
  const transaction = deserializeTransaction(bytes);
  const signerAddress = getFeePayer(transaction)?.toBase58();
  if (!signerAddress || signerAddress !== sourceAddress) {
    throw new Error("The quote does not match the connected Solana wallet.");
  }

  const signature = await provider.sendTransaction(transaction, connection, {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    maxRetries: 3
  });
  if (!isSolanaSignature(signature)) throw new Error("The Solana wallet did not return a transaction signature.");
  return signature;
}

function decodeBase64Transaction(value: string): Uint8Array {
  const normalized = value.trim();
  if (
    normalized.length < 16 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new Error("The quote contains invalid Solana transaction data.");
  }
  const binary = atob(normalized);
  if (!binary.length || binary.length > MAX_SOLANA_TRANSACTION_BYTES) {
    throw new Error("The Solana transaction is outside the safe size limit.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function deserializeTransaction(bytes: Uint8Array): Transaction | VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    try {
      return Transaction.from(bytes);
    } catch {
      throw new Error("The quote contains an unreadable Solana transaction.");
    }
  }
}

function getFeePayer(transaction: Transaction | VersionedTransaction): PublicKey | undefined {
  if (transaction instanceof VersionedTransaction) return transaction.message.staticAccountKeys[0];
  return transaction.feePayer ?? transaction.signatures[0]?.publicKey ?? undefined;
}

function isSolanaSignature(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value);
}
