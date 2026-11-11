import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { readSecret } from "@/lib/env";

export async function POST(request: Request): Promise<Response> {
  const secret = readSecret("INTERNAL_REVALIDATE_SECRET");
  // Los hashes tienen igual longitud incluso si el token recibido tiene otro tamaño.
  const received = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret ?? ""}`).digest();
  if (!timingSafeEqual(received, expected) || !secret || secret.length < 16) return new Response(null, { status: 401 });

  revalidateTag("catalog", "max");
  return new Response(null, { status: 204 });
}
