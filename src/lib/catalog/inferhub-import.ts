import { z } from "zod";

import { applyDiscount } from "./pricing";
import type { CatalogEntry, UpstreamModelMapping } from "./types";
import { MIN_MARGIN_BPS } from "./validate";

export const INFERHUB_CATALOG_URL = "https://api.inferhub.dev/v1/models";

const finitePrice = z.number().finite().nonnegative();
const officialModel = z.object({
  id: z.string().min(1),
  upstream_label: z.string().nullish(),
  input_token_limit: z.number().int().positive().optional(),
  modality: z.string().optional(),
  reasoning_levels: z.array(z.string()).optional(),
  pricing: z.object({
    official_in: finitePrice.optional(),
    official_out: finitePrice.optional(),
    asks_in: z.array(finitePrice).optional(),
    asks_out: z.array(finitePrice).optional(),
  }).nullish(),
});
const responseSchema = z.object({ object: z.literal("list"), data: z.array(officialModel).min(1) });

// Model creators, not the routing prefixes exposed by the supplier.
const CREATORS = [
  { pattern: /^Claude\b/i, author: "anthropic", pricing: "https://www.anthropic.com/pricing" },
  { pattern: /^GPT\b/i, author: "openai", pricing: "https://openai.com/api/pricing/" },
  { pattern: /^Gemini\b/i, author: "google", pricing: "https://ai.google.dev/gemini-api/docs/pricing" },
  { pattern: /^DeepSeek\b/i, author: "deepseek", pricing: "https://api-docs.deepseek.com/quick_start/pricing" },
  { pattern: /^Qwen\s*\d/i, author: "qwen", pricing: "https://www.alibabacloud.com/help/en/model-studio/model-pricing" },
  { pattern: /^GLM\b/i, author: "z-ai", pricing: "https://docs.z.ai/guides/overview/pricing" },
  { pattern: /^Kimi\b/i, author: "moonshotai", pricing: "https://platform.moonshot.ai/docs/pricing/chat" },
  { pattern: /^MiniMax\b/i, author: "minimax", pricing: "https://platform.minimax.io/docs/pricing/pay-as-you-go" },
  { pattern: /^Grok\b/i, author: "x-ai", pricing: "https://docs.x.ai/docs/models" },
  { pattern: /^Mistral\b/i, author: "mistralai", pricing: "https://mistral.ai/pricing" },
  { pattern: /^MiMo\b/i, author: "xiaomi", pricing: "https://platform.xiaomimimo.com/" },
  { pattern: /^Muse\b/i, author: "meta-llama", pricing: "https://www.meta.ai/" },
] as const;

type Candidate = { entry: CatalogEntry; mapping: UpstreamModelMapping };

