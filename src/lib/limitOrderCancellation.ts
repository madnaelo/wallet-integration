import { ONEINCH_ORDERBOOK_PROVIDER, resolveTrustedLimitOrderSpender } from "@/lib/limitOrderSpender";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";

const ONEINCH_CANCEL_ABI = [
  "function cancelOrder(uint256 makerTraits, bytes32 orderHash)"
] as const;
const UINT_256_MAX = (1n << 256n) - 1n;

type OneInchCancellationParams = {
  provider: Eip1193Provider;
  ownerAddress: string;
  expectedChainId: number;
  contractAddress: string;
  makerTraits: string;
  orderHash: string;
  onWalletRequest?: () => void;
  onTransactionSubmitted?: (transactionHash: string) => void;
};

export function validateOneInchCancellationTerms(
  contractAddress: string,
  trustedContractAddress: string,
  makerTraits: string,
  orderHash: string
): bigint {
  if (!isAddress(contractAddress)
      || !isAddress(trustedContractAddress)
      || contractAddress.toLowerCase() !== trustedContractAddress.toLowerCase()) {
    throw new Error("The limit order cancellation contract could not be verified.");
  }
  if (!/^0x[0-9a-f]{64}$/i.test(orderHash)) {
    throw new Error("The saved limit order hash is invalid.");
  }
  if (!/^\d+$/.test(makerTraits)) {
    throw new Error("The saved limit order settings are invalid.");
  }
  const traits = BigInt(makerTraits);
  if (traits < 0n || traits > UINT_256_MAX) {
    throw new Error("The saved limit order settings are invalid.");
  }
  return traits;
}

export async function submitOneInchLimitOrderCancellation(
  params: OneInchCancellationParams
): Promise<string> {
  if (!isAddress(params.ownerAddress)
      || !Number.isSafeInteger(params.expectedChainId)
      || params.expectedChainId <= 0) {
    throw new Error("The limit order cancellation could not be prepared safely.");
  }

  const trustedContract = await resolveTrustedLimitOrderSpender(
    ONEINCH_ORDERBOOK_PROVIDER,
    params.expectedChainId
  );
  const makerTraits = validateOneInchCancellationTerms(
    params.contractAddress,
    trustedContract,
    params.makerTraits,
    params.orderHash
  );

  const { BrowserProvider, Contract } = await import("ethers");
  const browserProvider = new BrowserProvider(params.provider);
  const network = await browserProvider.getNetwork();
  if (network.chainId !== BigInt(params.expectedChainId)) {
    throw new Error("Your wallet is on a different network. Switch networks and review the cancellation again.");
  }
  const signer = await browserProvider.getSigner();
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== params.ownerAddress.toLowerCase()) {
    throw new Error("The wallet account changed. Reconnect it and review the cancellation again.");
  }

  params.onWalletRequest?.();
  const contract = new Contract(params.contractAddress, ONEINCH_CANCEL_ABI, signer);
  const transaction = await contract.cancelOrder(makerTraits, params.orderHash);
  if (!transaction?.hash
      || !/^0x[0-9a-f]{64}$/i.test(transaction.hash)
      || typeof transaction.wait !== "function") {
    throw new Error("Your wallet returned an invalid cancellation transaction.");
  }
  params.onTransactionSubmitted?.(transaction.hash);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("The cancellation transaction was not confirmed by the network.");
  }
  return transaction.hash.toLowerCase();
}
