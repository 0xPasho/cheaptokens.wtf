import type { Metadata } from "next";
import { Suspense } from "react";

import { Container } from "@/components/container";
import { AuthPanel } from "@/components/dashboard/auth-panel";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** Clerk usa subrutas (`/sign-in/factor-one`…) que solo existen al pedirlas: la ruta no se prerenderiza. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.auth.signInTitle, robots: { index: false } };
}

export default async function Page({ searchParams }: PageProps<"/[lang]/sign-in/[[...sign-in]]">) {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <Container size="prose" className="nr-docs flex max-w-md flex-col gap-8 pb-20">
      <PageHeader title={dict.auth.signInTitle} description={dict.auth.signInDescription} />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-3xl" />}>
        <AuthPanel kind="sign-in" locale={locale} dict={dict} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}
