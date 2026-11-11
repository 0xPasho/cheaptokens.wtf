import { cn } from "@/lib/utils";

type HeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acciones a la derecha. Como máximo una con variante `default` (ver docs/13). */
  actions?: React.ReactNode;
  className?: string;
};

/** El `h1` de cada página, con descripción y acciones opcionales. Uno por página. */
export function PageHeader({ title, description, actions, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** El `h2` de una sección dentro de una página. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: HeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold tracking-tight text-balance">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
