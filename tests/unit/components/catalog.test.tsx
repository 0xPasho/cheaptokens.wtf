import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MODEL_TAG_ICONS, ModelTagBadge } from "@/components/model-tag";
import { MODEL_TAGS } from "@/lib/catalog/tags";

describe("ModelTagBadge", () => {
  it("cada tag de la lista fija tiene un ícono distinto", () => {
    const icons = MODEL_TAGS.map((tag) => MODEL_TAG_ICONS[tag]);
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(MODEL_TAGS.length);
  });

  it.each(MODEL_TAGS)("%s: badge de vidrio sin color, con ícono decorativo", (tag) => {
    render(<ModelTagBadge tag={tag} label={`etiqueta ${tag}`} />);
    const badge = screen.getByText(`etiqueta ${tag}`);
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveClass("glass-control", "text-foreground");
    // Sin color en reposo (la base sí trae aria-invalid:border-destructive, que no aplica aquí).
    expect(badge.className).not.toMatch(/(^|\s)(bg|text|border)-(success|warning|destructive)/);

    const icon = badge.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
