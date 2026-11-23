"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { ModelLogo, providerName } from "@/components/catalog/provider-logo";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  // Lo elegido se ve al instante; la URL (y la tabla) llegan cuando responde el servidor.
  const [query, setQuery] = useOptimistic(params.toString());
  const current = new URLSearchParams(query);
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(current);
    if (value === "" || value === "all" || (name === "range" && value === "7d")) next.delete(name);
    else next.set(name, value);
    next.delete("page");
    const nextQuery = next.toString();
    startTransition(() => {
      setQuery(nextQuery);
      router.push(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    });
  };
  const select = (name: string, label: string, options: Option[]) => (
    <NativeSelect aria-label={label} value={current.get(name) ?? "all"} onChange={(event) => update(name, event.target.value)} className="w-auto">
      {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
    </NativeSelect>
  );
  // Los modelos, con su logo y agrupados por proveedor: un select nativo no puede mostrar imágenes.
  const [allModels, ...catalog] = models;
  const groups = new Map<string, Option[]>();
  for (const option of catalog) {
    const author = option.value.split("/")[0];
    groups.set(author, [...(groups.get(author) ?? []), option]);
  }
  const modelLabel = new Map(models.map((option) => [option.value, option.label]));
  const model = current.get("model") ?? "all";
  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <ToggleGroup
        spacing={1}
        value={[current.get("range") ?? "7d"]}
        onValueChange={(value) => { if (value[0]) update("range", value[0]); }}
        aria-label={labels.range}
        className="glass-control p-1"
      >
        {ranges.map((range) => <ToggleGroupItem key={range.value} value={range.value}>{range.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {select("key", labels.key, keys)}
      <Select value={model} onValueChange={(value) => update("model", value ?? "all")}>
        <SelectTrigger aria-label={labels.model} className="min-w-48">
          <SelectValue>
            {(value: string) => (
              <>
                {value === "all" ? null : <ModelLogo modelId={value} />}
                <span className="truncate">{modelLabel.get(value) ?? value}</span>
              </>
            )}
          </SelectValue>
        </SelectTrigger>
        {/* Se abre debajo del botón: con muchos modelos, alinear el elegido con el botón lo subía por encima. */}
        <SelectContent alignItemWithTrigger={false} align="start" className="max-h-[min(24rem,var(--available-height))]">
          <SelectItem value={allModels.value}>{allModels.label}</SelectItem>
          {[...groups].toSorted(([a], [b]) => providerName(a).localeCompare(providerName(b))).map(([author, options]) => (
            <SelectGroup key={author}>
              {/* Sin línea entre proveedores: el nombre del grupo y su espacio arriba ya los separan. */}
              <SelectLabel>{providerName(author)}</SelectLabel>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}><ModelLogo modelId={option.value} /><span className="truncate">{option.label}</span></SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {select("source", labels.source, sources)}
    </div>
  );
}
