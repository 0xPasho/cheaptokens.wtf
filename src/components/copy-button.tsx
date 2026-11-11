"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CopyButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "children"
> & {
  value: string;
  /** Texto del botón, o su `aria-label` si solo muestra el ícono. */
  copyLabel?: string;
  /** Lo que se anuncia (y se muestra con `showLabel`) después de copiar. */
  copiedLabel?: string;
  showLabel?: boolean;
};

const RESET_AFTER_MS = 2000;

/** Copia `value` al portapapeles y confirma con un check durante 2 s. */
export function CopyButton({
  value,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  showLabel = false,
  variant = "ghost",
  size,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), RESET_AFTER_MS);
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  const text = copied ? copiedLabel : copyLabel;

  return (
    <>
      <Button
        variant={variant}
        size={size ?? (showLabel ? "sm" : "icon-sm")}
        aria-label={showLabel ? undefined : text}
        onClick={copy}
        {...props}
      >
        <Icon data-icon={showLabel ? "inline-start" : undefined} />
        {showLabel ? text : null}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
