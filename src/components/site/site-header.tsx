"use client";
import SearchIcon from "kubai-icons-react/icons/search";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const pathname = usePathname();
  const router = useRouter();
  const filters = useCatalogFilters();
  const input = useRef<HTMLInputElement>(null);
  const isDocs = pathname.includes("/docs");
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
          <Link href={`/${locale}/models`} className={!isDocs ? "nr-active" : undefined} aria-current={!isDocs ? "page" : undefined}>{dict.nav.models}</Link>
          <Link href={`/${locale}/docs`} className={isDocs ? "nr-active" : undefined} aria-current={isDocs ? "page" : undefined}>{dict.nav.docs}</Link>
          <Link href={`/${locale}/docs#quickstart`}>{dict.nav.howItWorks}</Link>
        </nav>
      </div>
      <form className="nr-search-box" onSubmit={(event) => { event.preventDefault(); router.push(`/${locale}/models${filters.search}`); }}>
        <SearchIcon size={16} aria-hidden />
        <input ref={input} type="search" name="q" value={filters.query} placeholder={dict.catalog.headerSearch}
          disabled={!filters.ready} aria-label={dict.catalog.searchLabel} aria-keyshortcuts="Control+k Meta+k /"
          onChange={(event) => filters.update({ q: event.target.value })} />
        <kbd>Ctrl K</kbd>
      </form>
      <div className="nr-header-actions">
        <ThemeToggle labels={dict.theme} className="nr-icon-button" />
        <Link href={`/${locale}/docs#quickstart`} className={buttonVariants({ variant: "secondary", className: "nr-pill-button" })}>{dict.nav.getKey}</Link>
        <Link href={`/${locale}/docs`} className="nr-account-link">{dict.nav.docs}</Link>
      </div>
    </header>
  );
}
