import { randomBytes } from "node:crypto";

const maxTimestamp = 2 ** 48 - 1;
const randomMask = (BigInt(1) << BigInt(74)) - BigInt(1);
const randBMask = (BigInt(1) << BigInt(62)) - BigInt(1);
let lastTimestamp = -1;
let lastRandom = BigInt(0);

/** UUID v7 de RFC 9562; el contador conserva el orden aun si el reloj retrocede. */
export function uuidv7(nowMs: number = Date.now()): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > maxTimestamp) {
    throw new RangeError("UUID v7 timestamp must be an integer between 0 and 2^48 - 1");
  }

  let timestamp = Math.max(nowMs, lastTimestamp);
  let random = timestamp === lastTimestamp
    ? lastRandom + BigInt(1)
    : BigInt(`0x${randomBytes(10).toString("hex")}`) & randomMask;

  if (random > randomMask) {
    timestamp += 1;
    random = BigInt(0);
  }
  if (timestamp > maxTimestamp) throw new RangeError("UUID v7 timestamp overflow");

  lastTimestamp = timestamp;
  lastRandom = random;
  const value = (BigInt(timestamp) << BigInt(80))
    | (BigInt(7) << BigInt(76))
    | ((random >> BigInt(62)) << BigInt(64))
    | (BigInt(2) << BigInt(62))
    | (random & randBMask);
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
