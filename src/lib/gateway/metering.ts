import type { GatewayModel, UpstreamTarget, Usage, UsageAccumulator } from "./types";

// BigInt() permite mantener el target ES2017 del proyecto sin perder precisión.
export const MIN_CHARGE_MICRO_USD = BigInt(10);

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const ONE_MILLION = BigInt(1_000_000);

type TokenCounts = Pick<Usage, "promptTokens" | "completionTokens">;
type TokenPrices = { input: bigint; output: bigint };

/** Convierte el decimal reportado por el upstream antes de hacer cualquier redondeo. */
export function usdToMicroUsdCeil(value: number | string): bigint {
  const decimal = String(value).trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(decimal);
  if (!match) throw new RangeError("USD amount must be a finite, non-negative decimal");

  const fraction = match[3] ?? match[4] ?? "";
  const digits = `${match[2] ?? ""}${fraction}`.replace(/^0+/, "");
  if (!digits) return ZERO;
  if (match[1] === "-") throw new RangeError("USD amount must not be negative");

  const coefficient = BigInt(digits);
  const scale = BigInt(match[5] ?? "0") - BigInt(fraction.length) + BigInt(6);
  if (scale >= ZERO) return coefficient * TEN ** scale;

  // Un decimal positivo menor a un µUSD siempre redondea a uno, aun con exponentes extremos.
  if (-scale >= BigInt(digits.length)) return ONE;
  const divisor = TEN ** -scale;
  return (coefficient + divisor - ONE) / divisor;
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function costForTokens(tokens: TokenCounts, pricesPer1M: TokenPrices): bigint {
  if (!isTokenCount(tokens.promptTokens) || !isTokenCount(tokens.completionTokens)) {
    throw new RangeError("Token counts must be non-negative safe integers");
  }
  if (pricesPer1M.input < ZERO || pricesPer1M.output < ZERO) {
    throw new RangeError("Token prices must not be negative");
  }

  const numerator = BigInt(tokens.promptTokens) * pricesPer1M.input
    + BigInt(tokens.completionTokens) * pricesPer1M.output;
  return (numerator + ONE_MILLION - ONE) / ONE_MILLION;
}

export function chargeForTokens(
  tokens: TokenCounts,
  pricesPer1M: TokenPrices,
  minCharge: bigint = MIN_CHARGE_MICRO_USD,
): bigint {
  if (minCharge < ZERO) throw new RangeError("Minimum charge must not be negative");
  const cost = costForTokens(tokens, pricesPer1M);
  return tokens.completionTokens > 0 && cost < minCharge ? minCharge : cost;
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createUsageAccumulator(): UsageAccumulator {
  let usage: Usage | null = null;

  return {
    observe(payload) {
      try {
        if (!isRecord(payload)) return;
        const incoming = payload.usage;
        if (!isRecord(incoming)) return;

        usage ??= {
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: null,
          reasoningTokens: null,
          upstreamCostMicroUsd: null,
          estimated: false,
        };

        const promptTokens = incoming.prompt_tokens;
        const completionTokens = incoming.completion_tokens;
        if (isTokenCount(promptTokens)) usage.promptTokens = promptTokens;
        if (isTokenCount(completionTokens)) usage.completionTokens = completionTokens;

        const promptDetails = incoming.prompt_tokens_details;
        const completionDetails = incoming.completion_tokens_details;
        const cachedTokens = isRecord(promptDetails) ? promptDetails.cached_tokens : undefined;
        const reasoningTokens = isRecord(completionDetails) ? completionDetails.reasoning_tokens : undefined;
        if (isTokenCount(cachedTokens)) usage.cachedTokens = cachedTokens;
        if (isTokenCount(reasoningTokens)) usage.reasoningTokens = reasoningTokens;

        const cost = incoming.cost;
        if (typeof cost === "number" || typeof cost === "string") {
          usage.upstreamCostMicroUsd = usdToMicroUsdCeil(cost);
        }
      } catch {
        // Un payload malformado no debe cortar el stream ni borrar la medición válida anterior.
      }
    },
    result() {
      return usage === null ? null : { ...usage };
    },
  };
}

export function computeRequestCosts(input: {
  usage: Usage;
  model: GatewayModel;
  target: UpstreamTarget | null;
}): { costMicroUsd: bigint; upstreamCostMicroUsd: bigint; officialCostMicroUsd: bigint } {
  const { usage, model, target } = input;

  return {
    costMicroUsd: chargeForTokens(usage, { input: model.inputPricePer1M, output: model.outputPricePer1M }),
    upstreamCostMicroUsd: usage.upstreamCostMicroUsd ?? (target === null ? ZERO : costForTokens(usage, {
      input: target.costInputPer1M,
      output: target.costOutputPer1M,
    })),
    officialCostMicroUsd: costForTokens(usage, { input: model.officialInputPer1M, output: model.officialOutputPer1M }),
  };
}
