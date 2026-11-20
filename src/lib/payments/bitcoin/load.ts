/** Lo de Bitcoin que las páginas del dashboard cargan en el servidor (ADR-0065). Sin leer la cadena. */
import type { Db } from "@/lib/db/types";

import { readBitcoinConfig } from "./config";
import { BitcoinAddressMismatchError, bitcoinDeps, getBitcoinState, pendingBitcoinPayments } from "./orders";
import { type BitcoinView, bitcoinView } from "./view";

/** La vista inicial del pago en Bitcoin. Null si no está configurado o si su dirección ya no sale de la xpub. */
export async function loadBitcoinView(db: Db, workspaceId: string, now: number): Promise<BitcoinView | null> {
  const deps = bitcoinDeps(readBitcoinConfig());
  if (!deps) return null;
  try {
    return bitcoinView(deps, await getBitcoinState(db, deps, workspaceId, now), now);
  } catch (error) {
    if (error instanceof BitcoinAddressMismatchError) return null;
    throw error;
  }
}

/** Los pagos en Bitcoin en camino: sats y, si eran de un plan, cuál. */
export async function loadBitcoinPending(db: Db, workspaceId: string): Promise<{ sats: string; planId: string | null }[]> {
  const config = readBitcoinConfig();
  if (!config) return [];
  const rows = await pendingBitcoinPayments(db, config.network, workspaceId);
  return rows.map((row) => ({ sats: row.sats.toString(), planId: row.planId }));
}
