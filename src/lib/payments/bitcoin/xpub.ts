/**
 * Direcciones de recibir de una cuenta BIP84 a partir de su llave pública extendida (ADR-0063). El servidor
 * solo conoce la xpub: puede dar direcciones nuevas, pero no mover lo que llega a ellas.
 *
 * La derivación no se cambia nunca: `m/84'/<moneda>'/<cuenta>'/0/<índice>`, P2WPKH (`bc1q…`). Cambiarla
 * dejaría lo que llegue en direcciones que la wallet no ve. Lo verifica `tests/unit/bitcoin.test.ts` con los
 * vectores de BIP84.
 */
import { ripemd160 } from "@noble/hashes/legacy";
import { sha256 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { base58check, bech32 } from "@scure/base";

export type BitcoinNetworkId = "mainnet" | "testnet4" | "signet";
export const BITCOIN_NETWORK_IDS: readonly BitcoinNetworkId[] = ["mainnet", "testnet4", "signet"];

/** Prefijos de las llaves extendidas (SLIP-132). `zpub` y `vpub` son las de BIP84; `xpub` y `tpub`, las genéricas. */
const PUBLIC_VERSIONS = {
  xpub: { public: 0x0488b21e, private: 0x0488ade4, mainnet: true },
  zpub: { public: 0x04b24746, private: 0x04b2430c, mainnet: true },
  tpub: { public: 0x043587cf, private: 0x04358394, mainnet: false },
  vpub: { public: 0x045f1cf6, private: 0x045f18bc, mainnet: false },
} as const;
const PRIVATE_VERSIONS = new Set<number>(Object.values(PUBLIC_VERSIONS).map((version) => version.private));
const HARDENED = 0x80000000;
const b58 = base58check(sha256);

export class XpubError extends Error {}

/** La cuenta de la que salen las direcciones. Se construye una vez por proceso: derivar es barato, parsear no tanto. */
export class BitcoinAccount {
  readonly network: BitcoinNetworkId;
  /** El número de cuenta de la ruta (`m/84'/0'/<cuenta>'`), para avisar si es la #0 de la wallet. */
  readonly accountNumber: number;
  private readonly receive: HDKey;
  private readonly cache = new Map<number, string>();

  constructor(extendedKey: string, network: BitcoinNetworkId) {
    let raw: Uint8Array;
    try {
      raw = b58.decode(extendedKey.trim());
    } catch {
      throw new XpubError("CRYPTO_BITCOIN_XPUB is not an extended public key (xpub, zpub, tpub or vpub)");
    }
    if (raw.length !== 78) throw new XpubError("CRYPTO_BITCOIN_XPUB is not an extended public key (xpub, zpub, tpub or vpub)");
    const version = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0);
    if (PRIVATE_VERSIONS.has(version)) {
      throw new XpubError("CRYPTO_BITCOIN_XPUB is a PRIVATE key. Never put it on the server: use the account's public key (xpub or zpub)");
    }
    const kind = Object.values(PUBLIC_VERSIONS).find((candidate) => candidate.public === version);
    if (!kind) throw new XpubError("CRYPTO_BITCOIN_XPUB is not an extended public key (xpub, zpub, tpub or vpub)");
    if (kind.mainnet !== (network === "mainnet")) {
      throw new XpubError(network === "mainnet"
        ? "CRYPTO_BITCOIN_XPUB is a test network key (tpub, vpub): use an xpub or zpub on mainnet"
        : `CRYPTO_BITCOIN_XPUB is a mainnet key (xpub, zpub): ${network} needs a tpub or vpub`);
    }
    const account = HDKey.fromExtendedKey(b58.encode(raw), { public: kind.public, private: kind.private });
    // Una cuenta está a tres niveles de la raíz (propósito, moneda, cuenta). Otro nivel daría direcciones que la wallet no muestra.
    if (account.depth !== 3 || account.index < HARDENED) {
      throw new XpubError("CRYPTO_BITCOIN_XPUB must be an account key (m/84'/0'/n'), as Sparrow or your hardware wallet exports it");
    }
    this.network = network;
    this.accountNumber = account.index - HARDENED;
    this.receive = account.deriveChild(0);
  }

  /** La dirección de recibir número `index`. Siempre la misma para la misma xpub. */
  address(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= HARDENED) throw new Error("Invalid derivation index");
    let address = this.cache.get(index);
    if (!address) {
      const publicKey = this.receive.deriveChild(index).publicKey;
      if (!publicKey) throw new Error("Could not derive the address");
      const program = ripemd160(sha256(publicKey));
      address = bech32.encode(this.network === "mainnet" ? "bc" : "tb", [0, ...bech32.toWords(program)]);
      this.cache.set(index, address);
    }
    return address;
  }
}
