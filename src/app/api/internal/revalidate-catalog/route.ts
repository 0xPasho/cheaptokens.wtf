import { revalidateTag } from "next/cache";

import { readSecret } from "@/lib/env";
import { hasInternalSecret } from "@/lib/server/internal-auth";

export async function POST(request: Request): Promise<Response> {
  if (!hasInternalSecret(request, [readSecret("INTERNAL_REVALIDATE_SECRET")])) return new Response(null, { status: 401 });

  revalidateTag("catalog", "max");
  return new Response(null, { status: 204 });
}