/** Convert a published decimal to integer micro-USD, rounding fractions upwards. */
export function publishedPriceToMicros(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid published price");
  const [coefficient, exponent = "0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = BigInt(whole + fraction);
  const scale = 6 + Number(exponent) - fraction.length;
  const divisor = BigInt(10) ** BigInt(Math.abs(scale));
  const result = scale >= 0 ? digits * divisor : (digits + divisor - BigInt(1)) / divisor;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Published price exceeds the supported range");
  return Number(result);
}

function medianAsk(prices: number[] | undefined): number | undefined {
  const positive = prices?.filter((price) => price > 0).sort((a, b) => a - b);
  return positive?.length ? publishedPriceToMicros(positive[Math.floor(positive.length / 2)]) : undefined;
}

function discountFor(officialInput: number, officialOutput: number, input: number, output: number): number | undefined {
  const required = (cost: number) => (BigInt(cost) * BigInt(10_000 + MIN_MARGIN_BPS) + BigInt(9_999)) / BigInt(10_000);
  // Preserve the advertised maximum of 90%; one whole percentage for both sides.
  for (let discount = 9_000; discount >= 0; discount -= 100) {
    if (BigInt(applyDiscount(officialInput, discount)) >= required(input)
      && BigInt(applyDiscount(officialOutput, discount)) >= required(output)) return discount;
  }
  return undefined;
}

export function importInferhubCatalog(payload: unknown, previous: CatalogEntry[] = []) {
  const source = responseSchema.parse(payload);
  const candidates = new Map<string, Candidate>();
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };

  for (const row of source.data) {
    if (row.id.startsWith("free/") || !row.id.includes("/")) { skip("free-or-alias"); continue; }
    if (!/^[a-z0-9-]+\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(row.id)) { skip("invalid-route"); continue; }
    if (!row.upstream_label || !row.input_token_limit || !row.modality?.split(",").includes("text")) { skip("missing-chat-metadata"); continue; }
    const name = row.upstream_label.replace(/\s*\(Kiro\)/gi, "").replace(/^GPT[- ]/i, "GPT ")
      .replace(/^GLM[- ]/i, "GLM ").replace(/^Qwen\s+(\d)/i, "Qwen$1").trim();
    if (/\b(image|imagen|embedding|tts|whisper|sora|veo|flux)\b/i.test(name)) { skip("unsupported-endpoint"); continue; }
    const creator = CREATORS.find((item) => item.pattern.test(name));
    if (!creator) { skip("unattributed-creator"); continue; }
    const prices = row.pricing;
    if (!prices?.official_in || !prices.official_out) { skip("missing-paid-pricing"); continue; }
    const input = medianAsk(prices.asks_in);
    const output = medianAsk(prices.asks_out);
    if (input === undefined || output === undefined) { skip("missing-paid-offers"); continue; }
    const officialInput = publishedPriceToMicros(prices.official_in);
    const officialOutput = publishedPriceToMicros(prices.official_out);
    const discount = discountFor(officialInput, officialOutput, input, output);
    if (discount === undefined) { skip("insufficient-margin"); continue; }
    const slug = name.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
    const id = `${creator.author}/${slug}`;
    const known = previous.find((entry) => entry.id === id);
    const tags: CatalogEntry["tags"] = [];
    if (row.modality.split(",").includes("image")) tags.push("vision");
    if (row.reasoning_levels?.some((level) => level !== "none")) tags.push("reasoning");
    if (/\b(code|coder|codex|coding)\b/i.test(name)) tags.push("coding");
    // Preserve previously curated capabilities only, never infer tool support or open weights.
    for (const tag of known?.tags ?? []) if (!tags.includes(tag)) tags.push(tag);
    const entry: CatalogEntry = {
      id, name, author: creator.author,
      description: {
        en: `${name}. ${row.modality.split(",").includes("image") ? "Accepts text and image input." : "Accepts text input."}`,
        es: `${name}. ${row.modality.split(",").includes("image") ? "Admite entradas de texto e imagen." : "Admite entradas de texto."}`,
      },
      contextLength: row.input_token_limit, officialInput, officialOutput,
      officialPriceSourceUrl: creator.pricing,
      // Supplier-reported list prices have not been independently verified with the creator.
      officialPriceVerifiedAt: null, discountBps: discount, tags, status: "active",
    };
    const candidate: Candidate = { entry, mapping: { model: id, upstreamModel: row.id, costInputPer1M: input, costOutputPer1M: output, priority: 1 } };
    const current = candidates.get(id);
    // One explicit route, with its own context and prices. Never mix metadata from different rails.
    if (!current || discount > current.entry.discountBps
      || (discount === current.entry.discountBps && row.id < current.mapping.upstreamModel)) candidates.set(id, candidate);
  }

  if (!candidates.size) throw new Error("The official catalog contains no eligible paid chat models; the current catalog was retained");
  const selected = [...candidates.values()].sort((a, b) => a.entry.id.localeCompare(b.entry.id));
  // IDs are permanent: keep removed examples or delisted models as retired, never advertised.
  const retired = previous.filter((entry) => !candidates.has(entry.id)).map((entry) => ({ ...entry, status: "retired" as const }));
  return {
    models: [...selected.map((item) => item.entry), ...retired],
    mappings: selected.map((item) => item.mapping),
    report: { received: source.data.length, published: selected.length, retired: retired.length, skipped },
  };
}
