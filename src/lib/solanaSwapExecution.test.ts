import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import type { Connection, Provider } from "@reown/appkit-adapter-solana/react";
import { executeSolanaQuote, waitForSolanaConfirmation } from "@/lib/solanaSwapExecution";
import { SOLANA_CHAIN_ID } from "@/lib/ecosystems";
import type { QuoteResponse } from "@/lib/types";

describe("Solana swap execution", () => {
  it("submits a serialized transaction only through its matching fee payer", async () => {
    const source = Keypair.generate().publicKey;
    const transaction = new Transaction({ feePayer: source, recentBlockhash: Keypair.generate().publicKey.toBase58() })
      .add(SystemProgram.transfer({ fromPubkey: source, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
    const sendTransaction = vi.fn().mockResolvedValue("2".repeat(88));

    const signature = await executeSolanaQuote({
      quote: solanaQuote(transaction),
      provider: { sendTransaction } as unknown as Provider,
      connection: {} as Connection,
      sourceAddress: source.toBase58()
    });

    expect(signature).toBe("2".repeat(88));
    expect(sendTransaction).toHaveBeenCalledOnce();
  });

  it("rejects a transaction prepared for a different wallet", async () => {
    const source = Keypair.generate().publicKey;
    const transaction = new Transaction({ feePayer: source, recentBlockhash: Keypair.generate().publicKey.toBase58() });

    await expect(executeSolanaQuote({
      quote: solanaQuote(transaction),
      provider: { sendTransaction: vi.fn() } as unknown as Provider,
      connection: {} as Connection,
      sourceAddress: Keypair.generate().publicKey.toBase58()
    })).rejects.toThrow(/does not match/i);
  });

  it("recognizes a confirmed Solana transaction", async () => {
    const getSignatureStatus = vi.fn().mockResolvedValue({
      value: { confirmationStatus: "confirmed", err: null }
    });

    await expect(waitForSolanaConfirmation(
      { getSignatureStatus } as unknown as Connection,
      "2".repeat(88)
    )).resolves.toBe(true);
    expect(getSignatureStatus).toHaveBeenCalledWith("2".repeat(88), {
      searchTransactionHistory: true
    });
  });

  it("surfaces an explicit Solana transaction failure", async () => {
    const getSignatureStatus = vi.fn().mockResolvedValue({
      value: { confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } }
    });

    await expect(waitForSolanaConfirmation(
      { getSignatureStatus } as unknown as Connection,
      "2".repeat(88)
    )).rejects.toThrow(/rejected/i);
  });
});

function solanaQuote(transaction: Transaction): QuoteResponse {
  return {
    providerId: "lifi",
    providerName: "LI.FI",
    executionKind: "solana-source",
    fromChainId: SOLANA_CHAIN_ID,
    toChainId: 1,
    sellAmount: "1",
    buyAmount: "1",
    to: "",
    data: Buffer.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    value: "0"
  };
}
