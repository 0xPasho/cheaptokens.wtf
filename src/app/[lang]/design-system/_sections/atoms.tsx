import {
  ArchiveIcon,
  BookOpenIcon,
  CopyIcon,
  KeyRoundIcon,
  LanguagesIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";

import { Price } from "@/components/price";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, formatDiscount, formatUsd } from "@/lib/format";

import { LowBalanceThresholdDemo } from "../_components/demos";
import { Group, Section } from "../_components/section";
import { LOCALE } from "../_data";

const usd = (dollars: number) => Math.round(dollars * 1_000_000);

const KEY_FILTER = [
  { label: "Todas las keys", value: "all" },
  { label: "producción", value: "prod" },
  { label: "staging", value: "staging" },
];

const KEY_SPENT = usd(7.2);
const KEY_LIMIT = usd(10);

/** Marca qué pantalla usa el átomo, según docs/02. */
function Usage({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Uso en cheaptokens.wtf:</span>{" "}
      {children}
    </p>
  );
}

/** Un estado del átomo con su nombre debajo. */
function State({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {children}
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Buttons() {
  return (
    <Section
      title="Button"
      description="Una sola acción default por vista. El texto dice la acción (“Crear key”), no “Aceptar”. Los links con apariencia de botón usan buttonVariants() sobre <a> o <Link>."
    >
      <div className="flex flex-wrap items-start gap-6">
        <State label="default · la acción principal">
          <Button>
            <PlusIcon data-icon="inline-start" />
            Crear key
          </Button>
        </State>
        <State label="outline · link a otra página">
          <a href="#producto" className={buttonVariants({ variant: "outline" })}>
            <BookOpenIcon data-icon="inline-start" aria-hidden />
            Ver docs
          </a>
        </State>
        <State label="secondary">
          <Button variant="secondary">Cancelar</Button>
        </State>
        <State label="ghost · ícono">
          <Button variant="ghost" size="icon" aria-label="Copiar ID">
            <CopyIcon />
          </Button>
        </State>
        <State label="destructive">
          <Button variant="destructive">Revocar</Button>
        </State>
        <State label="link">
          <Button variant="link" className="px-0">
            Ver precio oficial
          </Button>
        </State>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <State label="cargando">
          <Button disabled>
            <Spinner aria-label="Creando key" data-icon="inline-start" />
            Creando key
          </Button>
        </State>
        <State label="deshabilitado">
          <Button disabled>Recargar</Button>
        </State>
        <State label="sm · en tablas">
          <Button size="sm" variant="outline">
            Revocar
          </Button>
        </State>
        <State label="lg · CTA de la landing">
          <Button size="lg">Obtén tu API key</Button>
        </State>
      </div>
    </Section>
  );
}

function Forms() {
  return (
    <Section
      title="Field · Input · InputGroup · Label"
      description="Field arma la etiqueta, el control, la ayuda y el error. Los montos llevan la moneda como prefijo, inputMode decimal y tabular-nums."
    >
      <Usage>formulario de “Crear key” y monto libre de la recarga.</Usage>
      <FieldGroup className="max-w-md">
        <Field>
          <FieldLabel htmlFor="ds-key-name">Nombre de la key</FieldLabel>
          <Input id="ds-key-name" placeholder="producción" autoComplete="off" />
          <FieldDescription>Para reconocerla en la lista.</FieldDescription>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="ds-key-limit">
            Límite de gasto (opcional)
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>USD</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="ds-key-limit"
              type="number"
              inputMode="decimal"
              defaultValue="-5"
              aria-invalid
              aria-describedby="ds-key-limit-error"
              className="tabular-nums"
            />
          </InputGroup>
          <FieldError id="ds-key-limit-error">
            El límite tiene que ser mayor que 0.
          </FieldError>
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="ds-key-hint">Key</FieldLabel>
          <Input
            id="ds-key-hint"
            defaultValue="wtf_Ab3x…9kQz"
            disabled
            className="font-mono"
          />
          <FieldDescription>
            Solo se guarda el inicio y el final. La key completa se mostró una
            vez.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </Section>
  );
}

function Selects() {
  return (
    <Section
      title="Select · NativeSelect"
      description="Select para filtros y orden en escritorio. NativeSelect cuando el selector nativo del teléfono es mejor que un popup."
    >
      <Usage>filtros de la tabla de uso y orden del catálogo.</Usage>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label id="ds-key-filter-label">Key</Label>
          <Select items={KEY_FILTER} defaultValue="all">
            <SelectTrigger
              aria-labelledby="ds-key-filter-label"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEY_FILTER.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ds-model-filter">Modelo</Label>
          <NativeSelect id="ds-model-filter" defaultValue="all" className="w-full">
            <NativeSelectOption value="all">Todos los modelos</NativeSelectOption>
            <NativeSelectOption value="haiku">Claude Haiku 4.5</NativeSelectOption>
            <NativeSelectOption value="flash">Gemini 2.5 Flash</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
    </Section>
  );
}

function Choices() {
  return (
    <Section
      title="Switch · Slider · RadioGroup · Checkbox · Toggle"
      description="Switch para algo que se prende o se apaga y aplica al instante. Checkbox para un filtro o una opción dentro de un form. Toggle es un botón que queda presionado."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Usage>aviso de saldo bajo en el dashboard.</Usage>
          <div className="flex items-center gap-3">
            <Switch id="ds-low-balance" defaultChecked />
            <Label htmlFor="ds-low-balance">Avisarme con saldo bajo</Label>
          </div>
          <LowBalanceThresholdDemo locale={LOCALE} />
        </div>
        <div className="flex flex-col gap-4">
          <Usage>filtros de la tabla de uso y del catálogo.</Usage>
          <RadioGroup defaultValue="month" aria-label="Periodo">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="month" id="ds-month" />
              <Label htmlFor="ds-month">Este mes</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="last-month" id="ds-last-month" />
              <Label htmlFor="ds-last-month">Mes pasado</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="7d" id="ds-7d" />
              <Label htmlFor="ds-7d">Últimos 7 días</Label>
            </div>
          </RadioGroup>
          <div className="flex items-center gap-3">
            <Checkbox id="ds-errors-only" />
            <Label htmlFor="ds-errors-only">Solo requests con error</Label>
          </div>
          <div>
            <Toggle variant="outline" size="sm" defaultPressed>
              <ArchiveIcon data-icon="inline-start" aria-hidden />
              Mostrar deprecated
            </Toggle>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Badges() {
  return (
    <Section
      title="Badge"
      description="El color de un badge dice qué significa, no lo decora. Los tags siempre van en outline."
    >
      <div className="flex flex-wrap items-start gap-6">
        <State label="success · descuento">
          <Badge variant="success">{formatDiscount(9000, LOCALE)}</Badge>
        </State>
        <State label="warning · deprecated">
          <Badge variant="warning">
            Se retira el {formatDate("2027-01-15", LOCALE)}
          </Badge>
        </State>
        <State label="destructive · revocada">
          <Badge variant="destructive">Revocada</Badge>
        </State>
        <State label="outline · tag">
          <Badge variant="outline">Herramientas</Badge>
        </State>
        <State label="secondary · estado neutro">
          <Badge variant="secondary">Activa</Badge>
        </State>
      </div>
    </Section>
  );
}

function ProgressAndLoading() {
  return (
    <Section
      title="Progress · Skeleton · Spinner"
      description="Progress para un límite que se va consumiendo. Skeleton con la forma del contenido que va a llegar. Spinner solo dentro de un botón o junto a un texto que diga qué carga."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Usage>límite de gasto de una key.</Usage>
          <Progress value={(KEY_SPENT / KEY_LIMIT) * 100} className="max-w-md">
            <ProgressLabel>producción</ProgressLabel>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">
              <Price micros={KEY_SPENT} locale={LOCALE} /> de{" "}
              <Price micros={KEY_LIMIT} locale={LOCALE} />
            </span>
          </Progress>
        </div>
        <div className="flex flex-col gap-3">
          <Usage>filas del catálogo mientras cargan.</Usage>
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">Cargando modelos</span>
            {[0, 1].map((row) => (
              <div key={row} className="flex items-start justify-between gap-6">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-12 rounded-4xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function HelpAndShortcuts() {
  return (
    <Section
      title="Tooltip · Kbd"
      description="El tooltip solo amplía algo que ya se ve: nunca guarda información que haga falta para actuar. Kbd muestra atajos de teclado."
    >
      <Usage>
        precio por token y origen del precio oficial en el catálogo; atajo de
        búsqueda.
      </Usage>
      <div className="flex flex-wrap items-center gap-6">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="rounded-sm text-sm font-medium tabular-nums underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            }
          >
            {formatUsd(usd(0.3), LOCALE, "price")}
          </TooltipTrigger>
          <TooltipContent>
            {formatUsd(0.3, LOCALE, "token")} por token
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="rounded-sm text-sm text-muted-foreground tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            }
          >
            <s>{formatUsd(usd(3), LOCALE, "price")}</s>
          </TooltipTrigger>
          <TooltipContent>
            Precio oficial, verificado el {formatDate("2026-11-08", LOCALE)}
          </TooltipContent>
        </Tooltip>
        <InputGroup className="max-w-64">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Buscar modelo"
            aria-label="Buscar modelo"
            aria-keyshortcuts="/"
          />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </Section>
  );
}

function Cards() {
  return (
    <Section
      title="Card"
      description="Una card agrupa una cosa: una key, una cifra, un formulario. No se anidan cards."
    >
      <Usage>resumen de una key en móvil, donde la tabla no cabe.</Usage>
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>producción</CardTitle>
          <CardDescription className="font-mono text-xs">
            wtf_Ab3x…9kQz
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">Activa</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Gastado</dt>
            <dd className="text-right">
              <Price micros={KEY_SPENT} locale={LOCALE} />
            </dd>
            <dt className="text-muted-foreground">Último uso</dt>
            <dd className="text-right tabular-nums">
              {formatDate("2026-11-08", LOCALE)}
            </dd>
          </dl>
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="destructive" size="sm">
            Revocar
          </Button>
        </CardFooter>
      </Card>
    </Section>
  );
}

function Menus() {
  return (
    <Section
      title="DropdownMenu · Avatar · Separator"
      description="El menú de usuario va en la esquina superior derecha. Las acciones que sacan al usuario de la cuenta van al final, separadas."
    >
      <Usage>menú de usuario del dashboard.</Usage>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            {/* El nombre va como texto sr-only y no como aria-label: las iniciales visibles
                no forman parte del nombre y aria-label chocaría con WCAG 2.5.3 (docs/13). */}
            <Avatar size="sm" aria-hidden>
              <AvatarFallback>AL</AvatarFallback>
            </Avatar>
            <span className="sr-only">Cuenta</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>ana@ejemplo.com</DropdownMenuLabel>
              <DropdownMenuItem>
                <KeyRoundIcon />
                API keys
              </DropdownMenuItem>
              <DropdownMenuItem>
                <LanguagesIcon />
                Idioma
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator className="max-w-md" />
    </Section>
  );
}

function Paging() {
  return (
    <Section
      title="Pagination"
      description="Links reales (<a>), no botones: cada página tiene su URL. La página actual lleva aria-current."
    >
      <Usage>tabla de requests en /dashboard/usage.</Usage>
      <Pagination className="justify-start" aria-label="Páginas de requests">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#atomos" text="Anterior" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#atomos">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#atomos" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#atomos">3</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#atomos">12</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#atomos" text="Siguiente" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Section>
  );
}

function Unused() {
  return (
    <Section
      title="Instalados sin uso en el MVP"
      description="Están disponibles, pero ninguna pantalla de docs/02 los necesita todavía. Antes de usarlos, revisa si otro átomo ya resuelve el caso."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ds-textarea">Textarea</FieldLabel>
          <Textarea id="ds-textarea" placeholder="Texto de varias líneas" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">AspectRatio</span>
          <div className="w-full max-w-60">
            <AspectRatio
              ratio={16 / 9}
              className="rounded-lg bg-muted"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

export function Atoms() {
  return (
    <Group
      id="atomos"
      title="Átomos"
      description="Los componentes de shadcn/ui en @/components/ui, cada uno en el uso que tiene en cheaptokens.wtf. Table, Tabs, Dialog, AlertDialog, Alert, Empty y ToggleGroup se ven arriba, dentro de los patrones."
    >
      <Buttons />
      <Badges />
      <Forms />
      <Selects />
      <Choices />
      <ProgressAndLoading />
      <HelpAndShortcuts />
      <Cards />
      <Menus />
      <Paging />
      <Unused />
    </Group>
  );
}
