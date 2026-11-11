import { SectionHeader } from "@/components/page-header";
import { Separator } from "@/components/ui/separator";

/** Grupo de la página (`h2`): Fundamentos, Producto, Átomos. */
export function Group({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-8 flex-col gap-10">
      <div className="flex flex-col gap-6">
        <Separator />
        <SectionHeader title={title} description={description} />
      </div>
      {children}
    </section>
  );
}

/** Un patrón o átomo (`h3`). */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // data-section: las pruebas e2e escanean y capturan cada sección por separado.
    <section data-section={title} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
