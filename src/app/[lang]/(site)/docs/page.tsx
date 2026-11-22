import CheckIcon from "kubai-icons-react/icons/circle-check";
import CircleDashedIcon from "kubai-icons-react/icons/circle";
import ServerIcon from "kubai-icons-react/icons/server";
import XIcon from "kubai-icons-react/icons/circle-x";
import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { Container } from "@/components/container";
import { CopyButton } from "@/components/copy-button";
import { RichText } from "@/components/docs/rich-text";
import { SnippetTabs } from "@/components/docs/snippet-tabs";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getKeyHref } from "@/lib/auth/redirect";
import type { BillingSource } from "@/lib/billing/limits";
import { PLAN_IDS, PLANS } from "@/lib/billing/plans";
import { getLiveCatalog } from "@/lib/catalog/live";
import { formatCount, formatUsd } from "@/lib/format";
import { errorBody, streamErrorChunk } from "@/lib/gateway/errors";
import { MIN_CHARGE_MICRO_USD } from "@/lib/gateway/metering";
import { DEFAULT_MAX_OUTPUT_TOKENS, MIN_OUTPUT_TOKENS } from "@/lib/gateway/request-cost";
import { buildUsageChunk, sanitizeChunk } from "@/lib/gateway/sanitize";
import { encodeSseData, SSE_DONE, SSE_KEEP_ALIVE } from "@/lib/gateway/sse";
import { GATEWAY_ERROR_STATUS, type GatewayErrorCode, type ResponseContext } from "@/lib/gateway/types";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { DEFAULT_RATE_LIMIT_RPM } from "@/lib/marketing";
import { API_BASE_URL } from "@/lib/site";
import { buildStreamingSnippets } from "@/lib/snippets";

/** El modelo de los ejemplos, el mismo de docs/04. Si sale del catálogo, se usa el primero. */
const EXAMPLE_MODEL_ID = "anthropic/claude-haiku-4.5";
/** Tope del body antes del `413` (docs/04 › Errores). */
const MAX_BODY_MB = 4.5;
/** `id` y `created` fijos: los ejemplos no cambian entre builds, y las capturas tampoco. */
const EXAMPLE_CONTEXT = { id: "chatcmpl-req_...", created: 1_794_268_800 };

type Docs = Dictionary["docs"];

/**
 * Las secciones, en tres bloques (ADR-0068): empezar, usar y consultar. El índice lateral y el
 * orden de la página salen de aquí.
 */
const SECTIONS = {
  start: ["setup", "quickstart"],
  use: ["models", "features", "streaming", "billing", "keys", "rate-limit"],
  reference: ["troubleshooting", "errors", "stream-format"],
} as const satisfies Record<keyof Docs["groups"], readonly string[]>;

type SectionId = (typeof SECTIONS)[keyof typeof SECTIONS][number];

function sectionTitles(d: Docs): Record<SectionId, string> {
  return {
    setup: d.setup.title,
    quickstart: d.quickstart.title,
    models: d.models.title,
    features: d.features.title,
    streaming: d.streaming.title,
    billing: d.billing.title,
    keys: d.keys.title,
    "rate-limit": d.rateLimit.title,
    troubleshooting: d.troubleshooting.title,
    errors: d.errors.title,
    "stream-format": d.streamFormat.title,
  };
}

/** Cada código de error en su grupo. Un `Record` obliga a ubicar cualquier código nuevo. */
const ERROR_GROUP: Record<GatewayErrorCode, keyof Docs["errors"]["groups"]> = {
  invalid_request: "request",
  request_too_large: "request",
  invalid_api_key: "key",
  key_limit_exceeded: "key",
  model_not_allowed_for_key: "key",
  account_suspended: "key",
  insufficient_credits: "money",
  no_active_plan: "money",
  usage_limit_reached: "money",
  rate_limit_exceeded: "money",
  model_not_found: "model",
  model_retired: "model",
  upstream_error: "upstream",
  no_upstream_available: "upstream",
  upstream_timeout: "upstream",
};
const ERROR_GROUPS = ["request", "key", "money", "model", "upstream"] as const satisfies readonly (keyof Docs["errors"]["groups"])[];
const ERROR_CODES = Object.keys(GATEWAY_ERROR_STATUS) as GatewayErrorCode[];

/** Los headers del plan que manda el gateway (`src/lib/billing/headers.ts`). */
const USAGE_HEADERS = [
  ["x-usage-window-remaining", "windowRemaining"],
  ["x-usage-week-remaining", "weekRemaining"],
  ["x-usage-window-reset", "windowReset"],
  ["x-usage-week-reset", "weekReset"],
] as const satisfies readonly (readonly [string, keyof Docs["billing"]["headers"]])[];

