/* eslint-disable @next/next/no-img-element -- Small local SVG brand marks. */
const LOGOS: Record<string, { file: string; name: string; monochrome?: boolean }> = {
  anthropic: { file: "anthropic", name: "Anthropic", monochrome: true },
  openai: { file: "openai", name: "OpenAI", monochrome: true },
  google: { file: "google-color", name: "Google" },
  deepseek: { file: "deepseek-color", name: "DeepSeek" },
  qwen: { file: "qwen-color", name: "Qwen" },
  "meta-llama": { file: "meta-color", name: "Meta" },
  "z-ai": { file: "zai", name: "Z.ai", monochrome: true },
  moonshotai: { file: "moonshot", name: "Moonshot AI", monochrome: true },
  minimax: { file: "minimax-color", name: "MiniMax" },
  "x-ai": { file: "xai", name: "xAI", monochrome: true },
  mistralai: { file: "mistral-color", name: "Mistral AI" },
  xiaomi: { file: "xiaomi-color", name: "Xiaomi" },
};

export function providerName(author: string) {
  return LOGOS[author]?.name ?? author;
}

export function ProviderLogo({ author }: { author: string }) {
  const logo = LOGOS[author];
  return logo ? <img className={logo.monochrome ? "nr-brand-monochrome" : undefined} src={`/brand/logos/${logo.file}.svg`} alt="" width={18} height={18} /> : null;
}

/** Model-family marks differ from the author's corporate mark (Claude/Anthropic). */
export function ModelLogo({ modelId }: { modelId: string }) {
  if (modelId.startsWith("moonshotai/kimi-")) return <><img className="dark:hidden" src="/brand/logos/kimi-color.svg" alt="" width={18} height={18} /><img className="hidden dark:block" src="/brand/logos/kimi-dark.svg" alt="" width={18} height={18} /></>;
  if (modelId.startsWith("meta-llama/muse-")) return <img src="/brand/logos/muse-color.svg" alt="" width={18} height={18} />;
  if (modelId.startsWith("xiaomi/mimo-")) return <img className="nr-brand-monochrome" src="/brand/logos/xiaomimimo.svg" alt="" width={18} height={18} />;
  if (modelId.startsWith("google/gemini-")) {
    return <img src="/brand/logos/gemini-color.svg" alt="" width={18} height={18} />;
  }
  if (modelId.startsWith("anthropic/claude-")) {
    return <img src="/brand/logos/claude-color.svg" alt="" width={18} height={18} />;
  }
  return <ProviderLogo author={modelId.split("/")[0]} />;
}
