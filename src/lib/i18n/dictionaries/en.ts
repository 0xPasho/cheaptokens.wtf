/** Diccionario base. `es` tiene que tener exactamente las mismas claves (lo obliga el tipo). */
export const en = {
  meta: {
    siteName: "cheaptokens.wtf",
    homeTitle: "cheaptokens.wtf · One endpoint. Every model. Up to 90% off.",
    homeDescription:
      "Use Claude, GPT, Gemini and open models through one OpenAI-compatible endpoint, for much less than the official price.",
    modelsTitle: "Models and prices",
    modelsDescription: "Every model with its official price, the cheaptokens.wtf price and the discount.",
  },
  nav: {
    label: "Main",
    home: "cheaptokens.wtf home",
    models: "Models",
    howItWorks: "How it works",
    getKey: "Get your API key",
  },
  theme: { trigger: "Theme", light: "Light", dark: "Dark", system: "System" },
  copy: { copy: "Copy", copied: "Copied" },
  language: { label: "Language", en: "English", es: "Español" },
  hero: {
    title: "One endpoint. Every model.",
    emphasis: "Up to 90% off.",
    subtitle:
      "Change your base URL and API key. Keep the OpenAI SDK, LangChain or anything that already speaks the OpenAI API.",
    primary: "Get your API key",
    secondary: "Browse models",
    snippetCaption: "Only these two lines change.",
  },
  steps: {
    title: "Your first request in three steps",
    items: [
      { title: "Top up", body: "Add credits once and use them with every model. No subscription." },
      { title: "Create a key", body: "One API key for every model. You see it once; we only keep its hash." },
      { title: "Paste the snippet", body: "Point your SDK at cheaptokens.wtf and pick a model by its ID." },
    ],
  },
  preview: {
    title: "Same models, a fraction of the price",
    description: "Official price struck through, cheaptokens.wtf price next to it. Per 1M tokens.",
    viewAll: "See all {count} models",
  },
  stats: {
    discount: "off the official price",
    endpoint: "base URL for every model",
    models: "models in the catalog",
  },
  finalCta: {
    title: "Stop paying the official price.",
    body: "Top up, create a key and make your first request in under three minutes.",
  },
  footer: {
    tagline: "One endpoint for every model, for less.",
    sample: "Sample catalog: models and prices are illustrative until launch.",
  },
  catalog: {
    title: "Models and prices",
    description: "{count} models. Prices per 1M tokens, with the official price struck through.",
    searchLabel: "Search models",
    searchPlaceholder: "Search by name or author",
    filterLabel: "Filter by capability",
    sortLabel: "Sort by",
    sort: { discount: "Biggest discount", output: "Output price", name: "Name" },
    columns: {
      model: "Model",
      context: "Context",
      input: "Input / 1M",
      output: "Output / 1M",
      discount: "Discount",
    },
    resultsOne: "{count} model",
    resultsOther: "{count} models",
    emptyTitle: "No models match",
    emptyBody: "Try fewer filters or a different search.",
    clear: "Clear filters",
    retires: "Retires {date}",
    official: "Official price",
    discounted: "cheaptokens.wtf price",
    perToken: "{price} per token",
    tableLabel: "Models",
  },
  detail: {
    back: "Models",
    pricing: "Price",
    input: "Input",
    output: "Output",
    perMillion: "per 1M tokens",
    verifiedOn: "Official price verified on {date}.",
    unverified: "Sample price, not verified yet.",
    source: "Official pricing",
    costTitle: "What a request costs",
    costBody: "A typical request: {input} input tokens and {output} output tokens.",
    discountedCost: "With cheaptokens.wtf",
    officialCost: "Official price",
    savings: "You save",
    useTitle: "Use it",
    useBody: "Already has this model's ID. Paste it and run it.",
    specs: "Details",
    context: "Context window",
    contextValue: "{tokens} tokens",
    status: "Status",
    statusActive: "Available",
    statusDeprecated: "Deprecated, retires {date}",
    capabilities: "Capabilities",
    similar: "Similar models",
    notFoundTitle: "We don't have that model",
    notFoundBody: "It may have been retired, or the ID is wrong.",
  },
  tags: {
    fast: "Fast",
    reasoning: "Reasoning",
    coding: "Coding",
    vision: "Vision",
    tools: "Tools",
    "open-weights": "Open weights",
    "long-context": "Long context",
    cheap: "Budget",
  },
};

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof en>;
