import { createHash, randomBytes } from "node:crypto";

import { encodeBase62 } from "./base62";
import { crc32 } from "./crc32";
import type { GenerateKey, HashKey, ValidateKeyFormat } from "./types";

const PREFIX = "wtf_";
const RANDOM_LENGTH = 43;
const CHECKSUM_LENGTH = 6;
const KEY_LENGTH = PREFIX.length + RANDOM_LENGTH + CHECKSUM_LENGTH;
const KEY_PATTERN = /^wtf_[0-9A-Za-z]{49}$/;

function checksum(randomPart: string): string {
  // Los docs no fijan los bytes: usamos el ASCII de los 43 caracteres, sin prefijo.
  return encodeBase62(BigInt(crc32(Buffer.from(randomPart, "ascii"))), CHECKSUM_LENGTH);
}

export const hashKey: HashKey = (key) => createHash("sha256").update(key, "utf8").digest("hex");

export function keyHint(key: string): string {
  return `${PREFIX}${key.slice(PREFIX.length, PREFIX.length + 4)}…${key.slice(-4)}`;
}

export const generateKey: GenerateKey = () => {
  // Interpretar los 32 bytes en big-endian conserva los 256 bits, incluidos los ceros iniciales.
  const randomPart = encodeBase62(BigInt(`0x${randomBytes(32).toString("hex")}`), RANDOM_LENGTH);
  const key = `${PREFIX}${randomPart}${checksum(randomPart)}`;
  return { key, hash: hashKey(key), hint: keyHint(key) };
};

export const validateKeyFormat: ValidateKeyFormat = (candidate) => {
  if (typeof candidate !== "string" || candidate.length !== KEY_LENGTH || !KEY_PATTERN.test(candidate)) {
    return false;
  }

  const randomPart = candidate.slice(PREFIX.length, PREFIX.length + RANDOM_LENGTH);
  return candidate.slice(-CHECKSUM_LENGTH) === checksum(randomPart);
};
