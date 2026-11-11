import { KeyRoundIcon, PlusIcon, SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { Group, Section } from "../_components/section";

/**
 * Escenario con textura de alto contraste: franjas de foreground y background.
 * El vidrio necesita algo detrás para verse (ref 8); estas franjas son el caso difícil.
 */
const STRIPES =
  "bg-[repeating-linear-gradient(135deg,var(--foreground)_0_14px,var(--background)_14px_28px)]";

const LEVELS = [
  {
    name: "glass-surface",
    use: "Popovers, menús, tooltips y el marco de los diálogos (refs 5, 9, 10).",
  },
  {
    name: "glass-bezel",
    use: "Marco de un diálogo. No lleva texto, así que es el vidrio más transparente (refs 5, 10, 11).",
  },
  {
    name: "glass-control",
    use: "Botón outline, inputs, pista de un segmentado. Solo sobre superficies propias.",
  },
  {
    name: "glass-prominent",
    use: "La acción principal: píldora con brillo (refs 3 y 10).",
  },
  {
    name: "glass-raised",
    use: "La opción activa de un segmentado (refs 3, 4, 6).",
  },
  {
    name: "glass-track",
    use: "Pista hundida de switches, sliders y barras de progreso (refs 1 y 6).",
  },
  {
    name: "glass-knob",
    use: "Perilla de switches y sliders: sombra y brillo de vidrio.",
  },
  {
    name: "glass-edge",
    use: "Contenido opaco con borde luminoso: cards, avisos, código (refs 7 y 12).",
  },
  {
    name: "glass-glow",
    use: "Resplandor de un estado vacío (ref 2).",
  },
];

/** Un panel de vidrio con todo lo que puede llevar adentro. Las pruebas e2e lo miden. */
function GlassPanel() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 rounded-3xl glass-surface p-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">API key creada</p>
        <p className="text-sm text-muted-foreground">
          Texto secundario sobre vidrio, con el peor fondo detrás.
        </p>
      </div>
      <Tabs defaultValue="python">
        <TabsList>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="javascript">JavaScript</TabsTrigger>
          <TabsTrigger value="curl">curl</TabsTrigger>
        </TabsList>
      </Tabs>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput placeholder="Buscar modelo" aria-label="Buscar modelo" />
        <InputGroupAddon align="inline-end">
          <Kbd>/</Kbd>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Button>
          <PlusIcon data-icon="inline-start" />
          Crear key
        </Button>
        <Button variant="outline">Cancelar</Button>
        <Button variant="ghost" size="icon" aria-label="Ver keys">
          <KeyRoundIcon />
        </Button>
        <Badge variant="outline">Herramientas</Badge>
      </div>
    </div>
  );
}

export function Material() {
  return (
    <Group
      id="material"
      title="Material: liquid glass"
      description="El vidrio es la capa de controles y navegación; el contenido va opaco. Cada nivel tiene una opacidad calculada para que el texto pase AA con el peor fondo detrás."
    >
      <Section
        title="Niveles de vidrio"
        description="Nueve utilidades de globals.css, sobre un fondo con textura para que se vea el desenfoque. Con transparencia reducida o más contraste, todas se vuelven opacas."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map(({ name, use }) => (
            <li key={name} className="flex flex-col gap-2">
              <div
                className={cn(
                  "relative flex h-28 items-center justify-center overflow-hidden rounded-3xl",
                  STRIPES,
                )}
                aria-hidden
              >
                <div
                  data-glass-level={name}
                  className={cn(
                    "flex h-14 w-40 items-center justify-center text-sm font-medium",
                    name === "glass-surface" && "rounded-2xl glass-surface",
                    name === "glass-bezel" && "rounded-2xl glass-bezel text-transparent",
                    name === "glass-control" && "rounded-full glass-control backdrop-blur-xl",
                    name === "glass-prominent" && "rounded-full glass-prominent",
                    name === "glass-raised" && "rounded-full glass-raised backdrop-blur-xl",
                    name === "glass-track" && "h-6 rounded-full glass-track backdrop-blur-xl text-transparent",
                    name === "glass-knob" && "size-14 w-14 rounded-full bg-background glass-knob",
                    name === "glass-edge" && "rounded-2xl glass-edge",
                    name === "glass-glow" && "rounded-2xl bg-background glass-glow",
                  )}
                >
                  Aa
                </div>
              </div>
              <code className="font-mono text-xs">{name}</code>
              <span className="text-xs text-muted-foreground">{use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Vidrio sobre el peor fondo"
        description="El mismo panel sobre el color opuesto al tema (blanco en oscuro, negro en claro) y sobre el fondo normal. axe mide aquí el contraste real de cada componente sobre vidrio."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div
            data-glass-backdrop="worst"
            className="flex items-center justify-center rounded-3xl bg-foreground p-6"
          >
            <GlassPanel />
          </div>
          <div
            data-glass-backdrop="background"
            className="flex items-center justify-center rounded-3xl bg-background p-6 ring-1 ring-border"
          >
            <GlassPanel />
          </div>
        </div>
      </Section>

      <Section
        title="Vidrio sobre textura"
        description="Para revisar a ojo: el desenfoque y la saturación de glass-surface sobre franjas de alto contraste (ref 8)."
      >
        <div
          data-glass-backdrop="stripes"
          className={cn("flex items-center justify-center rounded-3xl p-6", STRIPES)}
        >
          <GlassPanel />
        </div>
      </Section>
    </Group>
  );
}
