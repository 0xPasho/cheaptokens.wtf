import { describe, expect, it } from "vitest";

import { avatarBackground, avatarLayers } from "@/lib/account-avatar";

describe("account avatar", () => {
  it("dibuja el mismo degradado que Deska para el mismo id", () => {
    expect(avatarBackground("user_2abcDEF")).toBe(
      "radial-gradient(76.1% 76.1% at 73% 15.4%, #fbe2ae, #fbe2ae00), radial-gradient(63.4% 63.4% at 79.3% 81.6%, #6dbcfd, #6dbcfd00), radial-gradient(68.7% 68.7% at 9.2% 55.4%, #d6823f, #d6823f00), #416f6f",
    );
  });

  it("da imágenes distintas a cuentas distintas", () => {
    const seen = new Set(Array.from({ length: 500 }, (_, i) => avatarBackground(`user_${i}`)));
    expect(seen.size).toBe(500);
  });

  it("dibuja tres manchas sobre una base, en hex", () => {
    const { base, blobs } = avatarLayers("user_y");
    expect(blobs).toHaveLength(3);
    for (const colour of [base, ...blobs.map((b) => b.color)]) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });
});
