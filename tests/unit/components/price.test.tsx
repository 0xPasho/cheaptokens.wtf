import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiscountBadge } from "@/components/discount-badge";
import { Price, PriceComparison } from "@/components/price";

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

describe("Price", () => {
  it("formatea µUSD con el idioma y usa números tabulares", () => {
    const { container } = render(<Price micros={18_420_000} locale="en" />);
    const price = container.firstElementChild;
    expect(price).toHaveTextContent("$18.42");
    expect(price).toHaveClass("tabular-nums");
  });

  it("respeta el tipo de monto", () => {
    render(<Price micros={1_350} locale="es" kind="cost" />);
    expect(plain(screen.getByText(/0,00135/).textContent)).toBe("0,00135 US$");
  });
});

describe("PriceComparison", () => {
  const renderComparison = () =>
    render(
      <PriceComparison
        official={3_000_000}
        discounted={300_000}
        locale="en"
        labels={{ official: "Precio oficial", discounted: "Precio cheaptokens.wtf" }}
      />,
    );

  it("tacha el precio oficial con <s> y en muted-foreground", () => {
    const { container } = renderComparison();
    const official = container.querySelector("s");
    expect(official).toHaveTextContent("$3.00");
    expect(official).toHaveClass("text-muted-foreground");
  });

  it("el precio cheaptokens.wtf va en el color del texto, no en verde", () => {
    const { container } = renderComparison();
    const discounted = container.querySelector("s + span");
    expect(discounted).toHaveTextContent("$0.30");
    expect(discounted).toHaveClass("text-foreground", "font-medium");
    expect(discounted?.className).not.toMatch(/success/);
  });

  it("anuncia qué precio es cada uno al lector de pantalla", () => {
    const { container } = renderComparison();
    const labels = [...container.querySelectorAll(".sr-only")].map((el) => el.textContent);
    expect(labels).toEqual(["Precio oficial: ", "Precio cheaptokens.wtf: "]);
  });

  it("no parte la línea y alinea los dígitos", () => {
    const { container } = renderComparison();
    expect(container.firstElementChild).toHaveClass("whitespace-nowrap", "tabular-nums");
  });
});

describe("DiscountBadge", () => {
  it("muestra el descuento con signo menos tipográfico en el tono success", () => {
    render(<DiscountBadge discountBps={9000} locale="en" />);
    const badge = screen.getByText("−90%");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveClass("text-success", "bg-success/10", "tabular-nums");
  });

  it("un modelo sin descuento muestra 0%, nunca −0%", () => {
    render(<DiscountBadge discountBps={0} locale="en" />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
