"use client";

import { useState } from "react";

import { ProviderLogo } from "@/components/catalog/provider-logo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Lo justo de un modelo para el precio del hero, ya formateado en el servidor: el catálogo no viaja al navegador. */
export type HeroModel = {
  id: string;
  name: string;
  author: string;
  official: string;
  ours: string;
  /** «Ahorras 7,10 US$ (−71 %)». Dinero a favor del usuario: el único color del hero (docs/13 › Color). */
  savings: string;
};

/**
 * El hero es el precio: el oficial tachado y el nuestro, en grande, del modelo que elijas. Los dos montos van
 * con sus etiquetas para lectores de pantalla, porque el tachado no se anuncia.
 */
export function HeroPrice({ models, labels }: {
  models: HeroModel[];
  labels: { model: string; perMillion: string; official: string; ours: string };
}) {
  const [selected, setSelected] = useState(models[0]?.id ?? "");
  const model = models.find((candidate) => candidate.id === selected) ?? models[0];
  if (!model) return null;

  return (
    <div className="nr-mk-hero-price">
      <p className="nr-mk-hero-figures" aria-live="polite">
        <s className="nr-mk-hero-official"><span className="sr-only">{labels.official}: </span>{model.official}</s>
        <span className="nr-mk-hero-ours"><span className="sr-only">{labels.ours}: </span>{model.ours}</span>
      </p>
      <p className="nr-mk-hero-caption">
        <span>{labels.perMillion} · {model.name}</span>
        <span className="nr-mk-hero-savings">{model.savings}</span>
      </p>
      <ToggleGroup
        className="nr-mk-model-picker"
        aria-label={labels.model}
        value={[model.id]}
        onValueChange={(value) => value[0] && setSelected(value[0])}
      >
        {models.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id}>
            <ProviderLogo author={option.author} />
            {option.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
