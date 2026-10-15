import { describe, expect, it } from "vitest";
import { commercialEnquiry, COMMERCIAL } from "./commercial";

describe("contextual contact copy", () => {
  it.each([
    [COMMERCIAL.demoRequest, "Request a branded demo", "branded demo"],
    [COMMERCIAL.pilotRequest, "Discuss a paid pilot", "paid pilot"]
  ])("matches the existing CTA %s without new qualification fields", (href, heading, message) => {
    const enquiry = commercialEnquiry(new URL(href, "https://site.test").searchParams.get("enquiry"));
    expect(enquiry.heading).toBe(heading);
    expect(enquiry.topic).toBe("partnership");
    expect(enquiry.message).toContain(message);
    expect(enquiry.introduction).toContain("fit and scope by email");
    expect(enquiry.introduction).toContain("a call is optional");
  });

  it.each([undefined, null, "", "legal", "<script>unsafe</script>", ["branded-demo", "paid-pilot"]])(
    "preserves general contact for unsupported input %j", value => {
      const enquiry = commercialEnquiry(value);
      expect(enquiry.topic).toBe("general");
      expect(enquiry.message).toBe("");
      expect(enquiry.heading).toBe("How can we help?");
      expect(enquiry.introduction).toContain("support, privacy, partnership, or legal");
    }
  );
});
