import { cn } from "@/lib/utils";

/**
 * Una sección de las páginas que explican el producto (landing, /pricing y /faq): antetítulo,
 * `h2` grande, una línea de contexto y, si hace falta, un link. ADR-0060.
 */
export function MarketingSection({
  id,
  eyebrow,
  title,
  description,
  action,
  className,
  headClassName,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  headClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("nr-mk-section", className)}>
      <div className={cn("nr-mk-head", headClassName)}>
        {eyebrow ? <p className="nr-mk-eyebrow">{eyebrow}</p> : null}
        <h2 id={`${id}-title`} className="nr-mk-title">{title}</h2>
        {description ? <p className="nr-mk-sub">{description}</p> : null}
        {action}
      </div>
      {children}
    </section>
  );
}

/** Un link de texto con flecha, para «Ver todas las preguntas» y parecidos. */
export function ArrowLabel({ children }: { children: React.ReactNode }) {
  return <><span>{children}</span><span className="nr-mk-arrow" aria-hidden>→</span></>;
}
