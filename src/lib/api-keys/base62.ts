const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = BigInt(ALPHABET.length);

export function encodeBase62(value: bigint, length: number): string {
  if (value < BigInt(0) || !Number.isSafeInteger(length) || length < 1) {
    throw new RangeError("Expected a non-negative value and a positive integer length");
  }

  let encoded = "";
  do {
    encoded = ALPHABET[Number(value % BASE)] + encoded;
    value /= BASE;
  } while (value > BigInt(0));

  if (encoded.length > length) throw new RangeError("Value exceeds the base62 length");
  return encoded.padStart(length, "0");
}
