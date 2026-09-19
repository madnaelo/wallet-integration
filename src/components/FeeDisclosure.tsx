import type { ReactNode } from "react";

export function approximateFee(value: string, approximate: boolean): string {
  return `${approximate ? "Approx. " : ""}${value}`;
}

export function FeeEquivalent({ children }: { children: ReactNode }) {
  return <span className="feeEquivalent">Approx. {children}</span>;
}

export function DestinationFeeOutput({ amount, hasOtherTokenFees }: {
  amount: string;
  hasOtherTokenFees: boolean;
}) {
  // A source-token charge cannot reconstruct the destination output of a
  // different, hypothetical no-fee route.
  if (hasOtherTokenFees) return null;
  return <div className="kv">
    <div className="subtle">Before destination-token fees</div>
    <div className="mono">{amount}</div>
  </div>;
}
