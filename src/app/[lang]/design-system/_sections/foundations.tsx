import { PageHeader, SectionHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDiscount,
  formatTokens,
  formatUsd,
} from "@/lib/format";

import { Group, Section } from "../_components/section";

// Las clases van escritas completas para que Tailwind las detecte.
const COLOR_TOKENS = [
  { token: "background", swatch: "bg-background", use: "Fondo de página" },
  { token: "foreground", swatch: "bg-foreground", use: "Texto principal" },
  { token: "card", swatch: "bg-card", use: "Cards, popovers y diálogos" },
  { token: "muted", swatch: "bg-muted", use: "Fondos sutiles y bloques de código" },
  {
    token: "muted-foreground",
    swatch: "bg-muted-foreground",
    use: "Texto secundario y precio oficial tachado",
  },
  { token: "primary", swatch: "bg-primary", use: "La acción principal de la vista" },
  { token: "secondary", swatch: "bg-secondary", use: "Acciones secundarias" },
  { token: "border", swatch: "bg-border", use: "Bordes y separadores" },
  { token: "ring", swatch: "bg-ring", use: "Anillo de foco" },
  {
    token: "success",
    swatch: "bg-success",
    use: "Dinero a favor: descuento, ahorro, recarga acreditada",
  },
  {
    token: "warning",
    swatch: "bg-warning",
    use: "Atención: saldo bajo, modelo deprecated",
  },
  {
    token: "destructive",
    swatch: "bg-destructive",
    use: "Errores y acciones que no se deshacen",
  },
];

const TYPE_SCALE = [
  {
    role: "Display",
    classes: "text-4xl sm:text-5xl font-semibold tracking-tight",
    note: "Solo el hero de la landing",
    sample: (
      <p className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Un endpoint. Todos los modelos.
      </p>
    ),
  },
  {
    role: "Título de página (h1)",
    classes: "<PageHeader>",
    note: "Uno por página",
    sample: <PageHeader title="API keys" />,
  },
  {
    role: "Título de sección (h2)",
    classes: "<SectionHeader>",
    note: "Bloques dentro de una página",
    sample: <SectionHeader title="Historial de recargas" />,
  },
  {
    role: "Cuerpo",
    classes: "text-sm · text-base en landing y docs",
    note: "El dashboard y las tablas usan text-sm",
    sample: (
      <p className="text-sm">
        Cambia la base URL y usa tu API key de cheaptokens.wtf. El resto de tu código no
        cambia.
      </p>
    ),
  },
  {
    role: "Secundario",
    classes: "text-sm text-muted-foreground",
    note: "Descripciones y ayudas",
    sample: (
      <p className="text-sm text-muted-foreground">
        Se cobra al terminar cada request, con los tokens que reporta el modelo.
      </p>
    ),
  },
  {
    role: "Etiqueta",
    classes: "text-xs font-medium text-muted-foreground",
    note: "Encima de cifras y en encabezados chicos",
    sample: <p className="text-xs font-medium text-muted-foreground">Saldo</p>,
  },
  {
    role: "Código e IDs",
    classes: "font-mono text-xs · text-sm en bloques",
    note: "IDs de modelo, keys, snippets",
    sample: (
      <code className="font-mono text-xs">anthropic/claude-haiku-4.5</code>
    ),
  },
  {
    role: "Cifras",
    classes: "tabular-nums",
    note: "Todo monto, conteo o fecha en columnas",
    sample: (
      <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
        $1,234.50
      </p>
    ),
  },
];

const FORMAT_EXAMPLES = [
  { what: "Saldo", fn: 'formatUsd(µ, lang, "balance")', format: (l: string) => formatUsd(12_345_678, l, "balance") },
  { what: "Saldo negativo", fn: 'formatUsd(µ, lang, "balance")', format: (l: string) => formatUsd(-120_000, l, "balance") },
  { what: "Precio por 1M", fn: 'formatUsd(µ, lang, "price")', format: (l: string) => formatUsd(75_000, l, "price") },
  { what: "Costo de un request", fn: 'formatUsd(µ, lang, "cost")', format: (l: string) => formatUsd(1_350, l, "cost") },
  { what: "Precio por token (tooltip)", fn: 'formatUsd(µ, lang, "token")', format: (l: string) => formatUsd(0.3, l, "token") },
  { what: "Descuento", fn: "formatDiscount(bps, lang)", format: (l: string) => formatDiscount(8750, l) },
  { what: "Contexto", fn: "formatTokens(n, lang)", format: (l: string) => formatTokens(200_000, l) },
  { what: "Fecha", fn: "formatDate(d, lang)", format: (l: string) => formatDate("2026-11-08", l) },
];

export function Foundations() {
  return (
    <Group
      id="fundamentos"
      title="Fundamentos"
      description="Color, tipografía y formatos. Todo lo demás se construye con esto."
    >
      <Section
        title="Color"
        description="Base neutra. El color solo aparece cuando significa algo, y cada color significa una sola cosa. Usa siempre el token, nunca el valor."
      >
        <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_TOKENS.map(({ token, swatch, use }) => (
            <li key={token} className="flex items-center gap-3">
              <span
                className={`size-10 shrink-0 rounded-lg ring-1 ring-foreground/10 ${swatch}`}
                aria-hidden
              />
              <span className="flex min-w-0 flex-col">
                <code className="font-mono text-xs">{token}</code>
                <span className="text-xs text-muted-foreground">{use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Tipografía"
        description="Geist para todo, Geist Mono para código. Pocos tamaños, y la jerarquía sale del peso y del color más que del tamaño."
      >
        <Card>
          <CardContent className="flex flex-col divide-y">
            {TYPE_SCALE.map(({ role, classes, note, sample }) => (
              <div
                key={role}
                className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[14rem_1fr]"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{role}</p>
                  <code className="font-mono text-xs text-muted-foreground">
                    {classes}
                  </code>
                  <p className="text-xs text-muted-foreground">{note}</p>
                </div>
                <div className="min-w-0">{sample}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Formatos"
        description={
          <>
            Siempre con las funciones de{" "}
            <code className="font-mono text-xs">@/lib/format</code> y el idioma
            de la ruta. El dinero entra en µUSD. Revisa los dos idiomas:{" "}
            <span className="whitespace-nowrap">“0,30 US$”</span> es más ancho
            que “$0.30”.
          </>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Mismo valor, dos idiomas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table regionLabel="Formatos en inglés y español">
              <TableHeader>
                <TableRow>
                  <TableHead>Qué</TableHead>
                  <TableHead className="text-right">en</TableHead>
                  <TableHead className="text-right">es</TableHead>
                  <TableHead className="hidden md:table-cell">Función</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FORMAT_EXAMPLES.map(({ what, fn, format }) => (
                  <TableRow key={what}>
                    <TableCell>{what}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format("en")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format("es")}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                      {fn}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Section>
    </Group>
  );
}
