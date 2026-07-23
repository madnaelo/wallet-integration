import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE
} from "bigint-buffer";

describe("safe bigint-buffer compatibility module", () => {
  it("converts fixed-width values in both byte orders", () => {
    const value = 0x1234567890abcdefn;

    expect(toBufferBE(value, 8)).toEqual(Buffer.from("1234567890abcdef", "hex"));
    expect(toBufferLE(value, 8)).toEqual(Buffer.from("efcdab9078563412", "hex"));
    expect(toBigIntBE(Buffer.from("1234567890abcdef", "hex"))).toBe(value);
    expect(toBigIntLE(Buffer.from("efcdab9078563412", "hex"))).toBe(value);
  });

  it("supports empty buffers and zero-width output", () => {
    expect(toBigIntBE(Buffer.alloc(0))).toBe(0n);
    expect(toBigIntLE(Buffer.alloc(0))).toBe(0n);
    expect(toBufferBE(0n, 0)).toEqual(Buffer.alloc(0));
    expect(toBufferLE(0n, 0)).toEqual(Buffer.alloc(0));
  });

  it("rejects values large enough to create an unsafe conversion", () => {
    expect(() => toBigIntLE(Buffer.alloc(4097))).toThrow(RangeError);
    expect(() => toBufferBE(1n, 4097)).toThrow(RangeError);
    expect(() => toBufferLE(-1n, 8)).toThrow(TypeError);
  });
});
