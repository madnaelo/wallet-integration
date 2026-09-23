import { describe, expect, it } from "vitest";
import { DEMO_POLICY, demoQuotes } from "./demo";
import { commercialEnquiry } from "./commercial";

describe("isolated commercial demo", () => {
  it("exposes no execution, credentials or treasury", () => {
    expect(Object.values(DEMO_POLICY).every(value => value === false || value === null)).toBe(true);
    const quote = demoQuotes("demo:eth", "demo:usdc", "1", 50)[0];
    expect(Object.keys(quote).sort()).toEqual(["fee", "minimum", "output", "route"]);
    expect(quote).toEqual({ route: "Sample route A", output: "2495000000", minimum: "2482525000", fee: "5000000" });
  });
  it("scales different decimals and deducts sample fees exactly once", () => {
    expect(demoQuotes("demo:btc", "demo:eth", "1", 10)[0].output).toBe("29940000000000000000");
    expect(demoQuotes("demo:usdc", "demo:arb-usdc", "1", 100)[0].minimum).toBe("988020");
  });
  it.each(["0", "-1", "1e8", "1000001", "x", "9".repeat(500)])("rejects invalid amount %s", amount => {
    expect(demoQuotes("demo:eth", "demo:usdc", amount, 50)).toEqual([]);
  });
  it("rejects real addresses, identical tokens and invalid slippage", () => {
    expect(demoQuotes("0x0000000000000000000000000000000000000001", "demo:usdc", "1", 50)).toEqual([]);
    expect(demoQuotes("demo:eth", "demo:eth", "1", 50)).toEqual([]);
    expect(demoQuotes("demo:eth", "demo:usdc", "1", 9999)).toEqual([]);
  });
  it("preselects commercial contact without reflecting arbitrary query text", () => {
    expect(commercialEnquiry("branded-demo").topic).toBe("partnership");
    expect(commercialEnquiry("paid-pilot").message).toContain("pilot");
    expect(commercialEnquiry("<script>unsafe</script>")).toEqual({ topic: "general", message: "" });
    expect(commercialEnquiry(["branded-demo"])).toEqual({ topic: "general", message: "" });
  });
});
