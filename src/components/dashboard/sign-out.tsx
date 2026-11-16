"use client";

import { useClerk } from "@clerk/nextjs";
import LogOutIcon from "kubai-icons-react/icons/log-out";

import { devSignOutAction } from "@/app/[lang]/(site)/sign-in/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Locale } from "@/lib/i18n/config";

type SignOutProps = { locale: Locale; label: string; mode: "clerk" | "dev"; variant: "menu" | "button" };

/** Cierra la sesión con Clerk o con el modo de desarrollo (ADR-0050). */
export function SignOut(props: SignOutProps) {
  return props.mode === "clerk" ? <ClerkSignOut {...props} /> : <DevSignOut {...props} />;
}

function ClerkSignOut({ locale, label, variant }: SignOutProps) {
  const clerk = useClerk();
  const signOut = () => void clerk.signOut({ redirectUrl: `/${locale}` });
  return variant === "menu"
    ? <DropdownMenuItem onClick={signOut}><LogOutIcon aria-hidden />{label}</DropdownMenuItem>
    : <Button variant="outline" onClick={signOut}><LogOutIcon data-icon="inline-start" aria-hidden />{label}</Button>;
}

function DevSignOut({ locale, label, variant }: SignOutProps) {
  if (variant === "menu") {
    return (
      <form action={devSignOutAction}>
        <input type="hidden" name="locale" value={locale} />
        <DropdownMenuItem render={<button type="submit" className="w-full" />}><LogOutIcon aria-hidden />{label}</DropdownMenuItem>
      </form>
    );
  }
  return (
    <form action={devSignOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline"><LogOutIcon data-icon="inline-start" aria-hidden />{label}</Button>
    </form>
  );
}
