"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

import { useStatusCopy } from "./status-copy";
import { StatusPage } from "./status-page";

/** El contenido de un `error.tsx`: el error se registra en la consola y la página ofrece reintentar o volver. */
export function SegmentError({ error, retry, inline = false }: { error: unknown; retry: () => void; inline?: boolean }) {
  const { locale, error: copy } = useStatusCopy();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage code="Error" title={copy.title} description={copy.body} inline={inline}>
      <Button size="lg" className="nr-mk-button" onClick={() => retry()}>{copy.retry}</Button>
      <Link href={`/${locale}`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>{copy.home}</Link>
    </StatusPage>
  );
}
