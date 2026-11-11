import { CheckIcon, CircleDashedIcon, ServerIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { Container } from "@/components/container";
import { RichText } from "@/components/docs/rich-text";
import { SnippetTabs } from "@/components/docs/snippet-tabs";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCatalog } from "@/lib/catalog/queries";
import { formatCount, formatUsd } from "@/lib/format";
import { errorBody, streamErrorChunk } from "@/lib/gateway/errors";
import { MIN_CHARGE_MICRO_USD } from "@/lib/gateway/metering";
import { buildUsageChunk, sanitizeChunk } from "@/lib/gateway/sanitize";
import { encodeSseData, SSE_DONE, SSE_KEEP_ALIVE } from "@/lib/gateway/sse";
import { GATEWAY_ERROR_STATUS, type GatewayErrorCode, type ResponseContext } from "@/lib/gateway/types";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { API_BASE_URL } from "@/lib/site";
import { buildStreamingSnippets } from "@/lib/snippets";

/** El modelo de los ejemplos, el mismo de docs/04. Si sale del catálogo, se usa el primero. */
const EXAMPLE_MODEL_ID = "anthropic/claude-haiku-4.5";
/** Requests por minuto por workspace (docs/04 › Rate limits, ADR-0017). */
const RATE_LIMIT_RPM = 60;
/** Tope del body antes del `413` (docs/04 › Errores). */
const MAX_BODY_MB = 4.5;
/** `id` y `created` fijos: los ejemplos no cambian entre builds, y las capturas tampoco. */
const EXAMPLE_CONTEXT = { id: "chatcmpl-req_...", created: 1_794_268_800 };

const ERROR_CODES = Object.keys(GATEWAY_ERROR_STATUS) as GatewayErrorCode[];

// Neutros a propósito: success es solo dinero a favor del usuario (docs/13 › Color).
const SUPPORT_ICONS = { yes: CheckIcon, untested: CircleDashedIcon, no: XIcon };

type ToolKey = keyof Dictionary["docs"]["tools"]["rows"];
/** El estado de cada herramienta (docs/04 › Compatibilidad). El texto está en el diccionario. */
const TOOLS: { key: ToolKey; support: keyof typeof SUPPORT_ICONS }[] = [
  { key: "openaiSdk", support: "yes" },
  { key: "langchain", support: "yes" },
  { key: "vercelAiSdk", support: "yes" },
  { key: "editors", support: "untested" },
  { key: "claudeCode", support: "no" },
];

/**
 * Los ejemplos de SSE salen de las mismas funciones que arman la respuesta real del gateway:
 * así la página no se desfasa de lo que manda la API.
 */
function streamExamples(model: string) {
  const ctx: ResponseContext = { ...EXAMPLE_CONTEXT, model };
  const chunk = (delta: Record<string, string>, finishReason: string | null = null) =>
    encodeSseData(sanitizeChunk({ choices: [{ index: 0, delta, finish_reason: finishReason }] }, ctx));
  const usage = buildUsageChunk(
    { promptTokens: 9, completionTokens: 3, cachedTokens: null, reasoningTokens: null, upstreamCostMicroUsd: null, estimated: false },
    ctx,
  );
  const events = (...lines: string[]) => lines.join("").trimEnd();

  return {
    stream: events(
      chunk({ role: "assistant", content: "Hel" }),
      SSE_KEEP_ALIVE,
      chunk({ content: "lo!" }, "stop"),
      encodeSseData(usage),
      SSE_DONE,
    ),
    error: events(chunk({ role: "assistant", content: "Hel" }), encodeSseData(streamErrorChunk(ctx)), SSE_DONE),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.docs.title, description: dict.docs.metaDescription };
}

