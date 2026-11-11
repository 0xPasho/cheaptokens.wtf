import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { ModelId } from "@/components/model-id";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe("CopyButton", () => {
  it("es un botón con nombre accesible aunque solo muestre el ícono", () => {
    render(<CopyButton value="x" copyLabel="Copiar" copiedLabel="Copiado" />);
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
  });

  it("copia el valor, confirma y vuelve a su estado a los 2 s", async () => {
    vi.useFakeTimers();
    render(<CopyButton value="wtf_123" copyLabel="Copiar" copiedLabel="Copiado" />);

    await click(screen.getByRole("button", { name: "Copiar" }));

    expect(writeText).toHaveBeenCalledWith("wtf_123");
    expect(screen.getByRole("button", { name: "Copiado" })).toBeInTheDocument();
    // La confirmación se anuncia en una región aria-live, fuera del botón.
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent("Copiado");
    expect(live?.closest("button")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
    expect(live).toHaveTextContent("");
  });

  it("si el portapapeles falla, no dice que copió", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    render(<CopyButton value="x" copyLabel="Copiar" copiedLabel="Copiado" />);

    await click(screen.getByRole("button", { name: "Copiar" }));

    expect(screen.queryByRole("button", { name: "Copiado" })).toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("");
  });

  it("con showLabel el texto es visible", () => {
    render(<CopyButton value="x" copyLabel="Copiar key" showLabel />);
    const button = screen.getByRole("button", { name: "Copiar key" });
    expect(button).toHaveTextContent("Copiar key");
    expect(button).not.toHaveAttribute("aria-label");
  });

  it("usa textos en inglés por default (hasta que existan los diccionarios)", () => {
    render(<CopyButton value="x" />);
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});

describe("CodeBlock", () => {
  it("muestra el código en mono sin cortar líneas y copia el bloque completo", async () => {
    const code = "curl https://api.cheaptokens.wtf/v1/models";
    const { container } = render(<CodeBlock code={code} copyLabel="Copiar" />);

    const pre = container.querySelector("pre");
    expect(pre).toHaveClass("font-mono", "overflow-x-auto");
    expect(pre).toHaveTextContent(code);

    await click(screen.getByRole("button", { name: "Copiar" }));
    expect(writeText).toHaveBeenCalledWith(code);
  });
});

describe("ModelId", () => {
  it("muestra el ID en mono y lo copia", async () => {
    render(<ModelId id="anthropic/claude-haiku-4.5" copyLabel="Copiar ID" />);

    const id = screen.getByText("anthropic/claude-haiku-4.5");
    expect(id.tagName).toBe("CODE");
    expect(id).toHaveClass("font-mono", "truncate");

    await click(screen.getByRole("button", { name: "Copiar ID" }));
    expect(writeText).toHaveBeenCalledWith("anthropic/claude-haiku-4.5");
  });
});

describe("CodeBlock con teclado", () => {
  it("el bloque se puede enfocar para desplazarlo con las flechas", () => {
    const { container } = render(<CodeBlock code="x" />);
    expect(container.querySelector("pre")).toHaveAttribute("tabindex", "0");
  });
});
