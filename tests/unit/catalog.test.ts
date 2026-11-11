// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { CATALOG } from "@catalog/models";
import { UPSTREAMS } from "@catalog/upstreams";
import {
  CHEAP_OUTPUT_MAX,
  computedTags,
  filterModels,
  getCatalog,
  getModel,
  LONG_CONTEXT_MIN,
  requestCost,
  similarModels,
  toModel,
} from "@/lib/catalog/queries";
import { MODEL_TAGS } from "@/lib/catalog/tags";
import type {
  CatalogEntry,
  UpstreamDefinition,
  UpstreamEnvironment,
  UpstreamModelMapping,
} from "@/lib/catalog/types";
import { type CatalogValidationInput, MIN_MARGIN_BPS, validateCatalog } from "@/lib/catalog/validate";

// La página de detalle lee el idioma con `next/root-params`, que solo existe dentro de Next.
vi.mock("next/root-params", () => ({ lang: async () => "en" }));

const ENVIRONMENTS: UpstreamEnvironment[] = ["development", "preview", "production"];

/** Catálogo de pruebas del gateway (ADR-0029). */
const TEST_MODELS = [
  "anthropic/claude-haiku-4.5",
  "qwen/qwen3.8-flash",
  "deepseek/deepseek-v4.1-flash",
  "z-ai/glm-5.3-flash",
];
const HIDDEN_MODELS = TEST_MODELS.slice(1);

const catalogEntry = (id: string) => {
  const found = CATALOG.find((e) => e.id === id);
  if (!found) throw new Error(`${id} is not in the catalog`);
  return found;
};