/** Las fuentes de cobro de una key, en el orden del diálogo de crear key (docs/05). */
const BILLING_SOURCES = ["plan_then_prepaid", "plan_only", "prepaid_only"] as const satisfies readonly BillingSource[];
const DEFAULT_BILLING_SOURCE: BillingSource = "plan_then_prepaid";

const FEATURES = ["streaming", "tools", "structured", "vision", "reasoning", "params"] as const satisfies readonly (keyof Docs["features"]["rows"])[];
const TROUBLESHOOTING = ["cut", "modelNotFound", "usageLimit", "noCredits", "cors"] as const satisfies readonly (keyof Docs["troubleshooting"]["items"])[];

// Neutros a propósito: success es solo dinero a favor del usuario (docs/13 › Color).
const SUPPORT_ICONS = { yes: CheckIcon, untested: CircleDashedIcon, no: XIcon };
/** El estado de cada herramienta (docs/04 › Compatibilidad). El texto está en el diccionario. */
const TOOLS: { key: keyof Docs["features"]["toolRows"]; support: keyof typeof SUPPORT_ICONS }[] = [
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

/**
 * Docs públicas (ADR-0068): un solo endpoint con el formato de OpenAI. Arriba lo que hace falta
 * para el primer request; después cómo se usa y cuánto cuesta; al final, la referencia.
 * El contenido sale de docs/04, docs/05 y docs/08, y las cifras, del código que las aplica.
 */
export default async function DocsPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const d = dict.docs;
  const copy = { copyLabel: dict.copy.copy, copiedLabel: dict.copy.copied };
  const catalog = await getLiveCatalog();
  const model = (catalog.find((entry) => entry.id === EXAMPLE_MODEL_ID) ?? catalog[0])?.id ?? EXAMPLE_MODEL_ID;
  const examples = streamExamples(model);
  // formatUsd recibe number; 10 µUSD caben exactos, y es solo para mostrarlo.
  const minimum = formatUsd(Number(MIN_CHARGE_MICRO_USD), locale, "cost");
  const maxTokens = formatCount(DEFAULT_MAX_OUTPUT_TOKENS, locale);
  const minTokens = formatCount(MIN_OUTPUT_TOKENS, locale);
  const titles = sectionTitles(d);
  const endpoint = `${API_BASE_URL}/chat/completions`;

  return (
    <Container className="nr-docs">
      <div className="nr-docs-layout">
        <nav className="nr-docs-nav" aria-label={d.navLabel}>
          {(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map((group) => (
            <div key={group}>
              <p id={`docs-nav-${group}`}>{d.groups[group]}</p>
              <ul aria-labelledby={`docs-nav-${group}`}>
                {SECTIONS[group].map((id) => (
                  <li key={id}>
                    <a href={`#${id}`}>{titles[id]}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-12 text-base">
          <div className="flex flex-col gap-6">
            <PageHeader title={d.title} description={d.description} />
            {/* Lo que cambia frente a OpenAI, de un vistazo: con esto basta si ya usas su SDK. */}
            <dl className="nr-docs-glance">
              <div>
                <dt>{d.glance.baseUrl}</dt>
                <dd>
                  <code>{API_BASE_URL}</code>
                  <CopyButton value={API_BASE_URL} {...copy} />
                </dd>
              </div>
              <div>
                <dt>{d.glance.endpoint}</dt>
                <dd>
                  <code>POST /v1/chat/completions</code>
                  <CopyButton value={endpoint} {...copy} />
                </dd>
              </div>
              <div>
                <dt>{d.glance.auth}</dt>
                <dd>
                  <code>Authorization: Bearer wtf_...</code>
                </dd>
              </div>
              <div>
                <dt>{d.glance.format}</dt>
                <dd>{d.glance.formatValue}</dd>
              </div>
              <div>
                <dt>{d.glance.models}</dt>
                <dd>
                  <span>
                    <RichText text={d.glance.modelsValue} />
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <DocsSection id="setup" title={titles.setup}>
            <ol className="nr-docs-steps">
              {(
                [
                  ["account", `/${locale}/sign-up`],
                  ["fund", `/${locale}/pricing`],
                  ["key", getKeyHref(locale)],
                ] as const
              ).map(([step, href]) => (
                <li key={step}>
                  <p className="font-medium">{d.setup.steps[step].title}</p>
                  <p className="text-pretty text-muted-foreground">
                    <RichText text={d.setup.steps[step].body} />{" "}
                    <Link href={href} className="nr-documentation-link text-foreground">
                      {d.setup.steps[step].link}
                    </Link>
                  </p>
                </li>
              ))}
            </ol>
            {/* Es una nota fija, no un aviso: role="note" para que no se anuncie al cargar. */}
            <Alert role="note">
              <ServerIcon aria-hidden />
              <AlertTitle>{d.setup.serverTitle}</AlertTitle>
              <AlertDescription>{d.setup.serverBody}</AlertDescription>
            </Alert>
          </DocsSection>

          <DocsSection id="quickstart" title={titles.quickstart}>
            <Paragraph text={d.quickstart.body} />
            <QuickstartSnippet baseUrl={API_BASE_URL} apiKey="wtf_..." model={model} {...copy} />
            <Alert role="note">
              <AlertTitle>
                <RichText text={d.quickstart.maxTokensTitle} />
              </AlertTitle>
              <AlertDescription>
                <RichText text={t(d.quickstart.maxTokensBody, { tokens: maxTokens })} />
              </AlertDescription>
            </Alert>
          </DocsSection>

          <DocsSection
            id="models"
            title={titles.models}
            actions={
              <Link href={`/${locale}/models`} className={buttonVariants({ variant: "outline" })}>
                {d.models.browse}
              </Link>
            }
          >
            <Paragraph text={t(d.models.body, { model })} />
            <Paragraph text={d.models.list} />
            <Paragraph text={d.models.tags} />
          </DocsSection>

          <DocsSection id="features" title={titles.features}>
            <Paragraph text={d.features.body} />
            <Table regionLabel={d.features.tableLabel}>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.features.feature}</TableHead>
                  <TableHead>{d.features.how}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FEATURES.map((key) => (
                  <TableRow key={key}>
                    <TableCell className="align-top font-medium whitespace-nowrap">{d.features.rows[key].name}</TableCell>
                    <TableCell className="min-w-56 align-top whitespace-normal text-pretty">
                      <RichText text={d.features.rows[key].how} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <SubHeading>{d.features.notYetTitle}</SubHeading>
            <Paragraph text={d.features.notYet} />
            <SubHeading>{d.features.toolsTitle}</SubHeading>
            <Paragraph text={d.features.toolsBody} />
            <Table regionLabel={d.features.toolsTableLabel}>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.features.tool}</TableHead>
                  <TableHead>{d.features.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOOLS.map(({ key, support }) => {
                  const Icon = SUPPORT_ICONS[support];
                  return (
                    <TableRow key={key}>
                      <TableCell className="min-w-40 align-top font-medium whitespace-normal">
                        <RichText text={d.features.toolRows[key].name} />
                      </TableCell>
                      <TableCell className="min-w-40 align-top whitespace-normal text-pretty">
                        <span className="flex gap-2">
                          <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span>
                            <RichText text={d.features.toolRows[key].status} />
                          </span>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </DocsSection>

          <DocsSection id="streaming" title={titles.streaming}>
            <Paragraph text={d.streaming.body} />
            <SnippetTabs snippets={buildStreamingSnippets({ baseUrl: API_BASE_URL, apiKey: "wtf_...", model })} {...copy} />
            <TextWithLink
              text={d.streaming.formatLink}
              slot="link"
              link={<a href="#stream-format" className="nr-documentation-link">{titles["stream-format"]}</a>}
            />
          </DocsSection>

          <DocsSection id="billing" title={titles.billing}>
            <TextWithLink
              text={d.billing.body}
              slot="pricing"
              link={<Link href={`/${locale}/pricing`} className="nr-documentation-link">{d.billing.pricingLink}</Link>}
            />
            <BulletList
              items={[
                d.billing.cap,
                d.billing.tokens,
                d.billing.cached,
                t(d.billing.minimum, { amount: minimum }),
                t(d.billing.reserve, { tokens: minTokens }),
                d.billing.cancel,
                d.billing.failed,
              ]}
            />
            <SubHeading>{d.billing.headersTitle}</SubHeading>
            <Paragraph text={d.billing.headersBody} />
            <Table regionLabel={d.billing.headersTableLabel}>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.billing.header}</TableHead>
                  <TableHead>{d.billing.value}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {USAGE_HEADERS.map(([header, key]) => (
                  <TableRow key={header}>
                    <TableCell className="align-top">
                      <code className="font-mono text-xs">{header}</code>
                    </TableCell>
                    <TableCell className="min-w-48 align-top whitespace-normal text-pretty">
                      <RichText text={d.billing.headers[key]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DocsSection>

          <DocsSection id="keys" title={titles.keys}>
            <Paragraph text={d.keys.body} />
            <SubHeading>{d.keys.sourceTitle}</SubHeading>
            <Table regionLabel={d.keys.sourceTableLabel}>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.keys.option}</TableHead>
                  <TableHead>{d.keys.what}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BILLING_SOURCES.map((source) => (
                  <TableRow key={source}>
                    <TableCell className="align-top font-medium whitespace-nowrap">
                      {dict.dashboard.sources[source]}
                      {source === DEFAULT_BILLING_SOURCE ? (
                        <span className="font-normal text-muted-foreground"> ({d.keys.defaultSource})</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-48 align-top whitespace-normal text-pretty">
                      {dict.dashboard.sourceDescriptions[source]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <BulletList items={[d.keys.limit, d.keys.models, d.keys.fixed, d.keys.rotate, d.keys.revoke]} />
          </DocsSection>

          <DocsSection id="rate-limit" title={titles["rate-limit"]}>
            <Paragraph text={d.rateLimit.body} />
            <Table regionLabel={d.rateLimit.tableLabel}>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.rateLimit.plan}</TableHead>
                  <TableHead className="text-right">{d.rateLimit.rpm}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { key: "none", name: d.rateLimit.noPlan, rpm: DEFAULT_RATE_LIMIT_RPM },
                  ...PLAN_IDS.map((id) => ({ key: id, name: dict.dashboard.plans[id].name, rpm: PLANS[id].rateLimitRpm })),
                ].map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(row.rpm, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Paragraph text={d.rateLimit.exceeded} />
          </DocsSection>

          <DocsSection id="troubleshooting" title={titles.troubleshooting}>
            <dl className="flex flex-col gap-5">
              {TROUBLESHOOTING.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="font-medium">
                    <RichText text={d.troubleshooting.items[key].q} />
                  </dt>
                  <dd className="text-pretty text-muted-foreground">
                    <RichText text={t(d.troubleshooting.items[key].a, { model, tokens: minTokens })} />
                  </dd>
                </div>
              ))}
            </dl>
          </DocsSection>

          <DocsSection id="errors" title={titles.errors}>
            <Paragraph text={d.errors.body} />
            <CodeBlock code={JSON.stringify(errorBody("insufficient_credits"), null, 2)} {...copy} />
            <Paragraph text={d.errors.notCharged} />
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
              {ERROR_GROUPS.map((group) => (
                <TableBody key={group}>
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={3} scope="colgroup" className="pt-5 text-xs text-muted-foreground">
                      {d.errors.groups[group]}
                    </TableHead>
                  </TableRow>
                  {ERROR_CODES.filter((code) => ERROR_GROUP[code] === group).map((code) => (
                    <TableRow key={code}>
                      <TableCell className="align-top tabular-nums">{GATEWAY_ERROR_STATUS[code]}</TableCell>
                      <TableCell className="align-top">
                        <code className="font-mono text-xs">{code}</code>
                      </TableCell>
                      <TableCell className="min-w-56 align-top whitespace-normal text-pretty">
                        <span className="block">
                          <RichText text={t(d.errors.codes[code], { size: formatCount(MAX_BODY_MB, locale) })} />
                        </span>
                        <span className="block text-muted-foreground">
                          <RichText text={d.errors.fixes[code]} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              ))}
            </Table>
            <Paragraph text={d.errors.requestId} />
          </DocsSection>

          <DocsSection id="stream-format" title={titles["stream-format"]}>
            <Paragraph text={d.streamFormat.wireBody} />
            <CodeBlock code={examples.stream} {...copy} />
            <Paragraph text={d.streamFormat.keepAlive} />
            <SubHeading>{d.streamFormat.errorTitle}</SubHeading>
            <Paragraph text={d.streamFormat.errorBody} />
            <CodeBlock code={examples.error} {...copy} />
          </DocsSection>
        </div>
      </div>
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

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
      {items.map((text) => (
        <li key={text} className="text-pretty">
          <RichText text={text} />
        </li>
      ))}
    </ul>
  );
}

/** Un párrafo del diccionario con un link en `{slot}`: el texto sigue en un solo string por idioma. */
function TextWithLink({ text, slot, link }: { text: string; slot: string; link: React.ReactNode }) {
  const [before, after = ""] = text.split(`{${slot}}`);
  return (
    <p className="text-pretty">
      <RichText text={before} />
      {link}
      <RichText text={after} />
    </p>
  );
}
