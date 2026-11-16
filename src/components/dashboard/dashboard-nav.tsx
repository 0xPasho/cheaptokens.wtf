"use client";

import BookOpenIcon from "kubai-icons-react/icons/book-open";
import ChartBarIcon from "kubai-icons-react/icons/chart-bar";
import GaugeIcon from "kubai-icons-react/icons/gauge";
import GridIcon from "kubai-icons-react/icons/grid";
import KeyRoundIcon from "kubai-icons-react/icons/key-round";
import SettingsIcon from "kubai-icons-react/icons/settings";
import TimerIcon from "kubai-icons-react/icons/timer";
import WalletIcon from "kubai-icons-react/icons/wallet";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const ITEMS = [
  { path: "", key: "overview", Icon: GaugeIcon },
  { path: "/plan", key: "plan", Icon: TimerIcon },
  { path: "/credits", key: "credits", Icon: WalletIcon },
  { path: "/keys", key: "keys", Icon: KeyRoundIcon },
  { path: "/usage", key: "usage", Icon: ChartBarIcon },
  { path: "/settings", key: "settings", Icon: SettingsIcon },
] as const;

/** La navegación del dashboard, con la misma composición que la sidebar del catálogo (ADR-0038). */
export function DashboardNav({ locale, labels }: { locale: Locale; labels: Dictionary["dashboard"]["nav"] }) {
  const pathname = usePathname();
  const base = `/${locale}/dashboard`;
  return (
    <aside className="nr-sidebar" aria-label={labels.label}>
      <div className="nr-sidebar-group">
        <h2>{labels.account}</h2>
        <nav className="nr-big-list" aria-label={labels.label}>
          {ITEMS.map(({ path, key, Icon }) => {
            const href = `${base}${path}`;
            const current = path === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link key={key} href={href} aria-current={current ? "page" : undefined}>
                <Icon size={24} trigger="parent" aria-hidden />
                <span className="nr-sidebar-label">{labels[key]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="nr-sidebar-group">
        <h2>{labels.help}</h2>
        <nav className="nr-big-list" aria-label={labels.help}>
          <Link href={`/${locale}/models`}>
            <GridIcon size={24} trigger="parent" aria-hidden />
            <span className="nr-sidebar-label">{labels.models}</span>
          </Link>
          <Link href={`/${locale}/docs`}>
            <BookOpenIcon size={24} trigger="parent" aria-hidden />
            <span className="nr-sidebar-label">{labels.docs}</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
}
