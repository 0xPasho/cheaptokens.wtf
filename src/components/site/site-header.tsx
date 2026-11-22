"use client";
import BookOpenIcon from "kubai-icons-react/icons/book-open";
import CircleHelpIcon from "kubai-icons-react/icons/circle-help";
import GridIcon from "kubai-icons-react/icons/grid";
import MenuIcon from "kubai-icons-react/icons/menu";
import SearchIcon from "kubai-icons-react/icons/search";
import TagIcon from "kubai-icons-react/icons/tag";
import WorkflowIcon from "kubai-icons-react/icons/workflow";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ThemeMenuOptions, ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { getKeyHref } from "@/lib/auth/redirect";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const noSubscription = () => () => {};
/** En Mac el atajo se escribe con ⌘. En el servidor no se sabe: se pinta Ctrl y el cliente lo corrige. */
const isApplePlatform = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * `account` es el control de cuenta de la cabecera; `menuAccount`, el mismo control como entrada del menú
 * móvil (entrar, si no hay sesión).
 */
export function SiteHeader({ locale, dict, account, menuAccount }: {
  locale: Locale; dict: Dictionary; account: React.ReactNode; menuAccount: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const filters = useCatalogFilters();
  const input = useRef<HTMLInputElement>(null);
  const isDocs = pathname.includes("/docs");
  const isModels = pathname.includes("/models");
  const isPricing = pathname.endsWith("/pricing");
  const apple = useSyncExternalStore(noSubscription, isApplePlatform, () => false);
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") ||
        (event.key === "/" && !target.closest("input, textarea, [contenteditable]"))) {
        event.preventDefault(); input.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  return (
    <header className="nr-topbar">
      <div className="nr-header-leading">
        <Link href={`/${locale}`} className="nr-brand-button" aria-label={dict.nav.home}>
          {dict.meta.brandBase}
          <span className="nr-brand-accent">
            {Array.from(dict.meta.brandTld).map((letter, index) => (
              <span key={`${index}-${letter}`}>{letter}</span>
            ))}
          </span>
        </Link>
        <nav className="nr-desktop-nav" aria-label={dict.nav.label}>
          <Link href={`/${locale}/models`} className={isModels ? "nr-active" : undefined} aria-current={isModels ? "page" : undefined}>{dict.nav.models}</Link>
          <Link href={`/${locale}/pricing`} className={isPricing ? "nr-active" : undefined} aria-current={isPricing ? "page" : undefined}>{dict.nav.pricing}</Link>
          <Link href={`/${locale}#why`} className="nr-nav-anchor">{dict.nav.howItWorks}</Link>
          <Link href={`/${locale}/docs`} className={isDocs ? "nr-active" : undefined} aria-current={isDocs ? "page" : undefined}>{dict.nav.docs}</Link>
        </nav>
      </div>
      <form className="nr-search-box" onSubmit={(event) => { event.preventDefault(); router.push(`/${locale}/models${filters.search}`); }}>
        <SearchIcon size={16} aria-hidden />
        <input ref={input} type="search" name="q" value={filters.query} placeholder={dict.catalog.headerSearch}
          disabled={!filters.ready} aria-label={dict.catalog.searchLabel} aria-keyshortcuts="Control+k Meta+k /"
          onChange={(event) => filters.update({ q: event.target.value })} />
        <kbd>{apple ? "⌘K" : "Ctrl K"}</kbd>
      </form>
      <div className="nr-header-actions">
        <ThemeToggle labels={dict.theme} className="nr-icon-button nr-theme-button" />
        <Link href={getKeyHref(locale)} className={buttonVariants({ variant: "secondary", className: "nr-pill-button" })}>{dict.nav.getKey}</Link>
        {account}
        <MobileMenu locale={locale} dict={dict} account={menuAccount} />
      </div>
    </header>
  );
}

/**
 * Menú de la cabecera en pantallas angostas (≤ 860 px), donde no caben la navegación, la búsqueda ni «Entrar».
 * El tema también vive aquí: su botón propio se oculta para dejar sitio a la cuenta.
 */
function MobileMenu({ locale, dict, account }: { locale: Locale; dict: Dictionary; account: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="nr-icon-button nr-mobile-menu" aria-label={dict.nav.menu} />}>
        <MenuIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          {/* Con ícono, como el menú de cuenta y el tema: todas las etiquetas empiezan en la misma columna. */}
          <DropdownMenuItem render={<Link href={`/${locale}/models`} />}><GridIcon aria-hidden />{dict.nav.models}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/pricing`} />}><TagIcon aria-hidden />{dict.nav.pricing}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}#why`} />}><WorkflowIcon aria-hidden />{dict.nav.howItWorks}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/docs`} />}><BookOpenIcon aria-hidden />{dict.nav.docs}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/faq`} />}><CircleHelpIcon aria-hidden />{dict.nav.faq}</DropdownMenuItem>
        </DropdownMenuGroup>
        {account}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{dict.theme.trigger}</DropdownMenuLabel>
          <ThemeMenuOptions labels={dict.theme} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
