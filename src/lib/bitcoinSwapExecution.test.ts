import * as ecc from "@bitcoinerlab/secp256k1";
import { initEccLib, networks, payments, Psbt, script } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import type { BitcoinConnector } from "@reown/appkit-adapter-bitcoin";
import { signBitcoinQuote } from "@/lib/bitcoinSwapExecution";
import { NATIVE_BITCOIN_CHAIN_ID } from "@/lib/ecosystems";
import type { QuoteResponse } from "@/lib/types";

initEccLib(ecc);

describe("Bitcoin swap execution", () => {
  it("signs and finalizes the exact LI.FI PSBT", async () => {
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const publicKey = ecc.pointFromScalar(privateKey, true)!;
    const sourcePayment = payments.p2wpkh({ pubkey: publicKey, network: networks.bitcoin });
    const depositPayment = payments.p2wpkh({
      pubkey: ecc.pointFromScalar(Uint8Array.from({ length: 32 }, (_, index) => 32 - index), true)!,
      network: networks.bitcoin
    });
    const sourceAddress = sourcePayment.address!;
    const psbt = new Psbt({ network: networks.bitcoin });
    psbt.addInput({
      hash: "11".repeat(32),
      index: 0,
      witnessUtxo: { script: sourcePayment.output!, value: 120_000n }
    });
    psbt.addOutput({ address: depositPayment.address!, value: 100_000n });
    psbt.addOutput({ script: script.compile([script.OPS.OP_RETURN, Uint8Array.from([1, 2, 3])]), value: 0n });
    psbt.addOutput({ address: sourceAddress, value: 19_000n });

    const provider = {
      getAccountAddresses: async () => [{
        address: sourceAddress,
        publicKey: toHex(publicKey),
        purpose: "payment"
      }],
      signPSBT: async ({ psbt: encoded }: { psbt: string }) => {
        const value = Psbt.fromBase64(encoded, { network: networks.bitcoin });
        value.signAllInputs({ publicKey, sign: (hash) => ecc.sign(hash, privateKey) });
        return { psbt: value.toBase64() };
      }
    } as unknown as BitcoinConnector;

    const result = await signBitcoinQuote({ quote: bitcoinQuote(psbt), provider, sourceAddress });

    expect(result.transactionId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.rawTransaction).toMatch(/^[0-9a-f]+$/);
  });

  it("rejects a wallet that does not own every quoted input", async () => {
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const publicKey = ecc.pointFromScalar(privateKey, true)!;
    const payment = payments.p2wpkh({ pubkey: publicKey, network: networks.bitcoin });
    const psbt = new Psbt({ network: networks.bitcoin });
    psbt.addInput({ hash: "22".repeat(32), index: 0, witnessUtxo: { script: payment.output!, value: 120_000n } });
    psbt.addOutput({ address: payment.address!, value: 100_000n });
    psbt.addOutput({ script: script.compile([script.OPS.OP_RETURN, Uint8Array.from([1])]), value: 0n });

    const provider = {
      getAccountAddresses: async () => []
    } as unknown as BitcoinConnector;

    await expect(signBitcoinQuote({ quote: bitcoinQuote(psbt), provider, sourceAddress: payment.address! }))
      .rejects.toThrow(/no longer matches/i);
  });
});

function bitcoinQuote(psbt: Psbt): QuoteResponse {
  return {
    providerId: "lifi",
    providerName: "LI.FI",
    executionKind: "bitcoin-to-evm",
    fromChainId: NATIVE_BITCOIN_CHAIN_ID,
    toChainId: 1,
    sellAmount: "100000",
    buyAmount: "1",
    to: "",
    data: psbt.toHex(),
    value: "100000"
  };
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