/** Reglas de docs/06-catalogo-y-precios.md sobre catalog/models.ts. */
describe("catalog/models.ts", () => {
  it("los IDs son únicos y tienen la forma autor/modelo en minúsculas", () => {
    const ids = CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
  });

  it("el autor coincide con el prefijo del ID", () => {
    for (const entry of CATALOG) expect(entry.id.startsWith(`${entry.author}/`), entry.id).toBe(true);
  });

  it("solo usa tags de la lista fija y no escribe a mano los calculados", () => {
    for (const entry of CATALOG) {
      for (const tag of entry.tags) expect(MODEL_TAGS, entry.id).toContain(tag);
      expect(entry.tags, entry.id).not.toContain("long-context");
      expect(entry.tags, entry.id).not.toContain("cheap");
    }
  });

  it("todo modelo tiene descripción en inglés y en español, precios positivos y descuento entre 0 y 100%", () => {
    for (const entry of CATALOG) {
      expect(entry.description.en.length, entry.id).toBeGreaterThan(10);
      expect(entry.description.es?.length ?? 0, entry.id).toBeGreaterThan(10);
      expect(entry.officialInput, entry.id).toBeGreaterThan(0);
      expect(entry.officialOutput, entry.id).toBeGreaterThan(0);
      expect(entry.discountBps, entry.id).toBeGreaterThanOrEqual(0);
      expect(entry.discountBps, entry.id).toBeLessThan(10_000);
      expect(entry.officialPriceSourceUrl, entry.id).toMatch(/^https:\/\//);
    }
  });

  it("un modelo deprecated tiene fecha de retiro", () => {
    for (const entry of CATALOG.filter((e) => e.status === "deprecated")) {
      expect(entry.retiresOn, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("catálogo de pruebas (ADR-0029)", () => {
  it("Claude Haiku 4.5 baja a 78%: $0.22 / $1.10 por 1M, y deja de ser cheap", () => {
    const haiku = toModel(catalogEntry("anthropic/claude-haiku-4.5"));
    expect(haiku.discountBps).toBe(7800);
    expect(haiku.status).toBe("active");
    expect([haiku.discountedInput, haiku.discountedOutput]).toEqual([220_000, 1_100_000]);
    expect(haiku.allTags).toEqual(["fast", "vision", "tools", "long-context"]);
  });

  it.each([
    ["qwen/qwen3.8-flash", 150_000, 470_000, ["fast", "vision"]],
    ["deepseek/deepseek-v4.1-flash", 150_000, 600_000, ["fast", "reasoning", "vision", "tools"]],
    ["z-ai/glm-5.3-flash", 150_000, 500_000, ["fast", "reasoning", "vision"]],
  ])("%s es hidden, con 85%%, su precio oficial y sus tags", (id, officialInput, officialOutput, tags) => {
    const entry = catalogEntry(id);
    expect(entry).toMatchObject({
      status: "hidden",
      discountBps: 8500,
      officialInput,
      officialOutput,
      contextLength: 1_000_000,
      officialPriceVerifiedAt: null,
      tags,
    });
    // 1M de contexto y output de menos de $1.00: la sincronización les agrega los dos calculados.
    expect(computedTags(entry)).toEqual(["long-context", "cheap"]);
  });

  it("los hidden no salen en getCatalog(), ni en los params estáticos del detalle, ni con getModel()", async () => {
    const visible = getCatalog().map((model) => model.id);
    expect(visible).toHaveLength(10);
    for (const id of HIDDEN_MODELS) expect(visible).not.toContain(id);

    const { generateStaticParams } = await import("@/app/[lang]/(site)/models/[author]/[model]/page");
    const params = generateStaticParams().map(({ author, model }) => `${author}/${model}`);
    expect(params).toEqual(visible);
    for (const id of HIDDEN_MODELS) {
      const { author, slug } = toModel(catalogEntry(id));
      expect(getModel(author, slug), id).toBeUndefined();
    }
  });
});

describe("catalog/upstreams.ts", () => {
  const byId = (id: string) => {
    const found = UPSTREAMS.find((u) => u.id === id);
    if (!found) throw new Error(`upstream ${id} is missing`);
    return found;
  };

  it("InferHub sirve los cuatro modelos a prioridad 1, con el costo de ADR-0029 en µUSD", () => {
    const inferhub = byId("inferhub");
    expect(inferhub).toMatchObject({
      baseUrl: "https://api.inferhub.dev/v1",
      apiKeyEnv: "UPSTREAM_INFERHUB_API_KEY",
      sendsPriceCap: true,
      environments: ENVIRONMENTS,
    });
    expect(inferhub.models).toEqual([
      { model: "anthropic/claude-haiku-4.5", upstreamModel: "ant/claude-haiku-4-5", costInputPer1M: 199_000, costOutputPer1M: 995_000, priority: 1 },
      { model: "qwen/qwen3.8-flash", upstreamModel: "alicn/qwen3.8-flash", costInputPer1M: 17_550, costOutputPer1M: 54_990, priority: 1 },
      { model: "deepseek/deepseek-v4.1-flash", upstreamModel: "alicn/deepseek-v4.1-flash", costInputPer1M: 17_550, costOutputPer1M: 70_200, priority: 1 },
      { model: "z-ai/glm-5.3-flash", upstreamModel: "zai/glm-5.3-flash", costInputPer1M: 6_450, costOutputPer1M: 21_500, priority: 1 },
    ]);
  });

  it("el mock va detrás de InferHub, solo fuera de producción y con menor costo", () => {
    const mock = byId("mock");
    const inferhub = byId("inferhub");
    expect(mock).toMatchObject({
      baseUrl: "http://127.0.0.1:4010/v1",
      apiKeyEnv: null,
      sendsPriceCap: true,
      environments: ["development", "preview"],
    });
    expect(mock.models.map((m) => m.model)).toEqual(TEST_MODELS);
    mock.models.forEach((mapping, index) => {
      const real = inferhub.models[index];
      // Sin `mock/`: el escenario lo decide `x_mock` en el body de cada prueba.
      expect(mapping.upstreamModel).toBe(mapping.model);
      expect(mapping.upstreamModel.startsWith("mock/")).toBe(false);
      expect(mapping.priority).toBe(2);
      expect(mapping.costInputPer1M).toBeLessThan(real.costInputPer1M);
      expect(mapping.costOutputPer1M).toBeLessThan(real.costOutputPer1M);
    });
  });

  it.each(ENVIRONMENTS)("el catálogo real pasa la validación en %s, sin errores ni warnings", (environment) => {
    expect(validateCatalog({ models: CATALOG, upstreams: UPSTREAMS, environment })).toEqual({
      errors: [],
      warnings: [],
    });
  });
});

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  id: "acme/model",
  name: "Model",
  author: "acme",
  description: { en: "A test model for the catalog.", es: "Un modelo de prueba para el catálogo." },
  contextLength: 100_000,
  officialInput: 1_000_000,
  officialOutput: 10_000_000,
  officialPriceSourceUrl: "https://example.com",
  officialPriceVerifiedAt: null,
  discountBps: 5000,
  tags: ["fast"],
  status: "active",
  ...overrides,
});

/** Con el `entry` de arriba (precio $0.50 / $5.00), este costo deja de sobra el 10% de margen. */
const mapping = (overrides: Partial<UpstreamModelMapping> = {}): UpstreamModelMapping => ({
  model: "acme/model",
  upstreamModel: "acme/model-v1",
  costInputPer1M: 100_000,
  costOutputPer1M: 1_000_000,
  priority: 1,
  ...overrides,
});

const upstream = (overrides: Partial<UpstreamDefinition> = {}): UpstreamDefinition => ({
  id: "acme-cloud",
  name: "Acme Cloud",
  baseUrl: "https://api.acme.test/v1",
  apiKeyEnv: "UPSTREAM_ACME_CLOUD_API_KEY",
  sendsPriceCap: false,
  environments: ENVIRONMENTS,
  models: [mapping()],
  ...overrides,
});

const validate = (input: Partial<CatalogValidationInput> = {}) =>
  validateCatalog({ models: [entry({})], upstreams: [upstream()], environment: "production", ...input });

describe("validateCatalog", () => {
  it("un catálogo correcto no da errores ni warnings", () => {
    for (const environment of ENVIRONMENTS) expect(validate({ environment })).toEqual({ errors: [], warnings: [] });
  });

  describe("esquema", () => {
    it.each<[string, Partial<CatalogEntry>, string]>([
      ["un ID sin autor", { id: "model" }, "id"],
      ["un ID con mayúsculas", { id: "acme/Model" }, "id"],
      ["un descuento de 100%", { discountBps: 10_000 }, "discountBps"],
      ["un descuento negativo", { discountBps: -1 }, "discountBps"],
      ["un precio en dólares en vez de µUSD", { officialInput: 0.15 }, "officialInput"],
      ["un precio oficial de 0", { officialOutput: 0 }, "officialOutput"],
      ["una URL de precio sin https", { officialPriceSourceUrl: "http://example.com" }, "officialPriceSourceUrl"],
      ["una fecha de verificación que no es ISO", { officialPriceVerifiedAt: "08/11/2026" }, "officialPriceVerifiedAt"],
      ["un contexto no entero", { contextLength: 1.5 }, "contextLength"],
      ["una descripción en inglés vacía", { description: { en: " " } }, "description.en"],
      ["un tag fuera de la lista", { tags: ["fast", "smart" as never] }, "tags.1"],
    ])("rechaza %s", (_, overrides, path) => {
      const id = overrides.id ?? "acme/model";
      const { errors } = validate({ models: [entry({ author: id.split("/")[0], ...overrides })], upstreams: [] });
      expect(errors).toContainEqual(expect.stringContaining(`: ${path}: `));
    });

    it.each<[string, Partial<UpstreamDefinition>, string]>([
      ["una base URL con / final", { baseUrl: "https://api.acme.test/v1/" }, "baseUrl"],
      ["una base URL que no es http", { baseUrl: "ftp://api.acme.test/v1" }, "baseUrl"],
      ["una key escrita en vez del nombre de la env var", { apiKeyEnv: "sk-live-123" }, "apiKeyEnv"],
      ["un upstream sin entornos", { environments: [] }, "environments"],
      ["un entorno repetido", { environments: ["preview", "preview"] }, "environments"],
      ["un costo en dólares en vez de µUSD", { models: [mapping({ costOutputPer1M: 0.995 })] }, "models.0.costOutputPer1M"],
      ["un costo negativo", { models: [mapping({ costInputPer1M: -1 })] }, "models.0.costInputPer1M"],
      ["una prioridad no entera", { models: [mapping({ priority: 1.5 })] }, "models.0.priority"],
    ])("rechaza %s", (_, overrides, path) => {
      const { errors } = validate({ upstreams: [upstream(overrides)], environment: "development" });
      expect(errors).toContainEqual(expect.stringMatching(new RegExp(`^upstream acme-cloud: ${path}: `)));
    });
  });

  describe("modelos", () => {
    it("rechaza un ID repetido", () => {
      const { errors } = validate({ models: [entry({}), entry({ name: "Copy" })] });
      expect(errors).toEqual(["model acme/model: duplicate id"]);
    });

    it("rechaza un autor que no coincide con el prefijo del ID", () => {
      const { errors } = validate({ models: [entry({ author: "other" })] });
      expect(errors).toEqual(['model acme/model: author "other" does not match the id prefix']);
    });

    it("rechaza los tags calculados escritos a mano y los tags repetidos", () => {
      const { errors } = validate({ models: [entry({ tags: ["fast", "long-context", "cheap", "fast"] })] });
      expect(errors).toEqual([
        "model acme/model: repeated tag",
        'model acme/model: tag "long-context" is computed at sync time, remove it from tags',
        'model acme/model: tag "cheap" is computed at sync time, remove it from tags',
      ]);
    });

    it("pide fecha de retiro a un modelo deprecated", () => {
      expect(validate({ models: [entry({ status: "deprecated" })] }).errors).toEqual([
        "model acme/model: a deprecated model needs retiresOn",
      ]);
      expect(validate({ models: [entry({ status: "deprecated", retiresOn: "2027-01-15" })] }).errors).toEqual([]);
    });

    it("advierte, sin fallar, si falta la descripción en español (docs/10)", () => {
      expect(validate({ models: [entry({ description: { en: "A test model for the catalog." } })] })).toEqual({
        errors: [],
        warnings: ['model acme/model: missing "es" description, "en" will be shown'],
      });
    });
  });

  describe("upstreams y mapeos", () => {
    it("rechaza un ID de upstream repetido", () => {
      const { errors } = validate({ upstreams: [upstream(), upstream({ name: "Copy" })] });
      expect(errors).toEqual(["upstream acme-cloud: duplicate id"]);
    });

    it("rechaza un mapeo a un modelo que no existe", () => {
      const { errors } = validate({ upstreams: [upstream({ models: [mapping({ model: "acme/ghost" })] })] });
      expect(errors).toEqual(["upstream acme-cloud → acme/ghost: unknown model"]);
    });

    it("rechaza un modelo mapeado dos veces al mismo upstream, pero no a dos upstreams", () => {
      const twice = upstream({ models: [mapping(), mapping({ priority: 2 })] });
      expect(validate({ upstreams: [twice] }).errors).toEqual([
        "upstream acme-cloud → acme/model: model is mapped more than once",
      ]);
      const other = upstream({ id: "other-cloud", apiKeyEnv: "UPSTREAM_OTHER_CLOUD_API_KEY" });
      expect(validate({ upstreams: [upstream(), other] }).errors).toEqual([]);
    });

    it.each(["claude-haiku-4-5", "qwen3.8-flash", "/qwen3.8-flash", "alicn/", "alicn/qwen/flash"])(
      "en InferHub rechaza el upstreamModel %j: siempre prefijo/modelo, nunca un alias (ADR-0028)",
      (upstreamModel) => {
        const inferhub = upstream({ id: "inferhub", sendsPriceCap: true, models: [mapping({ upstreamModel })] });
        expect(validate({ upstreams: [inferhub] }).errors).toEqual([
          `upstream inferhub → acme/model: upstreamModel "${upstreamModel}" must be "prefix/model", never an alias`,
        ]);
      },
    );

    it("acepta los IDs con prefijo en InferHub, y sin prefijo en otros upstreams", () => {
      const inferhub = upstream({ id: "inferhub", sendsPriceCap: true, models: [mapping({ upstreamModel: "alicn/qwen3.8-flash" })] });
      expect(validate({ upstreams: [inferhub] }).errors).toEqual([]);
      const other = upstream({ models: [mapping({ upstreamModel: "model-v1" })] });
      expect(validate({ upstreams: [other] }).errors).toEqual([]);
    });

    it("rechaza un upstream de producción sin apiKeyEnv, en cualquier entorno", () => {
      for (const environment of ENVIRONMENTS) {
        expect(validate({ upstreams: [upstream({ apiKeyEnv: null })], environment }).errors).toEqual([
          "upstream acme-cloud: available in production but has no apiKeyEnv",
        ]);
      }
      const devOnly = upstream({ apiKeyEnv: null, environments: ["development"] });
      expect(validate({ upstreams: [devOnly], environment: "development" }).errors).toEqual([]);
    });

    it("exige el tope de precio en InferHub (ADR-0028)", () => {
      const inferhub = upstream({ id: "inferhub", sendsPriceCap: false });
      expect(validate({ upstreams: [inferhub], environment: "development" }).errors).toContain(
        "upstream inferhub: must send the price cap (sendsPriceCap: true)",
      );
    });

    it("rechaza el mock marcado para producción, aunque tenga apiKeyEnv", () => {
      const mock = upstream({ id: "mock", apiKeyEnv: "UPSTREAM_MOCK_API_KEY" });
      expect(validate({ upstreams: [mock], environment: "development" }).errors).toEqual([
        "upstream mock: the mock upstream must never be available in production",
      ]);
    });
  });

  describe("margen mínimo (docs/06)", () => {
    it("MIN_MARGIN es 10%, en bps", () => {
      expect(MIN_MARGIN_BPS).toBe(1_000);
    });

    // Precio $1.10 / $1.10 por 1M: con costo $1.00 el margen es justo 10%.
    const tight = entry({ officialInput: 2_200_000, officialOutput: 2_200_000, discountBps: 5000 });
    const at = (costInputPer1M: number, costOutputPer1M: number, overrides: Partial<UpstreamDefinition> = {}) =>
      upstream({ models: [mapping({ costInputPer1M, costOutputPer1M })], ...overrides });

    it("acepta un precio que es exactamente el costo + 10%", () => {
      expect(validate({ models: [tight], upstreams: [at(1_000_000, 1_000_000)] })).toEqual({ errors: [], warnings: [] });
    });

    it("en producción, 1 µUSD por debajo es error, por separado en input y output", () => {
      expect(validate({ models: [tight], upstreams: [at(1_000_001, 1_000_000)] })).toEqual({
        errors: [
          "upstream acme-cloud → acme/model: input price 1100000 µUSD/1M is below cost 1000001 + 10% margin (needs ≥ 1100002)",
        ],
        warnings: [],
      });
      expect(validate({ models: [tight], upstreams: [at(1_000_000, 2_000_000)] }).errors).toEqual([
        "upstream acme-cloud → acme/model: output price 1100000 µUSD/1M is below cost 2000000 + 10% margin (needs ≥ 2200000)",
      ]);
    });

    it.each<UpstreamEnvironment>(["development", "preview"])("en %s solo advierte", (environment) => {
      const result = validate({ models: [tight], upstreams: [at(1_000_001, 1_000_001)], environment });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toMatch(/^upstream acme-cloud → acme\/model: input price .* below cost/);
      expect(result.warnings[1]).toMatch(/^upstream acme-cloud → acme\/model: output price .* below cost/);
    });

    it("usa el precio con descuento, no el oficial", () => {
      // Oficial $2.20, pero con 90% de descuento el precio es $0.22: no cubre un costo de $1.00.
      const deep = entry({ ...tight, discountBps: 9000 });
      expect(validate({ models: [deep], upstreams: [at(1_000_000, 1_000_000)] }).errors).toHaveLength(2);
    });

    it("ignora los mapeos deshabilitados", () => {
      const disabled = upstream({ models: [mapping({ costInputPer1M: 9_000_000, enabled: false })] });
      expect(validate({ upstreams: [disabled] })).toEqual({ errors: [], warnings: [] });
    });

    it("ignora los upstreams que no existen en ese entorno: el mock no cuenta en producción", () => {
      const mock = at(9_000_000, 9_000_000, { id: "mock", apiKeyEnv: null, environments: ["development", "preview"] });
      expect(validate({ upstreams: [mock], environment: "production" })).toEqual({ errors: [], warnings: [] });
      expect(validate({ upstreams: [mock], environment: "development" }).warnings).toHaveLength(2);
    });
  });
});

describe("tags calculados", () => {
  it("long-context desde 200,000 tokens", () => {
    expect(computedTags(entry({ contextLength: LONG_CONTEXT_MIN }))).toContain("long-context");
    expect(computedTags(entry({ contextLength: LONG_CONTEXT_MIN - 1 }))).not.toContain("long-context");
  });

  it("cheap si el precio cheaptokens.wtf de output es ≤ $1.00 por 1M", () => {
    expect(computedTags(entry({ officialOutput: 2_000_000, discountBps: 5000 }))).toContain("cheap");
    expect(CHEAP_OUTPUT_MAX).toBe(1_000_000);
    expect(computedTags(entry({ officialOutput: 2_000_002, discountBps: 5000 }))).not.toContain("cheap");
  });

  it("allTags sigue el orden de MODEL_TAGS y deriva el slug", () => {
    const model = toModel(entry({ id: "acme/model-1.5", tags: ["tools", "fast"], contextLength: 300_000 }));
    expect(model.allTags).toEqual(["fast", "tools", "long-context"]);
    expect(model.slug).toBe("model-1.5");
  });
});

describe("consultas", () => {
  const entries = [
    entry({ id: "acme/a", name: "Alpha", discountBps: 9000, tags: ["fast", "vision"] }),
    entry({ id: "acme/b", name: "Beta", discountBps: 5000, tags: ["fast"], officialOutput: 1_000_000 }),
    entry({ id: "acme/c", name: "Gamma", discountBps: 7000, tags: ["coding"], status: "hidden" }),
    entry({ id: "acme/d", name: "Delta", discountBps: 7000, tags: ["vision"], status: "retired" }),
  ];
  const models = getCatalog(entries);

  it("el catálogo muestra active y deprecated; oculta hidden y retired", () => {
    expect(models.map((m) => m.id)).toEqual(["acme/a", "acme/b"]);
    expect(getModel("acme", "c", entries)).toBeUndefined();
  });

  it("busca por nombre o ID sin importar mayúsculas", () => {
    expect(filterModels(models, { query: "ALP", tags: [], sort: "name" }).map((m) => m.id)).toEqual(["acme/a"]);
    expect(filterModels(models, { query: "acme/b", tags: [], sort: "name" }).map((m) => m.id)).toEqual(["acme/b"]);
  });

  it("los tags se combinan con Y", () => {
    expect(filterModels(models, { query: "", tags: ["fast", "vision"], sort: "name" }).map((m) => m.id)).toEqual(["acme/a"]);
    expect(filterModels(models, { query: "", tags: ["fast"], sort: "name" })).toHaveLength(2);
  });

  it("ordena por descuento, precio de output o nombre", () => {
    expect(filterModels(models, { query: "", tags: [], sort: "discount" })[0].id).toBe("acme/a");
    expect(filterModels(models, { query: "", tags: [], sort: "output" })[0].id).toBe("acme/b");
    expect(filterModels(models, { query: "", tags: [], sort: "name" }).map((m) => m.name)).toEqual(["Alpha", "Beta"]);
  });

  it("los modelos parecidos comparten tags y no incluyen al modelo", () => {
    const [alpha] = models;
    expect(similarModels(alpha, models).map((m) => m.id)).toEqual(["acme/b"]);
  });

  it("requestCost aplica la fórmula de docs/06 y redondea hacia arriba", () => {
    // El ejemplo de docs/06: 2,000 + 500 tokens con $0.30 / $1.50 por 1M = 1,350 µUSD.
    expect(requestCost(300_000, 1_500_000, 2_000, 500)).toBe(1_350);
    expect(requestCost(1, 1, 1, 0)).toBe(1);
  });
});
