import { describe,expect,it } from "vitest";
import { createBrand } from "./brand";

describe("deployment branding", () => {
  it("keeps the existing default and supports an isolated fictional brand", () => {
    expect(createBrand().name).toBe("Swap Assistant");
    expect(createBrand({name:"River Swap",shortName:"River",assetsBase:"/brands/river",supportPath:"/support"}))
      .toMatchObject({name:"River Swap",icon:"/brands/river/icon-192.png",socialImage:"/brands/river/og-image.png",supportPath:"/support"});
  });
  it.each([{name:"<script>alert(1)</script>"},{name:"Name\nHeader"},{assetsBase:"https://other.example"},
    {assetsBase:"/../secret"},{supportPath:"//evil.example"},{supportPath:"javascript:alert(1)"}])("rejects unsafe branding %#",(config) => {
      expect(() => createBrand(config)).toThrow();
  });
});
