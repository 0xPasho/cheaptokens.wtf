import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodeBlock } from "@/components/code-block";
import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Cada átomo con su nivel de vidrio (docs/13 › Material › Componente por componente).
 * La referencia de cada uno está en el nombre de la prueba.
 */

describe("Button (refs 3, 5, 10: píldoras)", () => {
  it("la acción principal es una píldora prominente con brillo", () => {
    render(<Button>Crear key</Button>);
    const button = screen.getByRole("button", { name: "Crear key" });
    expect(button).toHaveClass("glass-prominent", "rounded-full");
    expect(button.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
  });

  it("outline es vidrio translúcido; ghost solo se vuelve vidrio al pasar", () => {
    render(
      <>
        <Button variant="outline">Cancelar</Button>
        <Button variant="ghost">Ver</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass("glass-control", "rounded-full");
    const ghost = screen.getByRole("button", { name: "Ver" });
    expect(ghost).toHaveClass("hover:bg-glass-control-hover");
    expect(ghost).not.toHaveClass("glass-control");
  });

  it.each(["xs", "sm", "default", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const)(
    "tamaño %s también es redondo",
    (size) => {
      render(<Button size={size} aria-label="x" />);
      expect(screen.getByRole("button")).toHaveClass("rounded-full");
    },
  );
});

describe("Badge (refs 2 y 5: etiquetas de vidrio)", () => {
  it("outline es vidrio; los de color conservan su tinte con significado", () => {
    render(
      <>
        <Badge variant="outline">tag</Badge>
        <Badge variant="success">−90%</Badge>
      </>,
    );
    expect(screen.getByText("tag")).toHaveClass("glass-control");
    expect(screen.getByText("−90%")).toHaveClass("bg-success/10");
  });
});

describe("Card, Alert y CodeBlock (refs 7 y 12: contenido opaco con borde luminoso)", () => {
  it("Card: borde luminoso y esquinas grandes, sin translucidez", () => {
    const { container } = render(<Card>x</Card>);
    const card = container.firstElementChild;
    expect(card).toHaveClass("glass-edge", "rounded-3xl");
    expect(card?.className).not.toMatch(/glass-surface|glass-control/);
  });

  it("Alert: borde luminoso; el color va en el texto", () => {
    render(<Alert variant="warning">Saldo bajo</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("glass-edge", "rounded-2xl", "text-warning");
    expect(alert).not.toHaveClass("bg-card");
  });

  it("CodeBlock: borde luminoso sobre muted", () => {
    const { container } = render(<CodeBlock code="x" />);
    expect(container.firstElementChild).toHaveClass("glass-edge", "rounded-2xl", "[--edge-fill:var(--muted)]");
  });
});

describe("Dialog y AlertDialog (refs 5, 10, 11: marco doble)", () => {
  it("Dialog: marco de vidrio por fuera y panel opaco por dentro, con radios concéntricos", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent closeLabel="Cerrar">
          <DialogTitle>Tu nueva API key</DialogTitle>
          <DialogFooter>pie</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const frame = screen.getByRole("dialog");
    expect(frame).toHaveClass("glass-bezel", "rounded-[2rem]", "p-2.5");
    const panel = frame.querySelector('[data-slot="dialog-panel"]');
    // El panel opaco lleva el texto; en oscuro es más oscuro que el marco (ref 5).
    expect(panel).toHaveClass("bg-popover", "dark:bg-background", "rounded-[1.375rem]");
    expect(panel?.className).not.toMatch(/glass-surface/);
    // La X vive dentro del panel, no sobre el marco.
    expect(panel).toContainElement(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByText("pie")).toHaveClass("rounded-b-[1.375rem]");
  });

  it("AlertDialog: el mismo marco doble", () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogTitle>¿Revocar?</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const frame = screen.getByRole("alertdialog");
    expect(frame).toHaveClass("glass-bezel", "rounded-[2rem]");
    expect(frame.querySelector('[data-slot="alert-dialog-panel"]')).toHaveClass("bg-popover");
  });
});

describe("DropdownMenu y Tooltip (ref 9: vidrio esmerilado)", () => {
  it("el menú abierto es una superficie de vidrio", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Cuenta</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Cerrar sesión</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("glass-surface", "rounded-2xl");
    expect(menu.className).not.toMatch(/(^|\s)bg-popover(\s|$)/);
    expect(screen.getByRole("menuitem")).toHaveClass("rounded-lg");
  });

  it("el tooltip es vidrio con texto normal, no un bloque invertido", () => {
    render(
      <Tooltip defaultOpen>
        <TooltipTrigger>precio</TooltipTrigger>
        <TooltipContent>por token</TooltipContent>
      </Tooltip>,
    );
    const tooltip = screen.getByText("por token").closest('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveClass("glass-surface", "text-popover-foreground");
    expect(tooltip).not.toHaveClass("bg-foreground");
  });
});

describe("Tabs y Toggle (refs 3, 4, 6, 7: segmentados)", () => {
  it("la pista es vidrio redondo y la opción activa se eleva", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Python</TabsTrigger>
          <TabsTrigger value="b">curl</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tablist")).toHaveClass("glass-control", "rounded-full");
    const active = screen.getByRole("tab", { name: "Python" });
    expect(active).toHaveClass("rounded-full", "group-data-[variant=default]/tabs-list:data-active:glass-raised");
    expect(active).toHaveAttribute("data-active");
  });

  it("un toggle presionado se eleva; outline es vidrio", () => {
    render(
      <Toggle variant="outline" defaultPressed>
        Mostrar deprecated
      </Toggle>,
    );
    const toggle = screen.getByRole("button", { name: "Mostrar deprecated" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveClass("glass-control", "aria-pressed:glass-raised", "rounded-full");
  });
});

describe("Inputs (ref 10: píldoras de vidrio)", () => {
  it("Input y NativeSelect son píldoras de vidrio; Textarea, rectángulo redondeado", () => {
    render(
      <>
        <Input aria-label="nombre" />
        <NativeSelect aria-label="modelo">
          <NativeSelectOption value="a">a</NativeSelectOption>
        </NativeSelect>
        <Textarea aria-label="notas" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "nombre" })).toHaveClass(
      "rounded-full",
      "not-data-[slot=input-group-control]:glass-control",
    );
    expect(screen.getByRole("combobox", { name: "modelo" })).toHaveClass("rounded-full", "glass-control");
    expect(screen.getByRole("textbox", { name: "notas" })).toHaveClass("rounded-2xl");
  });

  it("dentro de un InputGroup el vidrio lo pone el grupo: nada de vidrio sobre vidrio", () => {
    const { container } = render(
      <InputGroup>
        <InputGroupInput aria-label="buscar" />
      </InputGroup>,
    );
    expect(container.querySelector('[data-slot="input-group"]')).toHaveClass("glass-control", "rounded-full");
    // El input interno lleva data-slot=input-group-control, así que la variante not-data-[…] no aplica.
    expect(screen.getByRole("textbox", { name: "buscar" })).toHaveAttribute(
      "data-slot",
      "input-group-control",
    );
  });
});

describe("Kbd y Empty", () => {
  it("Kbd es una tecla de vidrio", () => {
    render(<Kbd>/</Kbd>);
    expect(screen.getByText("/")).toHaveClass("glass-control");
  });

  it("Empty tiene el resplandor centrado (ref 2)", () => {
    const { container } = render(<Empty>vacío</Empty>);
    expect(container.firstElementChild).toHaveClass("glass-glow", "rounded-3xl");
  });
});

describe("Switch, Checkbox, Radio, Slider y Progress (refs 1 y 6 + Apple: controles de vidrio)", () => {
  it("Switch: pista hundida apagado, píldora prominente encendido, perilla de vidrio", () => {
    const { container } = render(
      <>
        <Switch aria-label="apagado" />
        <Switch aria-label="encendido" defaultChecked />
      </>,
    );
    const [off, on] = screen.getAllByRole("switch");
    for (const root of [off, on]) {
      expect(root).toHaveClass("data-unchecked:glass-track", "data-checked:glass-prominent", "rounded-full");
    }
    expect(off).toHaveAttribute("data-unchecked");
    expect(on).toHaveAttribute("data-checked");
    const thumbs = container.querySelectorAll('[data-slot="switch-thumb"]');
    expect(thumbs).toHaveLength(2);
    for (const thumb of thumbs) {
      expect(thumb).toHaveClass(
        "glass-knob",
        "data-unchecked:bg-muted-foreground",
        "dark:data-unchecked:bg-foreground",
        "data-checked:bg-primary-foreground",
      );
    }
  });

  it("Checkbox: vidrio con borde visible sin marcar, prominente marcado", () => {
    render(
      <>
        <Checkbox aria-label="sin marcar" />
        <Checkbox aria-label="marcado" defaultChecked />
      </>,
    );
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toHaveClass(
        "border-muted-foreground/80",
        "not-data-checked:glass-control",
        "data-checked:glass-prominent",
        "data-checked:text-primary-foreground",
      );
      expect(box.className).not.toMatch(/border-input/);
    }
  });

  it("RadioGroup: el mismo tratamiento que Checkbox", () => {
    render(
      <RadioGroup defaultValue="a" aria-label="periodo">
        <RadioGroupItem value="a" aria-label="este mes" />
        <RadioGroupItem value="b" aria-label="mes pasado" />
      </RadioGroup>,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveClass("border-muted-foreground/80", "data-checked:glass-prominent", "rounded-full");
    }
  });

  it("Slider: pista hundida, relleno y perilla de vidrio que crece al arrastrar", () => {
    const { container } = render(<Slider defaultValue={[40]} aria-label="umbral" />);
    expect(container.querySelector('[data-slot="slider-track"]')).toHaveClass("glass-track", "rounded-full");
    expect(container.querySelector('[data-slot="slider-range"]')).toHaveClass("bg-primary", "rounded-full");
    const thumb = container.querySelector('[data-slot="slider-thumb"]');
    expect(thumb).toHaveClass("glass-knob", "border-muted-foreground/80", "active:scale-110", "motion-reduce:active:scale-100");
    // El foco de teclado cae en el <input> de adentro: el anillo se activa con has-[:focus-visible].
    expect(thumb).toHaveClass("has-[:focus-visible]:ring-3");
  });

  it("Progress: pista hundida y relleno redondo", () => {
    const { container } = render(<Progress value={72} aria-label="límite" />);
    expect(container.querySelector('[data-slot="progress-track"]')).toHaveClass("glass-track", "rounded-full");
    expect(container.querySelector('[data-slot="progress-indicator"]')).toHaveClass("bg-primary", "rounded-full");
  });
});
