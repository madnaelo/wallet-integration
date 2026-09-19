import { BRAND } from "@/lib/brand";
import Link from "next/link";

export function LegalOperatorDisclosure() {
  const operator = process.env.NEXT_PUBLIC_OPERATOR_DISCLOSURE?.trim();
  if (BRAND.name !== "Swap Assistant" && !operator) {
    throw new Error("A branded deployment requires its own operator disclosure.");
  }
  if (operator && (operator.length > 600 || /[\u0000-\u001f\u007f]/.test(operator))) {
    throw new Error("Operator disclosure must be bounded plain text.");
  }
  return (
    <footer
      className="legalFinePrint"
      aria-label="Legal operator and contact"
      data-nosnippet
    >
      <p>
        <small>
          <strong>Legal operator and contact.</strong> {operator || <>{BRAND.name} is
          operated from Pakistan by Syed Aqeel Ashiq as an individual.
          {BRAND.name} is a service name, not a separately
          incorporated company.</>} Legal, privacy, and support questions can be
          sent through the <Link href={BRAND.supportPath}>contact form</Link>.
          Nothing in this disclosure represents that the service or operator
          is licensed, endorsed, or approved by a financial or virtual-asset
          regulator.
        </small>
      </p>
    </footer>
  );
}
