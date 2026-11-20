"use client";

import { SegmentError } from "@/components/site/segment-error";

/** Un fallo al renderizar una página pública: el sitio sigue con su cabecera y ofrece reintentar. */
export default function SiteError(props: { error: unknown; retry: () => void }) {
  return <SegmentError {...props} />;
}