/** Docs públicas: conectar en un minuto (docs/02 › Docs). El contenido sale de docs/04. */
export default async function DocsPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const d = dict.docs;
  const copy = { copyLabel: dict.copy.copy, copiedLabel: dict.copy.copied };
  const catalog = getCatalog();
  const model = (catalog.find((entry) => entry.id === EXAMPLE_MODEL_ID) ?? catalog[0])?.id ?? EXAMPLE_MODEL_ID;
  const examples = streamExamples(model);
  // formatUsd recibe number; 10 µUSD caben exactos, y es solo para mostrarlo.
  const minimum = formatUsd(Number(MIN_CHARGE_MICRO_USD), locale, "cost");

  return (
    <Container size="prose" className="flex flex-col gap-10 pt-12 text-base sm:pt-16">
      <PageHeader title={d.title} description={d.description} />

      <DocsSection id="authentication" title={d.auth.title}>
        <Paragraph text={d.auth.baseUrl} />
        <CodeBlock code={API_BASE_URL} {...copy} />
        <Paragraph text={d.auth.header} />
        <CodeBlock code="Authorization: Bearer wtf_..." {...copy} />
        {/* Es una nota fija, no un aviso: role="note" para que no se anuncie al cargar. */}
        <Alert role="note">
          <ServerIcon aria-hidden />
          <AlertTitle>{d.auth.serverTitle}</AlertTitle>
          <AlertDescription>{d.auth.serverBody}</AlertDescription>
        </Alert>
      </DocsSection>

      <DocsSection id="quickstart" title={d.quickstart.title}>
        <Paragraph text={d.quickstart.body} />
        <QuickstartSnippet baseUrl={API_BASE_URL} apiKey="wtf_..." model={model} {...copy} />
      </DocsSection>

      <DocsSection id="streaming" title={d.streaming.title}>
        <Paragraph text={d.streaming.body} />
        <SnippetTabs snippets={buildStreamingSnippets({ baseUrl: API_BASE_URL, apiKey: "wtf_...", model })} {...copy} />
        <SubHeading>{d.streaming.wireTitle}</SubHeading>
        <Paragraph text={d.streaming.wireBody} />
        <CodeBlock code={examples.stream} {...copy} />
        <Paragraph text={d.streaming.keepAlive} />
        <SubHeading>{d.streaming.errorTitle}</SubHeading>
        <Paragraph text={d.streaming.errorBody} />
        <CodeBlock code={examples.error} {...copy} />
        <SubHeading>{d.streaming.reasoningTitle}</SubHeading>
        <Paragraph text={d.streaming.reasoningBody} />
      </DocsSection>

      <DocsSection
        id="models"
        title={d.models.title}
        actions={
          <Link href={`/${locale}/models`} className={buttonVariants({ variant: "outline" })}>
            {d.models.browse}
          </Link>
        }
      >
        <Paragraph text={t(d.models.body, { model })} />
        <Paragraph text={d.models.list} />
        <CodeBlock code={`curl ${API_BASE_URL}/models`} {...copy} />
      </DocsSection>

      <DocsSection id="billing" title={d.billing.title}>
        <Paragraph text={d.billing.body} />
        <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
          {[
            d.billing.tokens,
            d.billing.reasoning,
            t(d.billing.minimum, { amount: minimum }),
            d.billing.cancel,
            d.billing.cached,
          ].map((text) => (
            <li key={text} className="text-pretty">
              <RichText text={text} />
            </li>
          ))}
        </ul>
      </DocsSection>

      <DocsSection id="errors" title={d.errors.title}>
        <Paragraph text={d.errors.body} />
        <CodeBlock code={JSON.stringify(errorBody("insufficient_credits"), null, 2)} {...copy} />
        <Table regionLabel={d.errors.tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead>HTTP</TableHead>
              <TableHead>
                <code className="font-mono text-xs">code</code>
              </TableHead>
              <TableHead>{d.errors.when}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ERROR_CODES.map((code) => (
              <TableRow key={code}>
                <TableCell className="align-top tabular-nums">{GATEWAY_ERROR_STATUS[code]}</TableCell>
                <TableCell className="align-top">
                  <code className="font-mono text-xs">{code}</code>
                </TableCell>
                <TableCell className="min-w-40 align-top whitespace-normal text-pretty">
                  <RichText text={t(d.errors.codes[code], { size: formatCount(MAX_BODY_MB, locale) })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Paragraph text={d.errors.requestId} />
      </DocsSection>

      <DocsSection id="rate-limit" title={d.rateLimit.title}>
        <Paragraph text={t(d.rateLimit.body, { count: formatCount(RATE_LIMIT_RPM, locale) })} />
      </DocsSection>

      <DocsSection id="tools" title={d.tools.title}>
        <Paragraph text={d.tools.body} />
        <Table regionLabel={d.tools.tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead>{d.tools.tool}</TableHead>
              <TableHead>{d.tools.status}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TOOLS.map(({ key, support }) => {
              const Icon = SUPPORT_ICONS[support];
              return (
                <TableRow key={key}>
                  <TableCell className="min-w-40 align-top font-medium whitespace-normal">
                    <RichText text={d.tools.rows[key].name} />
                  </TableCell>
                  <TableCell className="min-w-40 align-top whitespace-normal text-pretty">
                    <span className="flex gap-2">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>
                        <RichText text={d.tools.rows[key].status} />
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DocsSection>
    </Container>
  );
}

/** Una sección con su `h2`. El `id` deja enlazar directo (`/docs#errors`); scroll-mt libra el header fijo. */
function DocsSection({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <SectionHeader title={title} actions={actions} />
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-2 font-heading text-base font-medium">{children}</h3>;
}

function Paragraph({ text }: { text: string }) {
  return (
    <p className="text-pretty">
      <RichText text={text} />
    </p>
  );
}
