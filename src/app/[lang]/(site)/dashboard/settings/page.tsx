import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AccountAvatar } from "@/components/account-avatar";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { ExportDataButton } from "@/components/dashboard/export-data-button";
import { SignOut } from "@/components/dashboard/sign-out";
import { PageHeader } from "@/components/page-header";
import { SensitiveValue } from "@/components/sensitive-value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthMode } from "@/lib/auth/mode";
import { requireDashboard } from "@/lib/dashboard/session";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.dashboard.settings.title, robots: { index: false } };
}

export default async function SettingsPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <>
      <PageHeader title={dict.dashboard.settings.title} description={dict.dashboard.settings.description} />
      <Suspense fallback={<DashboardSkeleton label={dict.dashboard.loading} />}>
        <Settings locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}

interface AccountFacts {
  emailVerified: boolean;
  createdAt: number | null;
  lastSignInAt: number | null;
}

/** Lo pertinente de la cuenta de Clerk. No mostramos su panel `UserProfile`: aún no se edita nada desde aquí. */
async function readAccountFacts(): Promise<AccountFacts | null> {
  const user = await currentUser();
  if (!user) return null;
  return {
    emailVerified: user.primaryEmailAddress?.verification?.status === "verified",
    createdAt: user.createdAt || null,
    lastSignInAt: user.lastSignInAt,
  };
}

async function Settings({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { user } = await requireDashboard(locale, "/settings");
  const mode = getAuthMode() === "clerk" ? "clerk" : "dev";
  const facts = mode === "clerk" ? await readAccountFacts() : null;
  const d = dict.dashboard.settings;
  // El correo va una sola vez: en la cabecera si no hay nombre (o si el nombre es el mismo correo), o como dato.
  const heading = user.name ?? user.email ?? user.id;
  // El correo y el ID, ocultos hasta que se toca el ojo: no salen en una captura ni al compartir pantalla.
  const hidden = (value: string, what: string, className?: string) => (
    <SensitiveValue value={value} showLabel={t(d.show, { what })} hideLabel={t(d.hide, { what })} hiddenLabel={d.hidden} className={className} />
  );
  const verified = facts?.emailVerified ? <Badge variant="secondary">{d.verified}</Badge> : null;
  const rows: [string, ReactNode][] = [
    ...(user.email && heading !== user.email ? [[d.email, <span key="email" className="flex min-w-0 items-center gap-2">{hidden(user.email, d.theEmail)}{verified}</span>] as [string, ReactNode]] : []),
    ...(facts?.createdAt ? [[d.memberSince, formatDateTime(new Date(facts.createdAt), locale)] as [string, ReactNode]] : []),
    ...(facts?.lastSignInAt ? [[d.lastSignIn, formatDateTime(new Date(facts.lastSignInAt), locale)] as [string, ReactNode]] : []),
    [d.userId, <span key="id" className="flex min-w-0 font-mono text-xs">{hidden(user.id, d.theId)}</span>],
  ];
  return (
    // A todo el ancho, como el resto del dashboard: la cuenta arriba con sus datos en columnas y las dos acciones
    // lado a lado debajo, en vez de una columna angosta con media pantalla vacía a la derecha.
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <AccountAvatar seed={user.id} size="xl" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex min-w-0 items-center gap-2 font-heading text-xl font-medium tracking-tight">
                {heading === user.email || heading === user.id ? hidden(heading, heading === user.email ? d.theEmail : d.theId) : <span className="truncate">{heading}</span>}
                {heading === user.email ? verified : null}
              </p>
              {mode === "dev" ? <p className="text-muted-foreground">{d.accountDev}</p> : null}
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([term, value]) => (
              <div key={term} className="flex min-w-0 flex-col gap-1">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="min-w-0 tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <SettingCard title={d.dataTitle} body={d.dataBody}>
          <ExportDataButton label={d.download} errorLabel={dict.dashboard.error} />
        </SettingCard>
        <SettingCard title={d.sessionTitle} body={d.signOutBody}>
          <SignOut locale={locale} label={dict.auth.signOut} mode={mode} variant="button" />
        </SettingCard>
      </div>
    </div>
  );
}

/**
 * Una acción de la cuenta: qué hace y su botón al pie. Las dos cards miden lo mismo (la rejilla las estira), así
 * que sus botones quedan en la misma línea aunque un texto ocupe dos renglones y el otro uno.
 */
function SettingCard({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-1 flex-col items-start gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">{title}</p>
          <p className="text-pretty text-muted-foreground">{body}</p>
        </div>
        <div className="mt-auto">{children}</div>
      </CardContent>
    </Card>
  );
}
