import { revokeKeyRoute } from "@/lib/partner/http";
import { getPartnerDeps } from "@/lib/server/partner-deps";

export async function POST(request: Request, ctx: RouteContext<"/partner/v1/keys/[keyId]/revoke">): Promise<Response> {
  return revokeKeyRoute(request, getPartnerDeps(), (await ctx.params).keyId);
}
