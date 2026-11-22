import { cn } from "@/lib/utils";

/**
 * El logo de texto: «cheapllm.» sobrio y el «wtf» animado (Comic Sans, arcoíris y letras que se menean).
 * Lo usan la cabecera y el pie, así que los dos se mueven igual. El estilo vive en `nibblerouter.css`.
 */
export function BrandWordmark({ base, tld, className }: { base: string; tld: string; className?: string }) {
  return (
    <span className={cn("nr-wordmark", className)}>
      {base}
      <span className="nr-brand-accent">
        {Array.from(tld).map((letter, index) => (
          <span key={`${index}-${letter}`}>{letter}</span>
        ))}
      </span>
    </span>
  );
}
