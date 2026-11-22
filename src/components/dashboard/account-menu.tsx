"use client";

import GaugeIcon from "kubai-icons-react/icons/gauge";
import KeyRoundIcon from "kubai-icons-react/icons/key-round";
import SettingsIcon from "kubai-icons-react/icons/settings";
import Link from "next/link";

import { AccountAvatar } from "@/components/account-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/lib/i18n/config";

import { SignOut } from "./sign-out";

/** Menú de cuenta de la cabecera: el patrón de /design-system › Dropdown menu. */
export function AccountMenu({ locale, mode, identity, seed, labels }: {
  locale: Locale;
  mode: "clerk" | "dev";
  identity: string;
  /** Semilla del avatar por defecto: el id de Clerk (o el de la sesión de desarrollo). */
  seed: string;
  labels: { account: string; dashboard: string; keys: string; settings: string; signOut: string };
}) {
  const base = `/${locale}/dashboard`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="nr-icon-button" />}>
        {/* El avatar es decorativo: el nombre va como texto sr-only. */}
        <AccountAvatar seed={seed} size="sm" />
        <span className="sr-only">{labels.account}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{identity}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href={base} />}><GaugeIcon aria-hidden />{labels.dashboard}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`${base}/keys`} />}><KeyRoundIcon aria-hidden />{labels.keys}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`${base}/settings`} />}><SettingsIcon aria-hidden />{labels.settings}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <SignOut locale={locale} label={labels.signOut} mode={mode} variant="menu" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
