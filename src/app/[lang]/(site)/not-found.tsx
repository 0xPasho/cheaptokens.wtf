import Link from "next/link";

import { StatusPage } from "@/components/site/status-page";
import { buttonVariants } from "@/components/ui/button";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** 404 de las páginas públicas, en el idioma de la ruta (next/root-params). Las rutas que no existen llegan por `[...missing]`. */
export default async function NotFound() {
  const [locale, dict] = await getLocaleAndDictionary();
  const copy = dict.status.notFound;

  return (
    <StatusPage code="404" title={copy.title} description={copy.body}>
      <Link href={`/${locale}`} className={buttonVariants({ size: "lg", className: "nr-mk-button" })}>{copy.home}</Link>
      <Link href={`/${locale}/models`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>{copy.models}</Link>
    </StatusPage>
  );
}
