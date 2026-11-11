"use client";

import { useLayoutEffect } from "react";

import {
  applyTheme,
  readStoredTheme,
  subscribeToSystemTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

/**
 * Mantiene la clase `.dark` de `<html>` al día después de la hidratación:
 * - la vuelve a poner si React la borra en el remount de Strict Mode (solo dev);
 * - sigue al sistema operativo cuando la preferencia es `system`;
 * - sincroniza otras pestañas.
 *
 * El primer paint lo resuelve `themeScript` en `<head>`.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readStoredTheme());

    const unsubscribeSystem = subscribeToSystemTheme(() => {
      if (readStoredTheme() === "system") applyTheme("system");
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyTheme(readStoredTheme());
    };
    window.addEventListener("storage", onStorage);

    return () => {
      unsubscribeSystem();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
