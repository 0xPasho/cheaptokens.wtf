import { describe, expect, it } from "vitest";

import { ACCOUNTS_IN_ORDER, createAccountRotation } from "@/lib/gateway/accounts";

describe("createAccountRotation", () => {
  it("rota cada upstream por separado", () => {
    const accounts = createAccountRotation({ random: () => 0 });
    expect(accounts.order("a", 3)).toEqual([0, 1, 2]);
    expect(accounts.order("b", 2)).toEqual([0, 1]);
    expect(accounts.order("a", 3)).toEqual([1, 2, 0]);
    expect(accounts.order("b", 2)).toEqual([1, 0]);
    expect(accounts.order("a", 3)).toEqual([2, 0, 1]);
  });

  it("sin cuentas no devuelve ninguna y con una siempre es esa", () => {
    const accounts = createAccountRotation({ random: () => 0.99 });
    expect(accounts.order("a", 0)).toEqual([]);
    expect(accounts.order("a", 1)).toEqual([0]);
    expect(accounts.order("a", 1)).toEqual([0]);
  });

  it("aguanta que cambie el número de cuentas", () => {
    const accounts = createAccountRotation({ random: () => 0 });
    accounts.order("a", 3);
    accounts.order("a", 3);
    expect(accounts.order("a", 2)).toEqual([0, 1]);
  });

  it("una pausa nueva no acorta la que ya tenía", () => {
    let now = 0;
    const accounts = createAccountRotation({ random: () => 0, now: () => now });
    accounts.pause("a", 0, 300_000);
    accounts.pause("a", 0, 60_000);
    now = 60_000;
    expect(accounts.order("a", 2)).toEqual([1, 0]);
    now = 300_000;
    expect(accounts.order("a", 2)).toEqual([1, 0]);
    expect(accounts.order("a", 2)).toEqual([0, 1]);
  });
});

it("ACCOUNTS_IN_ORDER prueba siempre en el orden escrito y no pausa", () => {
  ACCOUNTS_IN_ORDER.pause("a", 0, 60_000);
  expect(ACCOUNTS_IN_ORDER.order("a", 3)).toEqual([0, 1, 2]);
  expect(ACCOUNTS_IN_ORDER.order("a", 3)).toEqual([0, 1, 2]);
  expect(ACCOUNTS_IN_ORDER.order("a", 0)).toEqual([]);
});
