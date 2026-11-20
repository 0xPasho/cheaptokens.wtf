import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildQuickstartSnippets,
  SNIPPET_LANGUAGE_LABELS,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
} from "@/lib/snippets";

type QuickstartSnippetProps = {
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultLanguage?: SnippetLanguage;
  copyLabel?: string;
  copiedLabel?: string;
  /** Resalta las líneas con la base URL y la API key: lo único que cambia en código que ya usa OpenAI. */
  highlightConnection?: boolean;
  className?: string;
};

/** El snippet de conexión en Python, JavaScript y curl, con pestañas. */
export function QuickstartSnippet({
  baseUrl,
  apiKey,
  model,
  defaultLanguage = "python",
  copyLabel,
  copiedLabel,
  highlightConnection = false,
  className,
}: QuickstartSnippetProps) {
  const snippets = buildQuickstartSnippets({ baseUrl, apiKey, model });
  const highlight = highlightConnection ? [baseUrl, apiKey] : undefined;

  return (
    <Tabs defaultValue={defaultLanguage} className={className}>
      <TabsList className="nr-detail-tabs">
        {SNIPPET_LANGUAGES.map((language) => (
          <TabsTrigger key={language} value={language}>
            {SNIPPET_LANGUAGE_LABELS[language]}
          </TabsTrigger>
        ))}
      </TabsList>
      {SNIPPET_LANGUAGES.map((language) => (
        <TabsContent key={language} value={language}>
          <CodeBlock
            code={snippets[language]}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            highlight={highlight}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
