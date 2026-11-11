/**
 * Snippets de conexión. Son el mismo contenido en la landing, el checklist del
 * dashboard, el modal de "key creada" y /docs, así que salen de un solo lugar.
 */

export const SNIPPET_LANGUAGES = ["python", "javascript", "curl"] as const;
export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

export const SNIPPET_LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
  curl: "curl",
};

type QuickstartOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export function buildQuickstartSnippets({
  baseUrl,
  apiKey,
  model,
}: QuickstartOptions): Record<SnippetLanguage, string> {
  return {
    python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,

    javascript: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const response = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`,

    curl: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello!"}]}'`,
  };
}
