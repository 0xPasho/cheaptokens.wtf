import { SearchXIcon } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** 404 de las páginas públicas, en el idioma de la ruta (next/root-params). */
export default async function NotFound() {
  const [locale, dict] = await getLocaleAndDictionary();

  return (
    <Container className="pt-16">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h1>{dict.detail.notFoundTitle}</h1>
          </EmptyTitle>
          <EmptyDescription>{dict.detail.notFoundBody}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={`/${locale}/models`} className={buttonVariants({ variant: "outline" })}>
            {dict.detail.back}
          </Link>
        </EmptyContent>
      </Empty>
    </Container>
  );
}
