"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Option = { value: string; label: string };

/** Filtros de la tabla de uso: viven en la URL para poder compartir la vista (docs/02 › Uso). */
export function UsageFilters({ ranges, keys, models, sources, labels }: {
  ranges: Option[];
  keys: Option[];
  models: Option[];
  sources: Option[];
  labels: { range: string; key: string; model: string; source: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "" || value === "all" || (name === "range" && value === "7d")) next.delete(name);
    else next.set(name, value);
    next.delete("page");
    const query = next.toString();
    startTransition(() => router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  };
  const select = (name: string, label: string, options: Option[]) => (
    <NativeSelect aria-label={label} value={params.get(name) ?? "all"} onChange={(event) => update(name, event.target.value)} className="w-auto">
      {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
    </NativeSelect>
  );
  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <ToggleGroup
        spacing={1}
        value={[params.get("range") ?? "7d"]}
        onValueChange={(value) => { if (value[0]) update("range", value[0]); }}
        aria-label={labels.range}
        className="glass-control p-1"
      >
        {ranges.map((range) => <ToggleGroupItem key={range.value} value={range.value}>{range.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {select("key", labels.key, keys)}
      {select("model", labels.model, models)}
      {select("source", labels.source, sources)}
    </div>
  );
}
