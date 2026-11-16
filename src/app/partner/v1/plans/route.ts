import { openPlanRoute } from "@/lib/partner/http";
import { getPartnerDeps } from "@/lib/server/partner-deps";

export async function POST(request: Request): Promise<Response> {
  return openPlanRoute(request, getPartnerDeps());
}
