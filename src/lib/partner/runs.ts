/**
 * Corridas por plan y mes (docs/17). El forwarder de Deska manda en cada llamada `x-deska-run`: un digest
 * opaco de 32 hex, uno por corrida. El gateway guarda solo ese digest, una vez por plan y mes, y únicamente
 * en planes de socio; `runsThisMonth` cuenta las filas. Nunca se loguea. Sin el header, o con otra forma,
 * no se cuenta nada.
 */
import { sql } from "drizzle-orm";

import { partnerPlans, partnerRuns } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import { monthDate, usageMonth } from "./months";

export const RUN_HEADER = "x-deska-run";
const RUN_PATTERN = /^[0-9a-f]{32}$/;

/** El digest de la corrida, en minúsculas, o null si falta o no tiene la forma. */
export function deskaRun(headers: Headers): string | null {
  const value = headers.get(RUN_HEADER)?.trim().toLowerCase();
  return value && RUN_PATTERN.test(value) ? value : null;
}

/** Una sola sentencia: inserta la corrida si el workspace es de un plan de socio y no la tenía en el mes. */
export async function countRun(db: Db, workspaceId: string, run: string, now: number): Promise<void> {
  await db.execute(sql`
    insert into ${partnerRuns} (plan_id, month, run)
    select ${partnerPlans.id}, ${monthDate(usageMonth(now))}::date, ${run}
    from ${partnerPlans} where ${partnerPlans.workspaceId} = ${workspaceId}
    on conflict do nothing`);
}
