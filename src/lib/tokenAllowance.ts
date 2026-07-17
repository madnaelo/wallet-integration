import { ERC20_ABI } from "@/lib/erc20";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";

export type TokenApprovalPhase = "reset" | "approve";

type EnsureTokenAllowanceParams = {
  provider: Eip1193Provider;
  ownerAddress: string;
  tokenAddress: string;
  spenderAddress: string;
  expectedChainId: number;
  requiredAmount: bigint;
  onWalletRequest?: (phase: TokenApprovalPhase) => void;
  onTransactionSubmitted?: (phase: TokenApprovalPhase, transactionHash: string) => void;
};

export function buildExactApprovalPlan(currentAllowance: bigint, requiredAmount: bigint): readonly bigint[] {
  if (currentAllowance < 0n || requiredAmount <= 0n) {
    throw new Error("Token approval amounts must be positive.");
  }
  if (currentAllowance >= requiredAmount) return [];
  return currentAllowance === 0n ? [requiredAmount] : [0n, requiredAmount];
}

export async function ensureExactTokenAllowance(params: EnsureTokenAllowanceParams): Promise<boolean> {
  if (!isAddress(params.ownerAddress) || !isAddress(params.tokenAddress) || !isAddress(params.spenderAddress)) {
    throw new Error("Token approval could not be prepared safely.");
  }
  if (params.requiredAmount <= 0n) throw new Error("Token approval amount must be greater than zero.");

  const { BrowserProvider, Contract } = await import("ethers");
  const browserProvider = new BrowserProvider(params.provider);
  const network = await browserProvider.getNetwork();
  if (!Number.isSafeInteger(params.expectedChainId) || params.expectedChainId <= 0 || network.chainId !== BigInt(params.expectedChainId)) {
    throw new Error("Your wallet is on a different network. Switch networks and review the request again.");
  }
  const signer = await browserProvider.getSigner();
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== params.ownerAddress.toLowerCase()) {
    throw new Error("The wallet account changed. Reconnect it and review the order again.");
  }

  const token = new Contract(params.tokenAddress, ERC20_ABI, signer);
  const currentAllowance = BigInt(await token.allowance(params.ownerAddress, params.spenderAddress));
  const approvalPlan = buildExactApprovalPlan(currentAllowance, params.requiredAmount);

  for (const amount of approvalPlan) {
    const phase: TokenApprovalPhase = amount === 0n ? "reset" : "approve";
    params.onWalletRequest?.(phase);
    const transaction = await token.approve(params.spenderAddress, amount);
    if (!transaction?.hash || typeof transaction.wait !== "function") {
      throw new Error("Your wallet returned an invalid token approval.");
    }
    params.onTransactionSubmitted?.(phase, transaction.hash);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Token approval was not confirmed by the network.");
  }

  if (approvalPlan.length > 0) {
    const confirmedAllowance = BigInt(await token.allowance(params.ownerAddress, params.spenderAddress));
    if (confirmedAllowance < params.requiredAmount) {
      throw new Error("The token did not confirm enough approval. Review the wallet activity and try again.");
    }
  }
  return approvalPlan.length > 0;
}
