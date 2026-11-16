import { getDb } from "@/lib/db/client";
import type { PartnerDeps } from "@/lib/partner/http";

export function getPartnerDeps(): PartnerDeps {
  return { db: getDb(), now: Date.now, env: process.env };
}
