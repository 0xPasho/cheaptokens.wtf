import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const labels = { trigger: "Tema", light: "Claro", dark: "Oscuro", system: "Sistema" };

describe("ThemeToggle", () => {
  it("es un botón de ícono con nombre accesible", () => {
    render(<ThemeToggle labels={labels} />);
    expect(screen.getByRole("button", { name: "Tema" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("marca system como opción actual cuando no hay preferencia", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle labels={labels} />);
    await user.click(screen.getByRole("button", { name: "Tema" }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Sistema" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("elegir Oscuro aplica .dark, lo guarda y cierra el menú", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle labels={labels} />);
    await user.click(screen.getByRole("button", { name: "Tema" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Oscuro" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("elegir Claro quita .dark", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.classList.add("dark");
    const user = userEvent.setup();
    render(<ThemeToggle labels={labels} />);
    await user.click(screen.getByRole("button", { name: "Tema" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Claro" }));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
