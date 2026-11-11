import type { Metadata } from "next";

import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

import { Atoms } from "./_sections/atoms";
import { Foundations } from "./_sections/foundations";
import { Material } from "./_sections/material";
import { ProductPatterns } from "./_sections/product";

export const metadata: Metadata = {
  title: "Sistema de diseño",
};

const SECTIONS = [
  { id: "fundamentos", label: "Fundamentos" },
  { id: "material", label: "Material" },
  { id: "producto", label: "Producto" },
  { id: "atomos", label: "Átomos" },
];

export default function DesignSystemPage() {
  return (
    <main className="flex flex-1 flex-col py-12 sm:py-16">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Sistema de diseño"
            description={
              <>
                La referencia viva del estándar visual de cheaptokens.wtf. Las
                reglas están en{" "}
                <code className="font-mono text-xs">
                  docs/13-sistema-de-diseno.md
                </code>
                .
              </>
            }
            actions={
              <ThemeToggle
                labels={{
                  trigger: "Tema",
                  light: "Claro",
                  dark: "Oscuro",
                  system: "Sistema",
                }}
              />
            }
          />
          <nav aria-label="Secciones" className="-ml-2.5 flex flex-wrap gap-1">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>

        <Foundations />
        <Material />
        <ProductPatterns />
        <Atoms />
      </Container>
    </main>
  );
}
