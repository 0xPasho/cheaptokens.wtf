import { ModelQuickstart, ModelApiDetails } from "@/components/catalog/model-quickstart";
import { ModelDetail } from "@/components/catalog/model-detail";
import { ModelCatalog } from "@/components/catalog/model-catalog";
import { getCatalog } from "@/lib/catalog/queries";
import { getDictionary } from "@/lib/i18n/dictionaries";
import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import KeyRoundIcon from "kubai-icons-react/icons/key-round";
import PlusIcon from "kubai-icons-react/icons/circle-plus";
import SearchIcon from "kubai-icons-react/icons/search";
import TriangleAlertIcon from "kubai-icons-react/icons/triangle-alert";
import CircleAlertIcon from "kubai-icons-react/icons/circle-alert";

import { CopyButton } from "@/components/copy-button";
import { DiscountBadge } from "@/components/discount-badge";
import { ModelId } from "@/components/model-id";
import { MODEL_TAG_ICONS, ModelTagBadge } from "@/components/model-tag";
import { Price, PriceComparison } from "@/components/price";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Stat } from "@/components/stat";
import { UsageMeter } from "@/components/usage-meter";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { BitcoinQuote, BitcoinStatusLine } from "@/components/dashboard/bitcoin-panel";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { PlanMeters } from "@/components/dashboard/plan-meters";
import { PLANS } from "@/lib/billing/plans";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MODEL_TAGS } from "@/lib/catalog/tags";
import { formatCount, formatDate, formatTokens, formatUsd } from "@/lib/format";

import { RevokeKeyDemo } from "../_components/demos";
import { Group, Section } from "../_components/section";
import {
  LOCALE,
  SAMPLE_API_KEY,
  SAMPLE_BASE_URL,
  SAMPLE_MODELS,
  TAG_LABELS,
} from "../_data";

const SORT_OPTIONS = [
  { label: "Mayor descuento", value: "discount" },
  { label: "Precio de output", value: "output" },
  { label: "Nombre", value: "name" },
];

const usd = (dollars: number) => dollars * 1_000_000;

const TOP_UP_AMOUNTS = [10, 25, 50, 100].map(usd);
const TOP_UP_MIN = usd(10);
const TOP_UP_MAX = usd(1_000);
const LOW_BALANCE = usd(1.8);

const COPY_LABELS = { copyLabel: "Copiar", copiedLabel: "Copiado" };

