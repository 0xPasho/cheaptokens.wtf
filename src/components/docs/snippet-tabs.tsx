import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SNIPPET_LANGUAGE_LABELS, SNIPPET_LANGUAGES, type SnippetLanguage } from "@/lib/snippets";

/**
 * Las mismas pestañas de `QuickstartSnippet`, pero con cualquier juego de snippets: /docs
 * también muestra el de streaming.
 */
export function SnippetTabs({
  snippets,
  defaultLanguage = "python",
  copyLabel,
  copiedLabel,
}: {
  snippets: Record<SnippetLanguage, string>;
  defaultLanguage?: SnippetLanguage;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <Tabs defaultValue={defaultLanguage}>
      <TabsList className="nr-detail-tabs">
        {SNIPPET_LANGUAGES.map((language) => (
          <TabsTrigger key={language} value={language}>
            {SNIPPET_LANGUAGE_LABELS[language]}
          </TabsTrigger>
        ))}
      </TabsList>
      {SNIPPET_LANGUAGES.map((language) => (
        <TabsContent key={language} value={language}>
          <CodeBlock code={snippets[language]} copyLabel={copyLabel} copiedLabel={copiedLabel} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
