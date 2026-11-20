"use client";

import { createContext, useContext } from "react";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type StatusCopy = { locale: Locale; error: Dictionary["status"]["error"] };

const StatusCopyContext = createContext<StatusCopy | null>(null);

/**
 * Los textos del límite de error. `error.tsx` es de cliente y no recibe props del layout: así no importa los
 * diccionarios completos al bundle. Lo pone el layout del sitio por encima de los límites.
 */
export function StatusCopyProvider({ value, children }: { value: StatusCopy; children: React.ReactNode }) {
  return <StatusCopyContext value={value}>{children}</StatusCopyContext>;
}

export function useStatusCopy(): StatusCopy {
  const value = useContext(StatusCopyContext);
  if (!value) throw new Error("useStatusCopy must be used inside StatusCopyProvider");
  return value;
}
