import { extraCapRoute } from "@/lib/partner/http";
import { getPartnerDeps } from "@/lib/server/partner-deps";

export async function PUT(request: Request, ctx: RouteContext<"/partner/v1/plans/[planId]/extra-cap">): Promise<Response> {
  return extraCapRoute(request, getPartnerDeps(), (await ctx.params).planId);
}
