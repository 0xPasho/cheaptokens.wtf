"use client";

import GaugeIcon from "kubai-icons-react/icons/gauge";
import KeyRoundIcon from "kubai-icons-react/icons/key-round";
import SettingsIcon from "kubai-icons-react/icons/settings";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/lib/i18n/config";

import { SignOut } from "./sign-out";

/** Menú de cuenta de la cabecera: el patrón de /design-system › Dropdown menu. */
export function AccountMenu({ locale, mode, identity, labels }: {
  locale: Locale;
  mode: "clerk" | "dev";
  identity: string;
  labels: { account: string; dashboard: string; keys: string; settings: string; signOut: string };
}) {
  const initials = identity.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  const base = `/${locale}/dashboard`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="nr-icon-button" />}>
        {/* El nombre va como texto sr-only: las iniciales visibles no son el nombre (WCAG 2.5.3, docs/13). */}
        <Avatar size="sm" aria-hidden>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
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
