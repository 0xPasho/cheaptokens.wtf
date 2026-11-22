import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AccountAvatar } from "@/components/account-avatar";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { ExportDataButton } from "@/components/dashboard/export-data-button";
import { SignOut } from "@/components/dashboard/sign-out";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthMode } from "@/lib/auth/mode";
import { requireDashboard } from "@/lib/dashboard/session";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
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
  const rows: [string, ReactNode][] = [
    [d.email, user.email ? (
      <span className="flex items-center justify-end gap-2">
        <span className="truncate">{user.email}</span>
        {facts?.emailVerified ? <Badge variant="secondary">{d.verified}</Badge> : null}
      </span>
    ) : "—"],
    ...(facts?.createdAt ? [[d.memberSince, formatDateTime(new Date(facts.createdAt), locale)] as [string, ReactNode]] : []),
    ...(facts?.lastSignInAt ? [[d.lastSignIn, formatDateTime(new Date(facts.lastSignInAt), locale)] as [string, ReactNode]] : []),
    [d.userId, <span key="id" className="font-mono text-xs">{user.id}</span>],
  ];
  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{d.accountTitle}</CardTitle>
          <CardDescription>{mode === "clerk" ? d.accountClerk : d.accountDev}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <AccountAvatar seed={user.id} size="xl" />
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name ?? user.email ?? user.id}</p>
              {user.name && user.email ? <p className="truncate text-sm text-muted-foreground">{user.email}</p> : null}
            </div>
          </div>
          <dl className="flex flex-col text-sm">
            {rows.map(([term, value]) => (
              <div key={term} className="flex min-w-0 justify-between gap-3 border-t py-2.5">
                <dt className="shrink-0 text-muted-foreground">{term}</dt>
                <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
        <CardFooter className="flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{d.signOutBody}</p>
          <SignOut locale={locale} label={dict.auth.signOut} mode={mode} variant="button" />
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{d.dataTitle}</CardTitle>
          <CardDescription>{d.dataBody}</CardDescription>
        </CardHeader>
        <CardFooter>
          <ExportDataButton label={d.download} errorLabel={dict.dashboard.error} />
        </CardFooter>
      </Card>
    </div>
  );
}
