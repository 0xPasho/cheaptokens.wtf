import { getDb } from "@/lib/db/client";
import { readSecret } from "@/lib/env";
import { readBitcoinConfig } from "@/lib/payments/bitcoin/config";
import { bitcoinDeps, scanBitcoin } from "@/lib/payments/bitcoin/orders";
import { readCryptoConfig } from "@/lib/payments/crypto/config";
import { checkFeeWallets, depositChains, scanDeposits } from "@/lib/payments/crypto/deposits";
import { hasInternalSecret } from "@/lib/server/internal-auth";

export const maxDuration = 60;

/**
 * Barre los depósitos en USDC de Solana y Base (ADR-0058) y revisa los pagos en Bitcoin (ADR-0063), y
 * acredita lo que ya se confirmó. La llama el cron del servidor cada minuto (deploy/cron.sh); el diálogo de
 * pago abierto revisa por su cuenta las direcciones de su workspace, así que el cron cubre a quien paga sin
 * tener el dashboard abierto.
 */
async function scan(request: Request): Promise<Response> {
  if (!hasInternalSecret(request, [readSecret("CRON_SECRET"), readSecret("INTERNAL_REVALIDATE_SECRET")])) {
    return new Response(null, { status: 401 });
  }
  const db = getDb();
  const chains = depositChains(readCryptoConfig());
  const reports = await scanDeposits(db, chains, Date.now());
  await checkFeeWallets(chains, reports);
  const bitcoin = bitcoinDeps(readBitcoinConfig());
  const bitcoinReport = bitcoin?.chain.live ? await scanBitcoin(db, bitcoin, Date.now()) : null;
  console.log(JSON.stringify({ event: "deposits_scanned", reports, bitcoin: bitcoinReport }));
  return Response.json({
    ok: reports.every((report) => !report.error) && !bitcoinReport?.error,
    reports,
    bitcoin: bitcoinReport,
  });
}

export const GET = scan;
export const POST = scan;
