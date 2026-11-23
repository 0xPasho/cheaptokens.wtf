"use client";
import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { CodeBlock, HighlightedCode } from "@/components/code-block";
import { ModelDetailPanel } from "@/components/catalog/model-detail-panel";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getKeyHref } from "@/lib/auth/redirect";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { API_BASE_URL } from "@/lib/site";
import { buildModelQuickstartExamples, MODEL_QUICKSTART_LANGUAGES } from "@/lib/snippets";

const subscribe = () => () => {};

export function ModelQuickstart({ model, locale, dict }: { model: string; locale: Locale; dict: Dictionary }) {
  const libraryId = useId();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [openai, setOpenai] = useState({ javascript: false, python: false });
  const d = dict.detail;
  const examples = buildModelQuickstartExamples({ baseUrl: API_BASE_URL, model });
  const copy = { copyLabel: d.copyCode, copiedLabel: dict.copy.copied };

  return (
    <ModelDetailPanel className="nr-quickstart" aria-label={d.quickstart}>
      <div className="nr-quickstart-heading">
        <h2>{d.quickstart}</h2>
        <p>{d.quickstartIntro}</p>
      </div>
      <Tabs defaultValue="javascript">
        <TabsList className="nr-detail-tabs nr-quickstart-tabs" aria-label={d.codeLanguage}>
          {MODEL_QUICKSTART_LANGUAGES.map((language) => (
            <TabsTrigger key={language} value={language}>
              <span>{examples[language].label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {MODEL_QUICKSTART_LANGUAGES.map((language) => {
          const exampleKey = language !== "curl" && openai[language] ? `${language}-openai` as const : language;
          const example = examples[exampleKey];
          return (
            <TabsContent key={language} value={language}>
              {language !== "curl" ? (
                <div className="nr-quickstart-library">
                  <label htmlFor={`${libraryId}-${language}`}>{d.library}</label>
                  <NativeSelect
                    disabled={!ready}
                    id={`${libraryId}-${language}`}
                    value={openai[language] ? "openai" : "default"}
                    onChange={(event) => {
                      const useOpenai = event.target.value === "openai";
                      setOpenai((previous) => ({ ...previous, [language]: useOpenai }));
                    }}
                  >
                    <NativeSelectOption value="default">{examples[language].library}</NativeSelectOption>
                    <NativeSelectOption value="openai">OpenAI SDK</NativeSelectOption>
                  </NativeSelect>
                </div>
              ) : null}
              <ol className="nr-quickstart-steps">
                <li>
                  <div className="nr-quickstart-step-heading">
                    <h3>{d.configureKey}</h3>
                    <Link href={getKeyHref(locale)} className={buttonVariants({ variant: "secondary", size: "sm", className: "nr-detail-button" })}>
                      {dict.nav.getKey}
                    </Link>
                  </div>
                  <p>{d.keyInstructions}</p>
                  <CodeBlock code={'export CHEAPLLM_API_KEY="wtf_..."'} {...copy} />
                </li>
                {example.install ? (
                  <li>
                    <h3>{d.installPackage}</h3>
                    <CodeBlock key={exampleKey} code={example.install} {...copy} />
                  </li>
                ) : null}
                <li>
                  <h3>{d.sendRequest}</h3>
                  {example.filename ? <p>{d.saveAs} <code>{example.filename}</code></p> : null}
                  <CodeBlock key={exampleKey} code={example.code} label={example.filename ?? "cURL"} {...copy} />
                  {example.run ? <p className="nr-quickstart-run">{d.runCommand} <code>{example.run}</code></p> : null}
                </li>
              </ol>
              <p className="nr-quickstart-note">{d.serverOnly}</p>
            </TabsContent>
          );
        })}
      </Tabs>
      <div className="nr-quickstart-footer">
        <p>{d.quickstartResult}</p>
        <Link href={`/${locale}/docs#quickstart`}>{d.integrationDocs}</Link>
      </div>
    </ModelDetailPanel>
  );
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
