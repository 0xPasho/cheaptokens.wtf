"use client";

import { SegmentError } from "@/components/site/segment-error";

/** Un fallo en una página del dashboard (sesión vencida, base caída): la barra lateral queda y se puede reintentar. */
export default function DashboardError(props: { error: unknown; retry: () => void }) {
  return <SegmentError {...props} inline />;
}
