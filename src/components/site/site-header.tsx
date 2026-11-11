import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Navegación flotante en la capa de vidrio (Apple: la navegación va en vidrio, el contenido
 * pasa por debajo). glass-surface está medido para que el texto se lea con lo que pase detrás.
 */
export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 rounded-full glass-surface py-2 pr-2 pl-5">
        <Link
          href={`/${locale}`}
          aria-label={dict.nav.home}
          className="rounded-full font-heading text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dict.meta.siteName}
        </Link>
        <nav aria-label={dict.nav.label} className="ml-1 flex items-center gap-1 sm:ml-4">
          <Link
            href={`/${locale}/models`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {dict.nav.models}
          </Link>
          <Link
            href={`/${locale}#how-it-works`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-sm:hidden")}
          >
            {dict.nav.howItWorks}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle labels={dict.theme} />
          <Link
            href={`/${locale}#how-it-works`}
            className={buttonVariants({ size: "sm" })}
          >
            {dict.nav.getKey}
          </Link>
        </div>
      </div>
    </header>
  );
}
