/**
 * Lo máximo que puede costar un request antes de mandarlo (ADR-0065): el prompt estimado hacia arriba y la
 * salida máxima, a los precios más altos con que se le puede cobrar. Funciones puras: las usa el handler para
 * reservar ese monto mientras el request está en curso.
 */
import { MIN_MARGIN_BPS } from "@/lib/catalog/validate";

import { MIN_CHARGE_MICRO_USD } from "./metering";
import type { GatewayModel } from "./types";

/** Salida máxima cuando ni el cliente ni el catálogo la fijan. Se manda como `max_tokens` al upstream. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;
/** Si no alcanza ni para esta salida (o para la pedida, si es menor), se rechaza en vez de recortar. */
export const MIN_OUTPUT_TOKENS = 1_024;
/** Lo que se reserva por imagen: el tamaño de su base64 no dice cuántos tokens cobra el modelo. */
export const IMAGE_PROMPT_TOKENS = 2_000;
/** Bytes por token al estimar el prompt hacia arriba. El texto suele dar 4 o más; código y CJK, cerca de 3. */
const PROMPT_BYTES_PER_TOKEN = 3;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const ONE_MILLION = BigInt(1_000_000);
const BPS = BigInt(10_000);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ceilDiv(numerator: bigint, divisor: bigint): bigint {
  return (numerator + divisor - ONE) / divisor;
}

/** La URL de una parte `image_url` (objeto o texto), o null si la parte no es una imagen. */
function imageUrl(part: unknown): string | null {
  if (!isObject(part) || part.type !== "image_url") return null;
  const image = part.image_url;
  if (typeof image === "string") return image;
  return isObject(image) && typeof image.url === "string" ? image.url : "";
}

/**
 * Tokens de prompt, hacia arriba: todo el body cuenta (mensajes, tools, `response_format`…) a 3 bytes por token,
 * salvo las imágenes, que reservan un monto fijo cada una. Nunca más que el contexto del modelo: un prompt más
 * largo lo rechaza el upstream.
 */
export function estimatePromptTokens(rawBody: string, body: Readonly<Record<string, unknown>>, contextLength: number): number {
  let bytes = Buffer.byteLength(rawBody, "utf8");
  let images = 0;
  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (!isObject(message) || !Array.isArray(message.content)) continue;
      for (const part of message.content) {
        const url = imageUrl(part);
        if (url === null) continue;
        images++;
        bytes -= Buffer.byteLength(url, "utf8");
      }
    }
  }
  const tokens = Math.ceil(Math.max(0, bytes) / PROMPT_BYTES_PER_TOKEN) + images * IMAGE_PROMPT_TOKENS;
  return Math.min(tokens, Math.max(1, contextLength));
}

/**
 * El precio por 1M más alto con que se puede cobrar cada token: el del catálogo (cuando el upstream no reporta
 * su costo) o el tope de costo de cualquiera de sus upstreams con el margen (ADR-0054). El fallback puede
 * terminar en cualquiera.
 */
export function holdPrices(model: GatewayModel): { input: bigint; output: bigint } {
  const withMargin = (cost: bigint) => ceilDiv(cost * (BPS + BigInt(MIN_MARGIN_BPS)), BPS);
  let input = model.inputPricePer1M;
  let output = model.outputPricePer1M;
  for (const target of model.upstreams) {
    const targetInput = withMargin(target.costInputPer1M);
    const targetOutput = withMargin(target.costOutputPer1M);
    if (targetInput > input) input = targetInput;
    if (targetOutput > output) output = targetOutput;
  }
  return { input, output };
}

/** Lo que define el costo máximo de un request, ya validado. */
export interface RequestShape {
  promptTokens: number;
  /** `max_tokens` / `max_completion_tokens` del cliente (el menor), o null si no mandó ninguno. */
  requestedOutputTokens: number | null;
  /** `n`: cada elección genera su propia salida. */
  choices: number;
}

export type HoldSize =
  | {
      ok: true;
      /** Lo que se reserva mientras el request está en curso. */
      amountMicroUsd: bigint;
      /** La salida máxima que cabe: la pedida, o menos si el presupuesto no alcanza. */
      maxOutputTokens: number;
      /** True si hay que mandarle `maxOutputTokens` al upstream: el cliente no fijó salida o se recortó. */
      limitsOutput: boolean;
    }
  | { ok: false };

/** La salida que se pediría sin límite de presupuesto: la del cliente o la por defecto, acotada por el modelo. */
function wantedOutputTokens(model: GatewayModel, requested: number | null): number {
  let wanted = requested ?? model.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (model.maxOutputTokens !== null) wanted = Math.min(wanted, model.maxOutputTokens);
  return Math.max(1, Math.min(wanted, model.contextLength));
}

/**
 * Cuánto reservar para un request con `budget` disponible (null: sin límite). Si la salida pedida no cabe, la
 * recorta a lo que alcanza; si ni el prompt con `MIN_OUTPUT_TOKENS` de salida cabe, no hay reserva posible.
 */
export function sizeHold(model: GatewayModel, shape: RequestShape, budget: bigint | null): HoldSize {
  const prices = holdPrices(model);
  const choices = BigInt(Math.max(1, shape.choices));
  const promptCost = ceilDiv(BigInt(shape.promptTokens) * prices.input, ONE_MILLION);
  const outputCost = (tokens: number) => ceilDiv(BigInt(tokens) * choices * prices.output, ONE_MILLION);
  const wanted = wantedOutputTokens(model, shape.requestedOutputTokens);
  const floor = Math.min(wanted, MIN_OUTPUT_TOKENS);
  if (budget !== null && promptCost + outputCost(floor) > budget) return { ok: false };

  let maxOutputTokens = wanted;
  if (budget !== null && prices.output > ZERO && promptCost + outputCost(wanted) > budget) {
    const affordable = ((budget - promptCost) * ONE_MILLION) / (choices * prices.output);
    maxOutputTokens = Math.max(floor, Math.min(wanted, Number(affordable)));
  }
  const amount = promptCost + outputCost(maxOutputTokens);
  return {
    ok: true,
    amountMicroUsd: amount > MIN_CHARGE_MICRO_USD ? amount : MIN_CHARGE_MICRO_USD,
    maxOutputTokens,
    limitsOutput: shape.requestedOutputTokens === null || maxOutputTokens < shape.requestedOutputTokens,
  };
}

/** El body con la salida acotada: en los campos que mandó el cliente, o en `max_tokens` si no mandó ninguno. */
export function withOutputLimit(body: Readonly<Record<string, unknown>>, tokens: number): Record<string, unknown> {
  const sent = (["max_completion_tokens", "max_tokens"] as const).filter((field) => body[field] !== undefined && body[field] !== null);
  const limited: Record<string, unknown> = { ...body };
  for (const field of sent.length > 0 ? sent : ["max_tokens"]) limited[field] = tokens;
  return limited;
}
