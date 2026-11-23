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

/**
 * El mismo request con streaming, para /docs. Pide `include_usage`: sin eso, el gateway no
 * reenvía el chunk de uso (docs/04 › Parámetros). Ese último chunk llega con `choices` vacío,
 * por eso el código revisa `choices` antes de leer el texto.
 */
export function buildStreamingSnippets({
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

stream = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
    stream_options={"include_usage": True},
)
for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="", flush=True)
    if chunk.usage:
        print("\\n", chunk.usage)`,

    javascript: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const stream = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  if (chunk.usage) console.log("\\n", chunk.usage);
}`,

    curl: `curl -N ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello!"}], "stream": true, "stream_options": {"include_usage": true}}'`,
  };
}


/** Ejemplos de inicio desde cero para el detalle; los snippets de migración siguen arriba. */
export const MODEL_QUICKSTART_LANGUAGES = ["javascript", "python", "curl"] as const;

export type ModelQuickstartVariant = SnippetLanguage | "javascript-openai" | "python-openai";

type ModelQuickstartExample = {
  label: string;
  library: string;
  install: string | null;
  filename: string | null;
  run: string | null;
  code: string;
};

export function buildModelQuickstartExamples({ baseUrl, model }: Omit<QuickstartOptions, "apiKey">): Record<ModelQuickstartVariant, ModelQuickstartExample> {
  // Serializar los valores conserva IDs y URLs incluso si contienen comillas.
  const url = JSON.stringify(baseUrl);
  const modelId = JSON.stringify(model);
  return {
    javascript: {
      label: "JavaScript",
      library: "AI SDK",
      install: "npm install ai @ai-sdk/openai-compatible",
      filename: "example.mjs",
      run: "node example.mjs",
      code: `import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const cheapllm = createOpenAICompatible({
  name: "cheapllm",
  baseURL: ${url},
  apiKey: process.env.CHEAPLLM_API_KEY,
});

const { text } = await generateText({
  model: cheapllm(${modelId}),
  prompt: "Hello!",
});

console.log(text);`,
    },
    "javascript-openai": {
      label: "JavaScript",
      library: "OpenAI SDK",
      install: "npm install openai",
      filename: "example.mjs",
      run: "node example.mjs",
      code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: ${url},
  apiKey: process.env.CHEAPLLM_API_KEY,
});

const response = await client.chat.completions.create({
  model: ${modelId},
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);`,
    },
    python: {
      label: "Python",
      library: "LangChain",
      install: "python3 -m pip install langchain-openai",
      filename: "example.py",
      run: "python3 example.py",
      code: `import os
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model=${modelId},
    base_url=${url},
    api_key=os.environ["CHEAPLLM_API_KEY"],
    use_responses_api=False,
)

response = model.invoke("Hello!")
print(response.content)`,
    },
    "python-openai": {
      label: "Python",
      library: "OpenAI SDK",
      install: "python3 -m pip install openai",
      filename: "example.py",
      run: "python3 example.py",
      code: `import os
from openai import OpenAI

client = OpenAI(
    base_url=${url},
    api_key=os.environ["CHEAPLLM_API_KEY"],
)

response = client.chat.completions.create(
    model=${modelId},
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`,
    },
    curl: {
      label: "cURL",
      library: "HTTP",
      install: null,
      filename: null,
      run: null,
      code: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $CHEAPLLM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": ${modelId},
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
    },
  };
}
