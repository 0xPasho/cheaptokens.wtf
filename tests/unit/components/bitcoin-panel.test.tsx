import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinResult } from "@/app/[lang]/(site)/dashboard/actions";
import { BitcoinPanel } from "@/components/dashboard/bitcoin-panel";
import { actionErrors } from "@/components/dashboard/action-errors";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { BitcoinOrderView, BitcoinView } from "@/lib/payments/bitcoin/view";

const actions = vi.hoisted(() => ({
  bitcoinStatusAction: vi.fn<() => Promise<BitcoinResult>>(),
  bitcoinQuoteAction: vi.fn<(input: unknown) => Promise<BitcoinResult>>(),
  simulateBitcoinAction: vi.fn<(stage: string) => Promise<BitcoinResult>>(),
}));
vi.mock("@/app/[lang]/(site)/dashboard/actions", () => actions);
// Estable, como el de Next: si cambiara en cada render, la revisión del panel se reiniciaría.
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const dict = getDictionary("es");
const labels = dict.dashboard.bitcoin;
const NOW = Date.UTC(2026, 10, 17, 18);
const ADDRESS = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";

function view(overrides: Partial<BitcoinView> = {}): BitcoinView {
  return {
    network: "mainnet", testnet: false, simulate: false, address: ADDRESS, balanceMicroUsd: "0",
    minMicroUsd: "10000000", maxMicroUsd: "10000000000", confirmations: 1, windowMs: 15 * 60_000, serverNow: NOW,
    order: null, receipts: [], ...overrides,
  };
}

function order(overrides: Partial<BitcoinOrderView> = {}): BitcoinOrderView {
  return {
    id: "order-1", intent: "plan", planId: "pro", address: ADDRESS, amountMicroUsd: "39000000", amountSats: "41235",
    rateMicroUsd: "94580000000", createdAt: NOW - 60_000, expiresAt: NOW + 14 * 60_000, outcome: null,
    receivedMicroUsd: "0", pending: false, ...overrides,
  };
}

const plan = { kind: "plan" as const, planId: "pro", planName: "Pro", missingMicroUsd: BigInt(39_000_000) };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setInterval", "clearInterval"] });
  actions.bitcoinStatusAction.mockReset().mockImplementation(async () => ({ ok: true, bitcoin: view() }));
  actions.bitcoinQuoteAction.mockReset();
  router.refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

async function renderPanel(initial: BitcoinView, onPlanDone = vi.fn()) {
  actions.bitcoinStatusAction.mockResolvedValue({ ok: true, bitcoin: initial });
  await act(async () => {
    render(<BitcoinPanel initial={initial} locale="es" labels={labels} purpose={plan} errors={actionErrors(dict)} onPlanDone={onPlanDone} />);
  });
  return onPlanDone;
}

describe("BitcoinPanel", () => {
  it("cotiza lo que falta para el plan con un botón", async () => {
    await renderPanel(view());
    actions.bitcoinQuoteAction.mockResolvedValue({ ok: true, bitcoin: view({ order: order() }) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cotizar 39,00\sUS\$ en Bitcoin/ }));
    });
    expect(actions.bitcoinQuoteAction).toHaveBeenCalledWith({ intent: "plan", planId: "pro" });
    expect(await screen.findByText("0.00041235 BTC")).toBeInTheDocument();
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(/Precio fijo por 14:00/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /0\.00041235 BTC/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: labels.openWallet })).toHaveAttribute("href", `bitcoin:${ADDRESS}?amount=0.00041235&label=cheapllm.wtf`);
  });

  it("muestra la cotización vencida con la opción de cotizar de nuevo", async () => {
    await renderPanel(view({ order: order({ expiresAt: NOW - 1 }) }));
    expect(screen.getAllByText(labels.expired).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: labels.newQuote })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: labels.openWallet })).toBeNull();
  });

  it("avisa que el pago se ve en la red y que el plan se activa solo", async () => {
    await renderPanel(view({
      order: order({ pending: true, receivedMicroUsd: "39000000" }),
      receipts: [{
        id: "r1", orderId: "order-1", sats: "41235", amountMicroUsd: "39000000", rateSource: "quote", status: "seen",
        inBlock: false, url: "https://mempool.space/tx/abc", seenAt: NOW,
      }],
    }));
    expect(screen.getByText("Vemos tu pago: 0.00041235 BTC")).toBeInTheDocument();
    expect(screen.getByText(/Pro se activa solo al confirmarse/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver transacción/ })).toHaveAttribute("href", "https://mempool.space/tx/abc");
  });

  it("avisa al diálogo cuando el servidor ya compró el plan, una sola vez", async () => {
    const done = await renderPanel(view({ order: order({ outcome: "plan", receivedMicroUsd: "39000000" }) }));
    expect(done).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("dice cuánto falta si llegó menos de lo que pide el plan", async () => {
    await renderPanel(view({
      order: order({ receivedMicroUsd: "20000000" }),
      receipts: [{
        id: "r1", orderId: "order-1", sats: "21000", amountMicroUsd: "20000000", rateSource: "market", status: "credited",
        inBlock: true, url: null, seenAt: NOW,
      }],
    }));
    expect(screen.getByText(/Para el plan faltan 19,00\sUS\$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.quoteRest })).toBeInTheDocument();
  });

  it("muestra el error del servidor si no hay un precio confiable", async () => {
    await renderPanel(view());
    actions.bitcoinQuoteAction.mockResolvedValue({ ok: false, error: "bitcoinRate" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cotizar/ }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.rateUnavailable);
  });
});
