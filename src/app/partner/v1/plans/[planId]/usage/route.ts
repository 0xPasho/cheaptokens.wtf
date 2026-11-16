import { usageRoute } from "@/lib/partner/http";
import { getPartnerDeps } from "@/lib/server/partner-deps";

export async function GET(request: Request, ctx: RouteContext<"/partner/v1/plans/[planId]/usage">): Promise<Response> {
  return usageRoute(request, getPartnerDeps(), (await ctx.params).planId);
}
