"use client";
import BookOpenIcon from "kubai-icons-react/icons/book-open";
import CircleHelpIcon from "kubai-icons-react/icons/circle-help";
import GridIcon from "kubai-icons-react/icons/grid";
import MenuIcon from "kubai-icons-react/icons/menu";
import SearchIcon from "kubai-icons-react/icons/search";
import TagIcon from "kubai-icons-react/icons/tag";
import WorkflowIcon from "kubai-icons-react/icons/workflow";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getKeyHref } from "@/lib/auth/redirect";
import type { SearchModel } from "@/lib/catalog/search";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { BrandWordmark } from "./brand-wordmark";
import { SiteSearch } from "./site-search";

const noSubscription = () => () => {};
/** En Mac el atajo se escribe con ⌘. En el servidor no se sabe: se pinta Ctrl y el cliente lo corrige. */
const isApplePlatform = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * `account` es el control de cuenta de la cabecera; `menuAccount`, el mismo control como entrada del menú
 * móvil (entrar, si no hay sesión). `models` alimenta la búsqueda (⌘K).
 */
export function SiteHeader({ locale, dict, account, menuAccount, models }: {
  locale: Locale; dict: Dictionary; account: React.ReactNode; menuAccount: React.ReactNode; models: SearchModel[];
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const isDocs = pathname.includes("/docs");
  const isModels = pathname.includes("/models");
  const isPricing = pathname.endsWith("/pricing");
  const isHow = pathname.endsWith("/how-it-works");
  const apple = useSyncExternalStore(noSubscription, isApplePlatform, () => false);
  return (
    <header className="nr-topbar">
      <div className="nr-header-leading">
        <Link href={`/${locale}`} className="nr-brand-button" aria-label={dict.nav.home}>
          <BrandWordmark base={dict.meta.brandBase} tld={dict.meta.brandTld} />
        </Link>
        <nav className="nr-desktop-nav" aria-label={dict.nav.label}>
          <Link href={`/${locale}/models`} className={isModels ? "nr-active" : undefined} aria-current={isModels ? "page" : undefined}>{dict.nav.models}</Link>
          <Link href={`/${locale}/pricing`} className={isPricing ? "nr-active" : undefined} aria-current={isPricing ? "page" : undefined}>{dict.nav.pricing}</Link>
          <Link href={`/${locale}/how-it-works`} className={isHow ? "nr-nav-anchor nr-active" : "nr-nav-anchor"} aria-current={isHow ? "page" : undefined}>{dict.nav.howItWorks}</Link>
          <Link href={`/${locale}/docs`} className={isDocs ? "nr-active" : undefined} aria-current={isDocs ? "page" : undefined}>{dict.nav.docs}</Link>
        </nav>
      </div>
      {/* Centrada en la pantalla, no en el hueco que dejan los lados: la cabecera es una rejilla de tres columnas. */}
      <button type="button" className="nr-search-box" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /" onClick={() => setSearchOpen(true)}>
        <SearchIcon size={16} aria-hidden />
        <span>{dict.search.trigger}</span>
        <kbd>{apple ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <SiteSearch locale={locale} dict={dict} models={models} open={searchOpen} onOpenChange={setSearchOpen} />
      <div className="nr-header-actions">
        <Link href={getKeyHref(locale)} className={buttonVariants({ variant: "secondary", className: "nr-pill-button" })}>{dict.nav.getKey}</Link>
        {account}
        <MobileMenu locale={locale} dict={dict} account={menuAccount} onSearch={() => setSearchOpen(true)} />
      </div>
    </header>
  );
}

/**
 * Menú de la cabecera en pantallas angostas (≤ 860 px), donde no caben la navegación, la búsqueda ni «Entrar».
 * «Buscar» abre la misma paleta que ⌘K.
 * El idioma y el tema están en el pie de página.
 */
function MobileMenu({ locale, dict, account, onSearch }: { locale: Locale; dict: Dictionary; account: React.ReactNode; onSearch: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="nr-icon-button nr-mobile-menu" aria-label={dict.nav.menu} />}>
        <MenuIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          {/* Con ícono, como el menú de cuenta y el tema: todas las etiquetas empiezan en la misma columna. */}
          <DropdownMenuItem onClick={onSearch}><SearchIcon aria-hidden />{dict.search.trigger}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/models`} />}><GridIcon aria-hidden />{dict.nav.models}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/pricing`} />}><TagIcon aria-hidden />{dict.nav.pricing}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/how-it-works`} />}><WorkflowIcon aria-hidden />{dict.nav.howItWorks}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/docs`} />}><BookOpenIcon aria-hidden />{dict.nav.docs}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/${locale}/faq`} />}><CircleHelpIcon aria-hidden />{dict.nav.faq}</DropdownMenuItem>
        </DropdownMenuGroup>
        {account}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
