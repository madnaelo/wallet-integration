import type { BitcoinConnector } from "@reown/appkit-adapter-bitcoin";
import * as ecc from "@bitcoinerlab/secp256k1";
import { address, initEccLib, networks, payments, Psbt, Transaction } from "bitcoinjs-lib";
import type { QuoteResponse } from "@/lib/types";
import { NATIVE_BITCOIN_CHAIN_ID } from "@/lib/ecosystems";
import { isBitcoinMainnetAddress } from "@/lib/validation";

const MAX_PSBT_HEX_LENGTH = 1_048_576;
let eccInitialized = false;

export async function signBitcoinQuote(params: {
  quote: QuoteResponse;
  provider: BitcoinConnector;
  sourceAddress: string;
}): Promise<{ rawTransaction: string; transactionId: string }> {
  const { quote, provider, sourceAddress } = params;
  if (quote.providerId !== "lifi" || quote.fromChainId !== NATIVE_BITCOIN_CHAIN_ID) {
    throw new Error("This Bitcoin quote cannot be executed safely.");
  }
  if (!isBitcoinMainnetAddress(sourceAddress)) {
    throw new Error("Reconnect your Bitcoin wallet and refresh the quote.");
  }
  if (!/^70736274ff[0-9a-fA-F]*$/.test(quote.data) || quote.data.length > MAX_PSBT_HEX_LENGTH) {
    throw new Error("The quote contains invalid Bitcoin transaction data.");
  }

  initializeEcc();
  const psbt = Psbt.fromHex(quote.data, { network: networks.bitcoin });
  assertExpectedOutputs(psbt, quote.value);
  const unsignedTransaction = toHex(psbt.data.globalMap.unsignedTx.toBuffer());
  const accounts = await provider.getAccountAddresses();
  const accountByAddress = new Map(
    accounts
      .filter((account) => isBitcoinMainnetAddress(account.address))
      .map((account) => [account.address, account] as const)
  );
  if (!accountByAddress.has(sourceAddress)) {
    throw new Error("The connected Bitcoin wallet no longer matches this quote.");
  }

  const signInputs = psbt.data.inputs.map((input, index) => {
    const inputAddress = getInputAddress(psbt, index) ?? sourceAddress;
    const account = accountByAddress.get(inputAddress);
    if (!account) throw new Error("This Bitcoin transaction needs an address that is not connected.");

    enrichSigningMetadata(psbt, index, inputAddress, account.publicKey);
    return {
      address: inputAddress,
      index,
      sighashTypes: [psbt.data.inputs[index]?.sighashType || Transaction.SIGHASH_ALL],
      ...(account.publicKey ? { publicKey: account.publicKey } : {})
    };
  });
  if (!signInputs.length) throw new Error("The Bitcoin transaction has no inputs to sign.");

  const signed = await provider.signPSBT({
    psbt: psbt.toBase64(),
    signInputs,
    broadcast: false
  });
  const signedPsbt = Psbt.fromBase64(signed.psbt, { network: networks.bitcoin });
  const signedUnsignedTransaction = toHex(signedPsbt.data.globalMap.unsignedTx.toBuffer());
  if (signedUnsignedTransaction !== unsignedTransaction) {
    throw new Error("The wallet changed the Bitcoin transaction. Nothing was broadcast.");
  }
  if (!signedPsbt.validateSignaturesOfAllInputs(validateBitcoinSignature)) {
    throw new Error("The Bitcoin wallet returned an invalid transaction signature.");
  }

  signedPsbt.finalizeAllInputs();
  const transaction = signedPsbt.extractTransaction();
  return { rawTransaction: transaction.toHex(), transactionId: transaction.getId() };
}

export async function broadcastBitcoinTransaction(params: {
  rawTransaction: string;
  transactionId: string;
}): Promise<string> {
  const response = await fetch("/api/bitcoin/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  const body = await response.json().catch(() => ({})) as { transactionId?: string; error?: string };
  if (!response.ok) throw new Error(body.error || "The signed Bitcoin transaction could not be broadcast.");
  if (body.transactionId !== params.transactionId) {
    throw new Error("The Bitcoin network returned an unexpected transaction ID.");
  }
  return body.transactionId;
}

function initializeEcc() {
  if (eccInitialized) return;
  initEccLib(ecc);
  eccInitialized = true;
}

function assertExpectedOutputs(psbt: Psbt, quotedValue: string | undefined) {
  if (psbt.inputCount < 1 || psbt.txOutputs.length < 2) {
    throw new Error("The Bitcoin transaction is incomplete.");
  }
  if (!quotedValue || !/^\d{1,16}$/.test(quotedValue)) {
    throw new Error("The Bitcoin quote amount is invalid.");
  }
  if (psbt.txOutputs[0]?.value !== BigInt(quotedValue)) {
    throw new Error("The Bitcoin deposit amount does not match the quote.");
  }
  if (psbt.txOutputs[1]?.script[0] !== 0x6a) {
    throw new Error("The Bitcoin route instructions are missing.");
  }
}

function getInputAddress(psbt: Psbt, index: number): string | undefined {
  const input = psbt.data.inputs[index];
  if (!input) return undefined;
  if (input.witnessUtxo) {
    return address.fromOutputScript(input.witnessUtxo.script, networks.bitcoin);
  }
  if (input.nonWitnessUtxo) {
    const previousTransaction = Transaction.fromBuffer(input.nonWitnessUtxo);
    const outputIndex = psbt.txInputs[index]?.index;
    const output = typeof outputIndex === "number" ? previousTransaction.outs[outputIndex] : undefined;
    if (output) return address.fromOutputScript(output.script, networks.bitcoin);
  }
  return undefined;
}

function enrichSigningMetadata(psbt: Psbt, index: number, inputAddress: string, publicKeyHex?: string) {
  const input = psbt.data.inputs[index];
  if (!input || !publicKeyHex || !/^(?:02|03)[0-9a-fA-F]{64}$/.test(publicKeyHex)) return;
  const publicKey = hexToBytes(publicKeyHex);

  if (inputAddress.startsWith("bc1p")) {
    psbt.updateInput(index, {
      ...(input.tapInternalKey ? {} : { tapInternalKey: publicKey.slice(1, 33) }),
      ...(input.sighashType ? {} : { sighashType: Transaction.SIGHASH_ALL })
    });
  } else if (inputAddress.startsWith("3") && !input.redeemScript) {
    const redeemScript = payments.p2wpkh({ pubkey: publicKey, network: networks.bitcoin }).output;
    if (redeemScript) psbt.updateInput(index, { redeemScript });
  }
}

function validateBitcoinSignature(publicKey: Uint8Array, hash: Uint8Array, signature: Uint8Array): boolean {
  return publicKey.length === 32
    ? ecc.verifySchnorr(hash, publicKey, signature)
    : ecc.verify(hash, publicKey, signature);
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}
