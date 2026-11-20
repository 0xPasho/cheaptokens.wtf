"use client";

import { createContext, use, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EstimatorContext = createContext<{ model: string; setModel: (model: string) => void }>({ model: "", setModel: () => {} });

/** Guarda con qué modelo se calculan las requests típicas de los planes. */
export function EstimatorProvider({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [model, setModel] = useState(initial);
  return <EstimatorContext value={{ model, setModel }}>{children}</EstimatorContext>;
}

export function EstimatorSelect({ options, label }: { options: { value: string; label: string }[]; label: string }) {
  const { model, setModel } = use(EstimatorContext);
  return (
    <Select items={options} value={model} onValueChange={(value) => value && setModel(value)}>
      <SelectTrigger aria-label={label} className="nr-mk-select"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Un texto que depende del modelo elegido. Llega ya formateado para cada modelo. */
export function Estimate({ values }: { values: Record<string, string> }) {
  const { model } = use(EstimatorContext);
  return <>{values[model]}</>;
}
