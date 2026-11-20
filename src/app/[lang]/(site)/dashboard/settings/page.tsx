import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { ExportDataButton } from "@/components/dashboard/export-data-button";
import { SignOut } from "@/components/dashboard/sign-out";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthMode } from "@/lib/auth/mode";
import { requireDashboard } from "@/lib/dashboard/session";
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

async function Settings({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { user } = await requireDashboard(locale, "/settings");
  const mode = getAuthMode() === "clerk" ? "clerk" : "dev";
  const d = dict.dashboard.settings;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{d.accountTitle}</CardTitle>
            <CardDescription>{mode === "clerk" ? d.accountClerk : d.accountDev}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="truncate text-sm font-medium">{user.email ?? user.name ?? user.id}</p>
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
      {mode === "clerk" ? <UserProfile routing="hash" /> : null}
    </div>
  );
}
