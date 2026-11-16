import { changePlanRoute } from "@/lib/partner/http";
import { getPartnerDeps } from "@/lib/server/partner-deps";

export async function PATCH(request: Request, ctx: RouteContext<"/partner/v1/plans/[planId]">): Promise<Response> {
  return changePlanRoute(request, getPartnerDeps(), (await ctx.params).planId);
}
