import { issueKeyRoute } from "@/lib/partner/http";
import { getPartnerDeps } from "@/lib/server/partner-deps";

export async function POST(request: Request, ctx: RouteContext<"/partner/v1/plans/[planId]/keys">): Promise<Response> {
  return issueKeyRoute(request, getPartnerDeps(), (await ctx.params).planId);
}
