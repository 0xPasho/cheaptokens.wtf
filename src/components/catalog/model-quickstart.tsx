"use client";
import Link from "next/link";
import ExternalLinkIcon from "kubai-icons-react/icons/external-link";
import { useId, useState } from "react";
import { HighlightedCode } from "@/components/code-block";
import { ModelDetailPanel } from "@/components/catalog/model-detail-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { API_BASE_URL } from "@/lib/site";
import { buildQuickstartSnippets } from "@/lib/snippets";

export function ModelQuickstart({ model, locale, dict }: { model: string; locale: Locale; dict: Dictionary }) {
  const [system, setSystem] = useState(true);
  const [copied, setCopied] = useState(false);
  const snippets = buildQuickstartSnippets({ baseUrl: API_BASE_URL, apiKey: "wtf_...", model });
  if (system) {
    snippets.javascript = snippets.javascript.replace('messages: [{ role: "user", content: "Hello!" }]', 'messages: [\n    { role: "system", content: "You are a helpful assistant." },\n    { role: "user", content: "Hello!" },\n  ]');
    snippets.python = snippets.python.replace('messages=[{"role": "user", "content": "Hello!"}]', 'messages=[\n        {"role": "system", "content": "You are a helpful assistant."},\n        {"role": "user", "content": "Hello!"},\n    ]');
    snippets.curl = snippets.curl.replace('"messages": [{"role": "user", "content": "Hello!"}]', '"messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "Hello!"}]');
  }
  const response = JSON.stringify({ id: "chatcmpl-example", object: "chat.completion", model, choices: [{ index: 0, message: { role: "assistant", content: dict.detail.previewText }, finish_reason: "stop" }] }, null, 2);
  return <ModelDetailPanel aria-label={dict.detail.quickstart}>
    <div className="nr-panel-heading"><h2>{dict.detail.quickstart}</h2><small>{dict.detail.preview}</small></div>
    <div className="nr-example-options">
      <NativeSelect value={system ? "system" : "simple"} aria-label={dict.detail.configuration} onChange={(event) => setSystem(event.target.value === "system")}>
        <NativeSelectOption value="system">{dict.detail.systemMessage}</NativeSelectOption>
        <NativeSelectOption value="simple">{dict.detail.simpleMessage}</NativeSelectOption>
      </NativeSelect>
    </div>
    <div className="nr-code-split">
      <div className="nr-code-column">
        <Tabs defaultValue="javascript">
          <TabsList className="nr-detail-tabs" aria-label={dict.detail.codeLanguage}>
            <TabsTrigger value="javascript">TypeScript</TabsTrigger><TabsTrigger value="python">Python</TabsTrigger><TabsTrigger value="curl">cURL</TabsTrigger>
          </TabsList>
          {(["javascript", "python", "curl"] as const).map((language) => <TabsContent key={language} value={language}>
            <pre className="nr-code-box" tabIndex={0}><HighlightedCode code={snippets[language]} /></pre>
            <div className="nr-code-actions">
              <Link href={`/${locale}/docs#quickstart`} className={buttonVariants({ className: "nr-detail-button nr-primary" })}>{dict.nav.getKey} <ExternalLinkIcon size={14} aria-hidden /></Link>
              <Button variant="secondary" className="nr-detail-button" onClick={async () => {
                try { await navigator.clipboard.writeText(snippets[language]); setCopied(true); setTimeout(() => setCopied(false), 1800); }
                catch { setCopied(false); }
              }}>{copied ? dict.copy.copied : dict.detail.copyCode}</Button>
            </div>
          </TabsContent>)}
        </Tabs>
        <p className="nr-code-note">{dict.detail.authNote}</p>
      </div>
      <div className="nr-code-column">
        <Tabs defaultValue="output">
          <TabsList className="nr-detail-tabs" aria-label={dict.detail.responseFormat}>
            <TabsTrigger value="output">{dict.detail.outputPreview}</TabsTrigger><TabsTrigger value="raw">{dict.detail.rawResponse}</TabsTrigger>
          </TabsList>
          <TabsContent value="output"><pre className="nr-code-box nr-response-prose" tabIndex={0}>{dict.detail.previewText}</pre></TabsContent>
          <TabsContent value="raw"><pre className="nr-code-box" tabIndex={0}><HighlightedCode code={response} /></pre></TabsContent>
        </Tabs>
        <p className="nr-output-note">{dict.detail.exampleResponse}</p>
      </div>
    </div>
  </ModelDetailPanel>;
}

export function ModelApiDetails({ model, dict, id }: { model: string; dict: Dictionary; id?: string }) {
  const generatedId = useId();
  const fields = [
    { name: "model", type: "string", required: true, body: dict.detail.modelParameter },
    { name: "messages", type: "array", required: true, body: dict.detail.messagesParameter },
    { name: "stream", type: "boolean", required: false, body: dict.detail.streamParameter },
    { name: "max_tokens", type: "integer", required: false, body: dict.detail.maxTokensParameter },
    { name: "temperature", type: "number", required: false, body: dict.detail.temperatureParameter },
  ];
  const schema = JSON.stringify({ model, messages: [{ role: "user", content: "Hello!" }], stream: false, max_tokens: 1024 }, null, 2);
  return <ModelDetailPanel id={id ?? generatedId} aria-label={dict.detail.apiDetails}>
    <div className="nr-panel-heading"><h2>{dict.detail.apiDetails}</h2><small>{dict.detail.exampleSchema}</small></div>
    <Tabs defaultValue="parameters">
      <TabsList className="nr-detail-tabs" aria-label={dict.detail.apiDetails}>
        <TabsTrigger value="parameters">{dict.detail.parameters}</TabsTrigger><TabsTrigger value="schema">{dict.detail.schema}</TabsTrigger>
      </TabsList>
      <TabsContent value="parameters">
        <div className="nr-api-switch"><span>Chat Completions</span></div>
        <div className="nr-schema-columns">
          <div className="nr-schema-column"><h3>{dict.detail.inputParameters}</h3>{fields.map((field) => <div className="nr-schema-field" key={field.name}>
            <code>{field.name} <em>{field.type}</em></code><small>{field.required ? dict.detail.required : dict.detail.optional} · {field.body}</small>
          </div>)}</div>
          <div className="nr-schema-column"><h3>{dict.detail.outputParameters}</h3>
            <div className="nr-schema-field"><code>choices <em>array</em></code><small>{dict.detail.responseParameter}</small></div>
            <div className="nr-schema-field"><code>usage <em>object</em></code><small>prompt_tokens · completion_tokens · total_tokens</small></div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="schema"><pre className="nr-code-box nr-schema-json" tabIndex={0}><HighlightedCode code={schema} /></pre></TabsContent>
    </Tabs>
  </ModelDetailPanel>;
}
