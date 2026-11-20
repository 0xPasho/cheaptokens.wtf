import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getKeyHref } from "@/lib/auth/redirect";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { ArrowLabel } from "./section";

/** 08 · Cierre: el último llamado al registro. */
export function FinalCta({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const d = dict.home.final;
  return (
    <section className="nr-mk-final" aria-labelledby="final-title">
      <h2 id="final-title">{d.title}</h2>
      <p>{d.body}</p>
      <div className="nr-mk-ctas">
        <Link href={getKeyHref(locale)} className={buttonVariants({ size: "lg", className: "nr-mk-button" })}>{d.primary}</Link>
        <Link href={`/${locale}/models`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>
          <ArrowLabel>{d.secondary}</ArrowLabel>
        </Link>
      </div>
    </section>
  );
}
