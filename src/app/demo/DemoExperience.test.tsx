import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DemoExperience from "./DemoExperience";

describe("demo branding", () => {
  it.each(["Swap Assistant", "River Wallet - Fictional Demo"])("renders the server-supplied brand %s", brandName => {
    const html = renderToStaticMarkup(<DemoExperience brandName={brandName} />);
    expect(html).toContain(`<h1>${brandName}</h1>`);
    expect(html).toContain("Sample prices and wallet only. No real transactions, orders or fees.");
    expect(html).toContain("disabled=\"\"");
  });

  it("escapes display text instead of interpreting markup", () => {
    const html = renderToStaticMarkup(<DemoExperience brandName="<script>unsafe</script>" />);
    expect(html).not.toContain("<script>unsafe</script>");
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
  });

  it("passes the configured server brand through the page without a client config import", async () => {
    vi.resetModules();
    vi.doMock("@/lib/brand", () => ({ BRAND: { name: "River Wallet - Fictional Demo", icon: "/icon-192.png" } }));
    try {
      const { default: DemoPage } = await import("./page");
      const html = renderToStaticMarkup(await DemoPage({ searchParams: Promise.resolve({}) }));
      expect(html).toContain("<h1>River Wallet - Fictional Demo</h1>");
    } finally {
      vi.doUnmock("@/lib/brand");
      vi.resetModules();
    }
  });
});
