"use client";

import EyeIcon from "kubai-icons-react/icons/eye";
import EyeOffIcon from "kubai-icons-react/icons/eye-off";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Separadores que se dejan a la vista para que se entienda qué es: `@`, `.`, `_`, `:` y `-`. */
const SEPARATOR = /[@._:-]/;
/** Lo más largo que se dibuja un tramo oculto: no se adivina el largo real. */
const MAX_RUN = 8;

/**
 * El valor con sus letras cambiadas por puntos y los separadores a la vista: `demo@cheapllm.wtf` → `••••@••••••••.•••`.
 * Un prefijo de tipo (`dev:`, `user_`) queda visible: dice de dónde es la cuenta sin decir cuál.
 */
export function maskSensitive(value: string): string {
  const prefix = /^(dev:|user_)/.exec(value)?.[0] ?? "";
  let out = prefix;
  let run = 0;
  for (const char of value.slice(prefix.length)) {
    if (SEPARATOR.test(char)) {
      out += char;
      run = 0;
    } else if (run < MAX_RUN) {
      out += "•";
      run += 1;
    }
  }
  return out;
}

/**
 * Un dato sensible (correo, ID de cuenta) oculto hasta que se pide verlo con el ojo: así no aparece en una captura
 * ni al compartir pantalla. Empieza oculto también en el servidor, para que la primera pintura no lo muestre.
 */
export function SensitiveValue({ value, showLabel, hideLabel, hiddenLabel, className }: {
  value: string;
  /** «Mostrar el correo» */
  showLabel: string;
  /** «Ocultar el correo» */
  hideLabel: string;
  /** Lo que lee el lector de pantalla mientras está oculto: «Oculto». */
  hiddenLabel: string;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {shown ? <span className="truncate">{value}</span> : (
        <>
          <span className="truncate select-none" aria-hidden>{maskSensitive(value)}</span>
          <span className="sr-only">{hiddenLabel}</span>
        </>
      )}
      <button
        type="button"
        onClick={() => setShown((current) => !current)}
        aria-label={shown ? hideLabel : showLabel}
        aria-pressed={shown}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-glass-control-hover hover:text-foreground"
      >
        {shown ? <EyeOffIcon size={16} aria-hidden /> : <EyeIcon size={16} aria-hidden />}
      </button>
    </span>
  );
}
