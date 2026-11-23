import { revalidateTag } from "next/cache";

import { readSecret } from "@/lib/env";
import { hasInternalSecret } from "@/lib/server/internal-auth";

export async function POST(request: Request): Promise<Response> {
  if (!hasInternalSecret(request, [readSecret("INTERNAL_REVALIDATE_SECRET")])) return new Response(null, { status: 401 });

  // Expira de inmediato, como el cron (ADR-0069): ninguna página sigue mostrando el catálogo anterior.
  revalidateTag("catalog", { expire: 0 });
  return new Response(null, { status: 204 });
}