function CatalogPattern() {
  return (
    <Section
      title="Catálogo"
      description="Una fila por modelo. Los precios van por 1M de tokens, alineados a la derecha y con el oficial tachado. Los tags van debajo del nombre para que la tabla quepa en pantallas medianas."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="sm:max-w-64">
            <InputGroupAddon>
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Buscar modelo o autor"
              aria-label="Buscar modelo o autor"
            />
          </InputGroup>
          <Select items={SORT_OPTIONS} defaultValue="discount">
            <SelectTrigger aria-label="Ordenar por" className="sm:ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          spacing={1}
          defaultValue={["fast"]}
          aria-label="Filtrar por tag"
          className="flex-wrap"
        >
          {MODEL_TAGS.map((tag) => {
            const Icon = MODEL_TAG_ICONS[tag];
            return (
              <ToggleGroupItem key={tag} value={tag}>
                <Icon data-icon="inline-start" aria-hidden />
                {TAG_LABELS[tag]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <Table regionLabel="Modelos">
        <TableHeader>
          <TableRow>
            <TableHead>Modelo</TableHead>
            <TableHead className="text-right">Contexto</TableHead>
            <TableHead className="text-right">Input / 1M</TableHead>
            <TableHead className="text-right">Output / 1M</TableHead>
            <TableHead className="text-right">Descuento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SAMPLE_MODELS.map((model) => (
            <TableRow key={model.id}>
              <TableCell className="align-top">
                <div className="flex min-w-56 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{model.name}</span>
                    {model.retiresOn ? (
                      <Badge variant="warning">
                        Se retira el {formatDate(model.retiresOn, LOCALE)}
                      </Badge>
                    ) : null}
                  </div>
                  <ModelId id={model.id} {...COPY_LABELS} />
                  <div className="flex flex-wrap gap-1">
                    {model.tags.map((tag) => (
                      <ModelTagBadge
                        key={tag}
                        tag={tag}
                        label={TAG_LABELS[tag]}
                      />
                    ))}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                {formatTokens(model.contextLength, LOCALE)}
              </TableCell>
              <TableCell className="text-right align-top">
                <PriceComparison
                  official={model.officialInput}
                  discounted={model.discountedInput}
                  locale={LOCALE}
                  labels={{ official: "Precio oficial", discounted: "Precio cheapllm.wtf" }}
                />
              </TableCell>
              <TableCell className="text-right align-top">
                <PriceComparison
                  official={model.officialOutput}
                  discounted={model.discountedOutput}
                  locale={LOCALE}
                  labels={{ official: "Precio oficial", discounted: "Precio cheapllm.wtf" }}
                />
              </TableCell>
              <TableCell className="text-right align-top">
                <DiscountBadge discountBps={model.discountBps} locale={LOCALE} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function PricingPattern() {
  return (
    <Section
      title="Precio y descuento"
      description="El precio oficial siempre se ve, tachado y en gris. El precio cheapllm.wtf va en el color del texto, no en verde: el verde es solo para el descuento y el ahorro."
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <span className="flex items-center gap-2">
          <PriceComparison
            official={3_000_000}
            discounted={300_000}
            locale={LOCALE}
            labels={{ official: "Precio oficial", discounted: "Precio cheapllm.wtf" }}
          />
          <DiscountBadge discountBps={9000} locale={LOCALE} />
        </span>
        <span className="flex flex-col text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Saldo
          </span>
          <Price micros={18_420_000} locale={LOCALE} />
        </span>
        <span className="flex flex-col text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            Costo del request
          </span>
          <Price micros={1_350} locale={LOCALE} kind="cost" />
        </span>
      </div>
    </Section>
  );
}

function SnippetPattern() {
  return (
    <Section
      title="Snippet de conexión"
      description="El mismo componente en la landing, el checklist del dashboard, el modal de key creada y /docs. Solo cambian la base URL y la key."
    >
      <QuickstartSnippet
        baseUrl={SAMPLE_BASE_URL}
        apiKey="wtf_..."
        model="anthropic/claude-haiku-4.5"
        {...COPY_LABELS}
      />
    </Section>
  );
}

function DashboardPattern() {
  return (
    <Section
      title="Cifras del dashboard"
      description="Una cifra por card, con etiqueta arriba. El ahorro es la única cifra en verde. La card del saldo lleva la acción principal de la vista."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Stat
              label="Saldo"
              value={<Price micros={18_420_000} locale={LOCALE} />}
            />
            <Button className="w-full">Recargar</Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stat
              label="Gasto este mes"
              value={<Price micros={6_580_000} locale={LOCALE} />}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stat
              label="Ahorro este mes"
              value={<Price micros={59_220_000} locale={LOCALE} />}
              hint="Frente al precio oficial"
              tone="success"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stat label="Requests este mes" value={formatCount(12_481, LOCALE)} />
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function FeedbackPattern() {
  return (
    <Section
      title="Avisos"
      description="Banners arriba del contenido de la página. Warning cuando todavía funciona, destructive cuando ya falla, success cuando se acreditó dinero."
    >
      <div className="flex flex-col gap-3">
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            Te quedan <Price micros={LOW_BALANCE} locale={LOCALE} /> de saldo
          </AlertTitle>
          <AlertDescription>
            Recarga antes de que tus requests empiecen a fallar.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>
            Tu saldo es <Price micros={0} locale={LOCALE} />
          </AlertTitle>
          <AlertDescription>
            Los requests fallan con 402 hasta que recargues.
          </AlertDescription>
        </Alert>
        <Alert variant="success">
          <CircleCheckIcon />
          <AlertTitle>Recarga confirmada</AlertTitle>
          <AlertDescription>
            Tu saldo ya incluye los <Price micros={usd(25)} locale={LOCALE} />.
          </AlertDescription>
        </Alert>
      </div>
    </Section>
  );
}

function EmptyPattern() {
  return (
    <Section
      title="Estado vacío"
      description="Qué falta y el botón que lo resuelve. Nada más."
    >
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>Todavía no tienes API keys</EmptyTitle>
          <EmptyDescription>
            Crea una para hacer tu primer request.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button>
            <PlusIcon data-icon="inline-start" />
            Crear key
          </Button>
        </EmptyContent>
      </Empty>
    </Section>
  );
}

function ApiKeyPatterns() {
  return (
    <Section
      title="API keys"
      description="La key completa se muestra una sola vez, con el snippet ya armado. Revocar siempre pide confirmación."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" />
            Crear key
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Tu nueva API key</DialogTitle>
              <DialogDescription>
                Cópiala ahora y guárdala en un lugar seguro. No la vas a volver a
                ver.
              </DialogDescription>
            </DialogHeader>
            <InputGroup>
              <InputGroupInput
                readOnly
                value={SAMPLE_API_KEY}
                aria-label="API key"
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <CopyButton
                  value={SAMPLE_API_KEY}
                  size="icon-xs"
                  {...COPY_LABELS}
                />
              </InputGroupAddon>
            </InputGroup>
            <QuickstartSnippet
              baseUrl={SAMPLE_BASE_URL}
              apiKey={SAMPLE_API_KEY}
              model="anthropic/claude-haiku-4.5"
              {...COPY_LABELS}
              className="min-w-0"
            />
            <DialogFooter>
              <DialogClose render={<Button />}>Listo</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <RevokeKeyDemo />
      </div>
    </Section>
  );
}

function TopUpPattern() {
  return (
    <Section
      title="Recarga"
      description="Montos rápidos o uno libre entre el mínimo y el máximo. Un solo botón principal."
    >
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Recargar créditos</CardTitle>
          <CardDescription>
            Pagas en el checkout, que agrega el impuesto de tu país. El saldo
            se acredita al volver.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">USD</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Un segmentado: pista de vidrio y la opción elegida elevada (refs 6 y 7). */}
            <ToggleGroup
              spacing={1}
              defaultValue={[String(usd(25))]}
              aria-label="Monto"
              className="w-full glass-control p-1"
            >
              {TOP_UP_AMOUNTS.map((amount) => (
                <ToggleGroupItem
                  key={amount}
                  value={String(amount)}
                  className="flex-1 tabular-nums"
                >
                  {formatUsd(amount, LOCALE, "whole")}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field>
              <FieldLabel htmlFor="ds-custom-amount">Otro monto</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>USD</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="ds-custom-amount"
                  type="number"
                  inputMode="decimal"
                  min={10}
                  max={1000}
                  placeholder={`${formatCount(10, LOCALE)} – ${formatCount(1_000, LOCALE)}`}
                  className="tabular-nums"
                />
              </InputGroup>
              <FieldDescription>
                Mínimo {formatUsd(TOP_UP_MIN, LOCALE, "whole")}, máximo{" "}
                {formatUsd(TOP_UP_MAX, LOCALE, "whole")}.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button className="w-full">
            Recargar <Price micros={usd(25)} locale={LOCALE} />
          </Button>
        </CardFooter>
      </Card>
    </Section>
  );
}

/** Una cotización de ejemplo: la primera dirección de la frase pública de BIP84. Nadie debe enviarle nada. */
const SAMPLE_BTC_ADDRESS = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";

function BitcoinPattern() {
  const labels = getDictionary(LOCALE).dashboard.bitcoin;
  return (
    <Section
      title="Pago en Bitcoin"
      description="BitcoinQuote es la cotización: QR con el monto (BIP21), el monto exacto, la dirección y cuánto le queda al precio fijo. BitcoinStatusLine cuenta qué pasa con el pago: esperando, visto en la red, acreditado o un aviso (ADR-0065)."
    >
      <div className="flex max-w-2xl flex-col gap-4 text-sm">
        <BitcoinQuote
          address={SAMPLE_BTC_ADDRESS}
          amountSats={BigInt(41_235)}
          rateMicroUsd={BigInt(94_580_000_000)}
          remainingMs={12 * 60_000 + 48_000}
          testnet={false}
          locale={LOCALE}
          labels={labels}
        />
        <BitcoinStatusLine tone="waiting" title={labels.waiting} hint={labels.waitingHint} />
        <BitcoinStatusLine
          tone="seen"
          title={labels.seen.replace("{amount}", "0.00041235")}
          hint={`${labels.seenQuoteHint.replace("{usd}", formatUsd(39_000_000, LOCALE))} ${labels.confirming.replace("{count}", "1")}`}
          link={{ href: "#", label: labels.viewTransaction }}
        />
        <BitcoinStatusLine tone="credited" title={labels.credited.replace("{amount}", formatUsd(39_000_000, LOCALE))} />
        <BitcoinStatusLine tone="warning" title={labels.expired} hint={labels.expiredHint} action={<Button variant="outline" size="sm">{labels.newQuote}</Button>} />
      </div>
    </Section>
  );
}

/** Instante fijo: así las capturas de la ventana y la semana no cambian entre corridas. */
const SAMPLE_NOW = Date.UTC(2026, 10, 15, 15, 20);

function PlanLimitsPattern() {
  const dict = getDictionary(LOCALE);
  return (
    <Section
      title="Límites del plan"
      description="UsageMeter es Progress con estado y detalle: la ventana de 5 horas y la semana del plan. Desde el 80 % pasa a warning. PlanMeters arma los dos con su reinicio y el valor usado."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <UsageMeter label="Ventana de 5 horas" fraction={0.34} status="34 % usado" details={["Se reinicia en 2h 41min", "2,38 US$ de 7 US$ de uso"]} />
          <UsageMeter label="Semana" fraction={0.86} status="86 % usado" details={["Se reinicia en 2d 18h", "25,80 US$ de 30 US$ de uso"]} />
        </div>
        <PlanMeters
          now={SAMPLE_NOW}
          locale={LOCALE}
          labels={dict.dashboard.limits}
          usage={{
            plan: PLANS.pro,
            fiveHour: { usedMicroUsd: BigInt(5_460_000), resetsAt: SAMPLE_NOW + 3 * 3_600_000 },
            week: { usedMicroUsd: BigInt(9_672_000), resetsAt: SAMPLE_NOW + 4 * 86_400_000 },
          }}
        />
      </div>
    </Section>
  );
}

function DashboardChromePattern() {
  const dict = getDictionary(LOCALE);
  return (
    <Section
      title="Navegación del dashboard"
      description="DashboardNav reusa la sidebar del catálogo. AccountMenu es el menú de cuenta de la cabecera, con cerrar sesión."
    >
      <div className="flex flex-wrap items-start gap-10">
        <div className="w-60"><DashboardNav locale={LOCALE} labels={dict.dashboard.nav} /></div>
        <AccountMenu
          locale={LOCALE}
          mode="dev"
          identity="ana@ejemplo.com"
          labels={{ account: dict.auth.account, dashboard: dict.dashboard.nav.overview, keys: dict.dashboard.nav.keys, settings: dict.dashboard.nav.settings, signOut: dict.auth.signOut }}
        />
      </div>
    </Section>
  );
}

export function ProductPatterns() {
  return (
    <Group
      id="producto"
      title="Patrones de producto"
      description="Componentes de @/components armados con los átomos. Úsalos en vez de rearmar cada pantalla."
    >
      <PricingPattern />
      <CatalogPattern />
      <Section title="Catalog explorer" description="NibbleRouter composition: capability and author filters, cards and table.">
        <div className="nr-site"><ModelCatalog models={getCatalog()} locale="es" dict={getDictionary("es")} /></div>
      </Section>
      <Section title="Model detail" description="Layered cards: an opaque base and a lighter front surface across the model overview, code preview, pricing and API parameters. The overview keeps the author and task on its lower base.">
        <div className="nr-site"><ModelDetail model={getCatalog()[0]} models={getCatalog()} locale="es" dict={getDictionary("es")} /></div>
      </Section>
      <Section title="API preview" description="Request and example output in parallel, with local syntax highlighting.">
        <ModelQuickstart model={getCatalog()[0].id} locale="es" dict={getDictionary("es")} />
        <ModelApiDetails model={getCatalog()[0].id} dict={getDictionary("es")} />
      </Section>
      <SnippetPattern />
      <DashboardPattern />
      <PlanLimitsPattern />
      <DashboardChromePattern />
      <FeedbackPattern />
      <ApiKeyPatterns />
      <TopUpPattern />
      <BitcoinPattern />
      <EmptyPattern />
    </Group>
  );
}
