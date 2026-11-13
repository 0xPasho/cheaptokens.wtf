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
  className,
}: QuickstartSnippetProps) {
  const snippets = buildQuickstartSnippets({ baseUrl, apiKey, model });

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
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
