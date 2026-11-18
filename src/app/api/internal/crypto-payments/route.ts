import { getDb } from "@/lib/db/client";
import { readSecret } from "@/lib/env";
import { readCryptoConfig } from "@/lib/payments/crypto/config";
import { checkFeeWallets, depositChains, scanDeposits } from "@/lib/payments/crypto/deposits";
import { hasInternalSecret } from "@/lib/server/internal-auth";

export const maxDuration = 60;

/**
 * Barre los depósitos en USDC de Solana y Base y acredita los que ya se confirmaron (ADR-0058). La llama el
 * cron del servidor cada minuto (deploy/cron.sh); el diálogo de depósito abierto revisa por su cuenta las direcciones de su
 * workspace, así que el cron cubre a quien deposita sin tener el dashboard abierto.
 */
async function scan(request: Request): Promise<Response> {
  if (!hasInternalSecret(request, [readSecret("CRON_SECRET"), readSecret("INTERNAL_REVALIDATE_SECRET")])) {
    return new Response(null, { status: 401 });
  }
  const chains = depositChains(readCryptoConfig());
  const reports = await scanDeposits(getDb(), chains, Date.now());
  await checkFeeWallets(chains, reports);
  console.log(JSON.stringify({ event: "deposits_scanned", reports }));
  return Response.json({ ok: reports.every((report) => !report.error), reports });
}

export const GET = scan;
export const POST = scan;
