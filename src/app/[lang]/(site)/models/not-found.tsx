import Link from "next/link";

import { StatusPage } from "@/components/site/status-page";
import { buttonVariants } from "@/components/ui/button";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** Un modelo que no existe o se retiró: mismo diseño que el 404 del sitio, con el texto del catálogo. */
export default async function ModelNotFound() {
  const [locale, dict] = await getLocaleAndDictionary();

  return (
    <StatusPage code="404" title={dict.detail.notFoundTitle} description={dict.detail.notFoundBody}>
      <Link href={`/${locale}/models`} className={buttonVariants({ size: "lg", className: "nr-mk-button" })}>{dict.status.notFound.models}</Link>
      <Link href={`/${locale}`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>{dict.status.notFound.home}</Link>
    </StatusPage>
  );
}
