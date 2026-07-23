"use strict";

const { Buffer } = require("buffer");

const MAX_BYTE_LENGTH = 4096;

function boundedBuffer(value) {
  const buffer = Buffer.from(value);
  if (buffer.length > MAX_BYTE_LENGTH) {
    throw new RangeError(`Buffer length must not exceed ${MAX_BYTE_LENGTH} bytes.`);
  }
  return buffer;
}

function boundedWidth(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BYTE_LENGTH) {
    throw new RangeError(`Buffer width must be an integer between 0 and ${MAX_BYTE_LENGTH}.`);
  }
  return value;
}

function unsignedHex(value) {
  if (typeof value !== "bigint" || value < 0n) {
    throw new TypeError("Value must be a non-negative bigint.");
  }
  return value.toString(16);
}

function toBigIntLE(value) {
  const buffer = boundedBuffer(value);
  if (buffer.length === 0) return 0n;
  return BigInt(`0x${Buffer.from(buffer).reverse().toString("hex")}`);
}

function toBigIntBE(value) {
  const buffer = boundedBuffer(value);
  if (buffer.length === 0) return 0n;
  return BigInt(`0x${buffer.toString("hex")}`);
}

function toBufferLE(value, requestedWidth) {
  const width = boundedWidth(requestedWidth);
  const hex = unsignedHex(value).padStart(width * 2, "0").slice(0, width * 2);
  return Buffer.from(hex, "hex").reverse();
}

function toBufferBE(value, requestedWidth) {
  const width = boundedWidth(requestedWidth);
  const hex = unsignedHex(value).padStart(width * 2, "0").slice(0, width * 2);
  return Buffer.from(hex, "hex");
}

module.exports = {
  toBigIntLE,
  toBigIntBE,
  toBufferLE,
  toBufferBE
};
