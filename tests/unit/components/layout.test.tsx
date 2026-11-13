import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Container } from "@/components/container";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Stat } from "@/components/stat";

describe("Container", () => {
  it("default: max-w-[1440px] con márgenes laterales", () => {
    const { container } = render(<Container>x</Container>);
    expect(container.firstElementChild).toHaveClass("mx-auto", "max-w-[1440px]", "px-4", "sm:px-6");
  });

  it("prose: max-w-3xl para texto largo", () => {
    const { container } = render(<Container size="prose">x</Container>);
    expect(container.firstElementChild).toHaveClass("max-w-3xl");
    expect(container.firstElementChild).not.toHaveClass("max-w-[1440px]");
  });
});

describe("PageHeader y SectionHeader", () => {
  it("PageHeader es el h1 de la página, con descripción y acciones", () => {
    render(
      <PageHeader
        title="API keys"
        description="Crea y revoca tus keys."
        actions={<button type="button">Crear key</button>}
      />,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "API keys" });
    expect(h1).toHaveClass("font-heading", "text-2xl", "font-semibold", "text-balance");
    expect(screen.getByText("Crea y revoca tus keys.")).toHaveClass(
      "text-muted-foreground",
      "text-pretty",
    );
    expect(screen.getByRole("button", { name: "Crear key" })).toBeInTheDocument();
  });

  it("SectionHeader es un h2 un nivel abajo", () => {
    render(<SectionHeader title="Historial de recargas" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Historial de recargas" }),
    ).toHaveClass("text-lg", "font-semibold");
  });

  it("sin descripción ni acciones no deja nodos vacíos", () => {
    const { container } = render(<PageHeader title="Uso" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("Stat", () => {
  it("cifra grande y ligera (ref 12) con números tabulares y etiqueta arriba", () => {
    render(<Stat label="Saldo" value="$18.42" hint="Actualizado ahora" />);
    const value = screen.getByText("$18.42");
    expect(value).toHaveClass("text-4xl", "font-light", "tabular-nums");
    expect(value).not.toHaveClass("text-success");
    expect(screen.getByText("Saldo")).toHaveClass("text-xs", "text-muted-foreground");
  });

  it("tone success solo pinta la cifra (para el ahorro)", () => {
    render(<Stat label="Ahorro" value="$59.22" tone="success" />);
    expect(screen.getByText("$59.22")).toHaveClass("text-success");
    expect(screen.getByText("Ahorro")).not.toHaveClass("text-success");
  });
});

describe("QuickstartSnippet", () => {
  const props = {
    baseUrl: "https://api.cheaptokens.wtf/v1",
    apiKey: "wtf_abc",
    model: "anthropic/claude-haiku-4.5",
  };

  it("tiene una pestaña por lenguaje, en este orden", () => {
    render(<QuickstartSnippet {...props} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Python",
      "JavaScript",
      "curl",
    ]);
  });

  it("abre en Python con la base URL, la key y el modelo ya puestos", () => {
    render(<QuickstartSnippet {...props} />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent('base_url="https://api.cheaptokens.wtf/v1"');
    expect(panel).toHaveTextContent('api_key="wtf_abc"');
    expect(panel).toHaveTextContent('model="anthropic/claude-haiku-4.5"');
  });

  it("puede abrir en otro lenguaje", () => {
    render(<QuickstartSnippet {...props} defaultLanguage="curl" />);
    expect(screen.getByRole("tab", { name: "curl" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "curl https://api.cheaptokens.wtf/v1/chat/completions",
    );
  });
});

describe("Stat size", () => {
  it("sm baja la cifra a text-2xl para cards angostas", () => {
    render(<Stat label="Con cheaptokens.wtf" value="$0.00135" size="sm" />);
    const value = screen.getByText("$0.00135");
    expect(value).toHaveClass("text-2xl");
    expect(value).not.toHaveClass("text-4xl");
  });
});
