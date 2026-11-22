// =============================================================================
// Avatar por defecto de la cuenta: un degradado abstracto (una base oscura bajo
// tres manchas de luz) que sale del id de Clerk. Es el mismo algoritmo que usa
// Deska (deska-remote/packages/protocol-constants/src/account-avatar.ts), así
// que es único por cuenta, estable y no necesita columna ni foto.
//
// Los colores son datos derivados del id, no del sistema de diseño: por eso es
// la única excepción a la regla de tokens semánticos.
// =============================================================================
export interface AvatarBlob {
  /** Centre and radius as fractions of the avatar"s side. */
  x: number
  y: number
  r: number
  color: string
}

export interface AvatarLayers {
  base: string
  /** Bottom to top. */
  blobs: AvatarBlob[]
}

/** A seed as a number: a string is hashed, a number is already its hash. */
type AvatarSeed = string | number

/** FNV-1a: a stable 32-bit hash of the seed. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a small seeded generator, so one hash yields many draws. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const sat = s / 100
  const light = l / 100
  const k = (n: number) => (n + hue / 30) % 12
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  const byte = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0")
  return `#${byte(f(0))}${byte(f(8))}${byte(f(4))}`
}

const round = (v: number) => Math.round(v * 1000) / 1000

/** Hue families as [base, ember, cool, highlight]. The first is the store
 *  captures" avatar; the rest keep its shape (a dark base, one warm blob, one
 *  cool blob, one pale highlight) in other colours. Free hues on a wheel made
 *  muddy greens and washed-out pastels, so the families are chosen by hand and
 *  the seed varies everything inside them. */
const FAMILIES: ReadonlyArray<readonly [number, number, number, number]> = [
  [277, 15, 223, 29],
  [205, 172, 252, 42],
  [330, 352, 262, 38],
  [168, 18, 198, 50],
  [300, 330, 205, 22],
  [22, 4, 258, 44],
  [236, 282, 190, 322],
  [184, 8, 232, 34],
  [345, 22, 288, 196],
  [220, 26, 178, 48],
]

/** What a seed becomes before anything is drawn: the number a creator
 *  profile sends instead of the Clerk id. Draws the same picture as the id. */
export function avatarHash(seed: AvatarSeed): number {
  return typeof seed === "number" ? seed >>> 0 : hash(seed || "cheaptokens")
}

/** The layers for a seed: a family, each hue nudged, each blob moved and
 *  resized, and the whole arrangement turned so the highlight is not always
 *  top left. */
export function avatarLayers(seed: AvatarSeed): AvatarLayers {
  const next = random(avatarHash(seed))
  const jitter = (spread: number) => (next() * 2 - 1) * spread
  const [base, ember, cool, highlight] = FAMILIES[Math.floor(next() * FAMILIES.length)]!
  const turn = next() * Math.PI * 2
  const place = (x: number, y: number) => {
    const dx = x - 0.5 + jitter(0.06)
    const dy = y - 0.5 + jitter(0.06)
    return {
      x: round(0.5 + dx * Math.cos(turn) - dy * Math.sin(turn)),
      y: round(0.5 + dx * Math.sin(turn) + dy * Math.cos(turn)),
    }
  }
  return {
    base: hex(base + jitter(12), 27 + jitter(5), 34 + jitter(4)),
    blobs: [
      { ...place(0.4, 0.95), r: round(0.75 + jitter(0.08)), color: hex(ember + jitter(12), 71 + jitter(8), 58 + jitter(4)) },
      { ...place(0.85, 0.3), r: round(0.7 + jitter(0.08)), color: hex(cool + jitter(12), 92 + jitter(8), 74 + jitter(3)) },
      { ...place(0.22, 0.2), r: round(0.8 + jitter(0.08)), color: hex(highlight + jitter(10), 95 + jitter(5), 83 + jitter(2)) },
    ],
  }
}

/** The same layers as a CSS `background`, for a box that rounds itself. */
export function avatarBackground(seed: AvatarSeed): string {
  const { base, blobs } = avatarLayers(seed)
  const layers = [...blobs]
    .reverse()
    .map((b) => {
      const r = `${round(b.r * 100)}%`
      return `radial-gradient(${r} ${r} at ${round(b.x * 100)}% ${round(b.y * 100)}%, ${b.color}, ${b.color}00)`
    })
  return [...layers, base].join(", ")
}
