// Specification examples only. This is not a product calculator or input validator.
import assert from "node:assert/strict";
import { test } from "node:test";

test("USD 300, 20 BPS and USD 6 gas costs USD 6.60 / 2.2%", () => {
  const sourceCents = 30_000n;
  const feeCents = sourceCents * 20n / 10_000n;
  const totalCents = feeCents + 600n;
  assert.equal(totalCents, 660n);
  assert.equal(totalCents * 10_000n / sourceCents, 220n);
});

test("zero fees and gas-dominated amounts retain the correct denominator", () => {
  assert.equal(0n * 10_000n / 30_000n, 0n);
  assert.equal((1_000n * 20n / 10_000n + 600n) * 10_000n / 1_000n, 6020n);
  assert.equal(600n * 10_000n / 200n, 30000n);
});

test("two percentage fees and fixed costs are counted once", () => {
  const deductedCents = 100_000n * (20n + 30n) / 10_000n + 100n;
  const externalCents = 400n + 200n;
  assert.equal(deductedCents, 600n);
  assert.equal(deductedCents + externalCents, 1200n);
  assert.equal(100_000n + externalCents, 100_600n);
});

test("forward and reverse cost break-even is an exact rational identity", () => {
  // Q=2994/1000, r=2/1000; x=(306+6)/(Q*(1-r)).
  const xNumerator = 312n * 1_000_000n;
  const xDenominator = 2994n * 998n;
  assert.equal(xNumerator * 1_000_000_000n / xDenominator, 104417251336n);
  assert.equal(xNumerator * 2994n * 998n, 312n * xDenominator * 1_000_000n);
  assert.equal(2994n * 100n * 998n - 6n * 1_000_000n, 292801200n);
});

test("already-net quantity is the same input, not another fee deduction", () => {
  const derivedQuantityThousandths = (30_000n - 60n) * 1000n / 10_000n;
  const enteredNetQuantityThousandths = 2994n;
  assert.equal(derivedQuantityThousandths, enteredNetQuantityThousandths);
  assert.equal(30_000n + 600n, 30600n);
});

test("external fee placement changes the cost basis, not the quantity", () => {
  const xNumerator = 31260n * 1000n;
  const xDenominator = 100n * 3n * 998n;
  assert.equal(xNumerator * 1_000_000_000n / xDenominator, 104408817635n);
});

test("optional pilot credit and fee scenarios reconcile", () => {
  assert.equal(1000 + 1500 + 2500, 5000);
  assert.equal(27500n * 85n / 100n, 23375n);
  assert.equal(23375n * 36725n / 10000n, 85844n); // Cents truncated, displayed rounded: AED 858.45.
});
