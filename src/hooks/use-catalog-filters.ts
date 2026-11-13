"use client";

import { useSyncExternalStore } from "react";

import type { SortKey } from "@/lib/catalog/queries";
import { MODEL_TAGS, type ModelTag } from "@/lib/catalog/tags";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("catalog-change", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("catalog-change", callback);
  };
}

export function useCatalogFilters() {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const query = params.get("q") ?? "";
  const author = params.get("author") ?? "";
  const tags = (params.get("tags") ?? "").split(",").filter((tag): tag is ModelTag => MODEL_TAGS.includes(tag as ModelTag));
  const rawSort = params.get("sort");
  const sort: SortKey = rawSort === "output" || rawSort === "name" ? rawSort : "discount";
  const view = params.get("view") === "list" ? "list" : "grid";

  function update(values: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("catalog-change"));
  }

  return { query, author, tags, sort, view, search, ready, update };
}
