import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Slider } from "@/components/ui/slider";

/**
 * Los cambios propios sobre shadcn listados en docs/13 › Átomos y composición.
 * Si un átomo se reinstala con --overwrite y pierde su cambio, falla aquí.
 */

describe("Button / buttonVariants", () => {
  it("buttonVariants() fusiona clases: outline tiene borde visible fuera de <Button>", () => {
    const classes = buttonVariants({ variant: "outline" }).split(" ");
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-transparent");
  });

  it("acepta className y lo fusiona", () => {
    expect(buttonVariants({ className: "w-full" })).toContain("w-full");
  });

  it("un <a> con buttonVariants conserva el rol de link", () => {
    render(
      <a href="#models" className={buttonVariants({ variant: "outline" })}>
        Ver modelos
      </a>,
    );
    expect(screen.getByRole("link", { name: "Ver modelos" })).not.toHaveAttribute("role");
  });

  it("destructive es tinte con texto rojo, no relleno sólido", () => {
    render(<Button variant="destructive">Revocar</Button>);
    expect(screen.getByRole("button", { name: "Revocar" })).toHaveClass(
      "bg-destructive/10",
      "text-destructive",
    );
  });
});

describe("Badge y Alert: variantes con significado", () => {
  it.each(["success", "warning"] as const)("Badge %s usa su token en tinte", (variant) => {
    render(<Badge variant={variant}>x</Badge>);
    expect(screen.getByText("x")).toHaveClass(`bg-${variant}/10`, `text-${variant}`);
  });

  it.each(["success", "warning"] as const)("Alert %s usa su token", (variant) => {
    render(
      <Alert variant={variant}>
        <AlertTitle>Aviso</AlertTitle>
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveClass(`text-${variant}`);
  });
});

describe("Dialog", () => {
  it("el overlay usa el token bg-overlay, no un negro crudo", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Tu nueva API key</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).toHaveClass("bg-overlay");
    expect(overlay?.className).not.toMatch(/bg-black/);
  });

  it("la X y el botón de cerrar reciben su texto por prop", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent closeLabel="Cerrar">
          <DialogTitle>Tu nueva API key</DialogTitle>
          <DialogFooter showCloseButton closeLabel="Listo" />
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listo" })).toBeInTheDocument();
    expect(screen.queryByText("Close")).toBeNull();
  });
});

describe("Pagination", () => {
  function renderPagination() {
    return render(
      <Pagination aria-label="Páginas de requests">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="?page=1" text="Anterior" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="?page=1">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="?page=2" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="?page=3" text="Siguiente" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
  }

  it("es una navegación con nombre propio, no 'pagination' fijo", () => {
    renderPagination();
    expect(
      screen.getByRole("navigation", { name: "Páginas de requests" }),
    ).toBeInTheDocument();
  });

  it("todos los elementos son links reales con href, sin role=button", () => {
    renderPagination();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href");
      expect(link).not.toHaveAttribute("role");
      expect(link).toHaveClass("tabular-nums");
    }
  });

  it("la página actual lleva aria-current y estilo outline", () => {
    renderPagination();
    const current = screen.getByRole("link", { name: "2" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("border-border");
    expect(screen.getByRole("link", { name: "1" })).not.toHaveAttribute("aria-current");
  });

  it("Anterior y Siguiente toman su nombre del texto, que solo se oculta visualmente en móvil", () => {
    renderPagination();
    expect(screen.getByRole("link", { name: "Anterior" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Siguiente" })).toBeInTheDocument();
    expect(screen.getByText("Anterior")).toHaveClass("max-sm:sr-only");
    expect(screen.queryByText(/Go to|More pages|Previous|Next/)).toBeNull();
  });

  it("los íconos son decorativos", () => {
    const { container } = renderPagination();
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

describe("Slider", () => {
  it("el pulgar usa bg-background, no bg-white", () => {
    const { container } = render(<Slider defaultValue={[2]} min={1} max={20} aria-label="Umbral" />);
    const thumb = container.querySelector('[data-slot="slider-thumb"]');
    expect(thumb).toHaveClass("bg-background");
    expect(thumb).not.toHaveClass("bg-white");
  });
});

describe("Table", () => {
  it("sin regionLabel el contenedor no agrega una parada de tabulación", async () => {
    const { Table, TableBody, TableRow, TableCell } = await import("@/components/ui/table");
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper).not.toHaveAttribute("tabindex");
    expect(wrapper).not.toHaveAttribute("role");
  });

  it("con regionLabel es una región con nombre que se enfoca para desplazarse", async () => {
    const { Table, TableBody, TableRow, TableCell } = await import("@/components/ui/table");
    render(
      <Table regionLabel="Modelos">
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const region = screen.getByRole("region", { name: "Modelos" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-x-auto", "focus-visible:ring-3");
  });
});
