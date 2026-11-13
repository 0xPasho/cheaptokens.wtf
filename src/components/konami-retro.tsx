"use client";

import { useEffect, useRef, useState } from "react";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import { advanceKonami, applyRetro, KONAMI_KEYS, readStoredRetro, RETRO_STORAGE_KEY } from "@/lib/retro";

const BANNER_MS = 4_000;

/**
 * El código Konami (↑↑↓↓←→←→BA Enter) alterna el modo retro de toda la web.
 * El primer paint lo resuelve `retroScript`; aquí se restaura tras hidratar,
 * se escucha la secuencia y se sincroniza entre pestañas.
 */
export function KonamiRetro({ dict }: { dict: Dictionary }) {
  const progress = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    applyRetro(readStoredRetro());
    const onStorage = (event: StorageEvent) => {
      if (event.key === RETRO_STORAGE_KEY) applyRetro(readStoredRetro());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return;
      const next = advanceKonami(event.key, progress.current);
      if (next === KONAMI_KEYS.length) {
        progress.current = 0;
        const on = !document.documentElement.classList.contains("retro-party");
        applyRetro(on);
        setMessage(on ? dict.retro.on : dict.retro.off);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setMessage(null), BANNER_MS);
        return;
      }
      progress.current = next;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dict]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center">
      {message && <p className="retro-banner">{message}</p>}
    </div>
  );
}
