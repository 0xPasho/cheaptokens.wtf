// @vitest-environment node
import * as crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateKey, hashKey, keyHint, validateKeyFormat } from "@/lib/api-keys";
import { encodeBase62 } from "@/lib/api-keys/base62";
import { crc32 } from "@/lib/api-keys/crc32";

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return { ...original, randomBytes: vi.fn(original.randomBytes) };
});

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// Vectores calculados aparte con int.from_bytes, zlib.crc32 y hashlib.sha256 de Python.
const FIXTURES = [
  {
    bytes: Buffer.alloc(32),
    key: "wtf_00000000000000000000000000000000000000000002CZclj",
    hash: "5f400151481281fae8cbe8903af06e8a8adb23caea1befa99c07a914c537431d",
  },
  {
    bytes: Buffer.alloc(32, 255),
    key: "wtf_yhjskwdA6OZ1AL1YmHWZWm8LLG7HjnuCA2j5rOw8Xp13sRzl1",
    hash: "cdc45fbed25e1e275f41f60cecafa7242661ba23cf146033074e2a74b1e36820",
  },
  {
    bytes: Buffer.from(Array.from({ length: 32 }, (_, index) => index)),
    key: "wtf_003aUlTJC7tjlCTQj2uNU3MFagCXG9LRKRcwGkBIDlf1Yo7hP",
    hash: "cfd76f5e441ad796817a47ba6c138ff53cec4269e3a33a70069f22f79fc53105",
  },
];
const VALID_KEY = FIXTURES[2].key;

afterEach(() => vi.clearAllMocks());

describe("generateKey (ADR-0027)", () => {
  it("genera 1,000 keys válidas y distintas, con largo y alfabeto fijos", () => {
    const keys = new Set<string>();
    for (let index = 0; index < 1000; index++) {
      const generated = generateKey();
      expect(generated.key).toHaveLength(53);
      expect(generated.key).toMatch(/^wtf_[0-9A-Za-z]{43}[0-9A-Za-z]{6}$/);
      expect(validateKeyFormat(generated.key)).toBe(true);
      expect(generated.hash).toBe(hashKey(generated.key));
      expect(generated.hint).toBe(keyHint(generated.key));
      keys.add(generated.key);
    }
    expect(keys.size).toBe(1000);
  });

  it.each(FIXTURES)("conserva los 32 bytes y el relleno de ceros: $key", ({ bytes, key, hash }) => {
    const random = vi.mocked(crypto.randomBytes).mockImplementationOnce(() => bytes);
    expect(generateKey()).toEqual({ key, hash, hint: keyHint(key) });
    expect(random).toHaveBeenCalledExactlyOnceWith(32);
    expect(validateKeyFormat(key)).toBe(true);
  });
});

describe("validateKeyFormat", () => {
  it("rechaza toda sustitución de un carácter aleatorio o de checksum", () => {
    for (let index = 4; index < VALID_KEY.length; index++) {
      for (const replacement of ALPHABET) {
        if (replacement === VALID_KEY[index]) continue;
        const changed = VALID_KEY.slice(0, index) + replacement + VALID_KEY.slice(index + 1);
        expect(validateKeyFormat(changed), `position ${index}, replacement ${replacement}`).toBe(false);
      }
    }
  });

  it.each([
    "",
    "wtf_",
    VALID_KEY.slice(0, -1),
    VALID_KEY + "0",
    "WTF_" + VALID_KEY.slice(4),
    "sk__" + VALID_KEY.slice(4),
    " " + VALID_KEY,
    VALID_KEY + " ",
    VALID_KEY + "\n",
    VALID_KEY.slice(0, -1) + "\n",
    "wtf_ " + VALID_KEY.slice(5),
    "wtf_\t" + VALID_KEY.slice(5),
    "wtf_\n" + VALID_KEY.slice(5),
    "wtf_\0" + VALID_KEY.slice(5),
    "wtf_é" + VALID_KEY.slice(5),
    "wtf_Ａ" + VALID_KEY.slice(5),
    "wtf_😀" + VALID_KEY.slice(6),
    "wtf_-" + VALID_KEY.slice(5),
    "wtf__" + VALID_KEY.slice(5),
    VALID_KEY.slice(0, -6) + "zzzzzz",
  ])("rechaza una cadena mal formada sin lanzar: %j", (candidate) => {
    expect(validateKeyFormat(candidate)).toBe(false);
  });

  it.each([
    null,
    undefined,
    53,
    NaN,
    true,
    Symbol("key"),
    [],
    {},
    new String(VALID_KEY),
    { toString() { throw new Error("Must not coerce input"); } },
  ].map((candidate: unknown) => ({ candidate })))("rechaza entradas ajenas al contrato sin lanzar: %j", ({ candidate }) => {
    expect(validateKeyFormat(candidate as unknown as string)).toBe(false);
  });
});

describe("hashKey y keyHint", () => {
  it.each(FIXTURES)("calcula el SHA-256 completo y estable: $key", ({ key, hash }) => {
    expect(hashKey(key)).toBe(hash);
    expect(hashKey(key)).toBe(hashKey(key));
    expect(hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(key.slice(0, -1))).not.toBe(hash);
  });

  it("muestra los primeros cuatro caracteres aleatorios y los últimos cuatro de la key", () => {
    expect(keyHint(VALID_KEY)).toBe("wtf_003a…o7hP");
    expect(keyHint(VALID_KEY)).toMatch(/^wtf_[0-9A-Za-z]{4}…[0-9A-Za-z]{4}$/);
    expect(keyHint(VALID_KEY)).toHaveLength(13);
  });
});

describe("codificación base62 y CRC32", () => {
  it("usa el orden 0-9A-Za-z y rellena a la izquierda", () => {
    for (let index = 0; index < ALPHABET.length; index++) {
      expect(encodeBase62(BigInt(index), 1)).toBe(ALPHABET[index]);
    }
    expect(encodeBase62(BigInt(62), 6)).toBe("000010");
    expect(encodeBase62(BigInt(0), 6)).toBe("000000");
    expect(encodeBase62(BigInt("4294967295"), 6)).toBe("4gfFC3");
  });

  it("rechaza valores que no caben sin truncar bits", () => {
    expect(() => encodeBase62(BigInt(62), 1)).toThrow(RangeError);
    expect(() => encodeBase62(BigInt(-1), 6)).toThrow(RangeError);
    expect(() => encodeBase62(BigInt(0), 0)).toThrow(RangeError);
  });

  it("coincide con los vectores conocidos de CRC32/IEEE y devuelve un uint32", () => {
    expect(crc32(Buffer.from("123456789", "ascii"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});
