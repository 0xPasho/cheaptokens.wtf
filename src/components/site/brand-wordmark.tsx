import { cn } from "@/lib/utils";

/**
 * El logo de texto: «cheapllm.» sobrio y el «wtf» animado (Comic Sans, arcoíris y letras que se menean).
 * Lo usan la cabecera y el pie, así que los dos se mueven igual. El estilo vive en `nibblerouter.css`.
 */
export function BrandWordmark({ base, tld, className }: { base: string; tld: string; className?: string }) {
  return (
    <span className={cn("nr-wordmark", className)}>
      {base}
      <WtfLetters text={tld} />
    </span>
  );
}

/** Un texto con el efecto del «wtf»: cada letra en arcoíris y meneándose. Lo usan el logo y el plan Max en /pricing. */
export function WtfLetters({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("nr-brand-accent", className)}>
      {Array.from(text).map((letter, index) => (
        <span key={`${index}-${letter}`}>{letter}</span>
      ))}
    </span>
  );
}
