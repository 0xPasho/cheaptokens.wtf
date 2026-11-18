/**
 * Depósitos en USDC (ADR-0058). Cada workspace tiene su dirección de depósito en cada red. Un barrido mira
 * cuánto USDC hay en las direcciones, lo envía a la wallet principal y, cuando esa transacción queda
 * confirmada, acredita el mismo monto como saldo.
 *
 * Lo acreditado es siempre lo que llegó a la wallet principal: un barrido se guarda antes de enviarse y se
 * acredita una sola vez, por su id de transacción. Si dos procesos ven el mismo saldo, la cadena solo deja
 * moverlo una vez.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { recordTopUp } from "@/lib/billing/purchases";
import { depositAddresses, depositScans, depositSweeps, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";

import { BaseChain } from "./base";
import { type DepositChain, RpcError } from "./chain";
import type { CryptoConfig, CryptoNetworkId } from "./config";
import { SolanaChain } from "./solana";

/** Menos que esto se queda en la dirección hasta juntar el mínimo: barrer centavos cuesta más de lo que mueve. */
export const MIN_DEPOSIT_MICRO_USD = BigInt(1_000_000);
/** Cuánto se sigue de cerca una dirección después de que su dueño abrió el depósito. */
export const WATCH_MS = 24 * 60 * 60 * 1000;
/** Lo más seguido que un workspace puede hacer leer sus direcciones en la cadena. */
export const CHECK_INTERVAL_MS = 4_000;
/** Direcciones sin vigilar que se revisan en cada corrida del cron, de la que lleva más tiempo sin mirarse a la más reciente. */
const ROTATION_BATCH = 300;
const WATCHED_LIMIT = 1_000;
const MAX_SWEEPS_PER_SCAN = 20;
/** Si el proceso que barre una red muere, otro puede tomarla después de este tiempo. */
const LEASE_MS = 45_000;
/** Un barrido que venció se vuelve a mirar durante este tiempo: si al final sí entró, se acredita. */
const RECHECK_EXPIRED_MS = 60 * 60 * 1000;
/**
 * Después de un barrido rechazado o que falló en la cadena, esa dirección espera antes de intentar otro. Sin
 * esto, una wallet de comisiones sin fondos llenaría la tabla de intentos mientras alguien mira su depósito.
 */
export const RETRY_AFTER_FAILURE_MS = 60_000;
const OPEN_SWEEPS_LIMIT = 200;
const RECENT_CREDITS = 5;
const ZERO = BigInt(0);

/** Las redes configuradas, listas para derivar direcciones y barrer. Vacío si no hay semilla. */
export function depositChains(config: CryptoConfig, fetchImpl?: typeof fetch): DepositChain[] {
  const { seed } = config;
  if (seed === null) return [];
  return config.networks.map((network) => network.id === "solana"
    ? new SolanaChain(network, seed, fetchImpl)
    : new BaseChain(network, seed, fetchImpl));
}

export interface DepositAddress {
  network: CryptoNetworkId;
  address: string;
  unsweptMicroUsd: bigint;
}

/**
 * Las direcciones de depósito de un workspace; las guarda la primera vez. Una dirección guardada que ya no
 * sale de la semilla (la semilla cambió) no se devuelve: no se le muestra a nadie una dirección que no se
 * puede barrer.
 */
export async function ensureDepositAddresses(db: Db, chains: DepositChain[], workspaceId: string): Promise<DepositAddress[]> {
  const live = chains.filter((chain) => chain.live);
  const stored = live.length > 0
    ? await db.select().from(depositAddresses).where(eq(depositAddresses.workspaceId, workspaceId))
    : [];
  const result: DepositAddress[] = [];
  for (const chain of chains) {
    const address = await chain.depositAddress(workspaceId);
    if (!chain.live) {
      result.push({ network: chain.network, address, unsweptMicroUsd: ZERO });
      continue;
    }
    let row = stored.find((candidate) => candidate.network === chain.network);
    if (!row) {
      [row] = await db.insert(depositAddresses).values({ workspaceId, network: chain.network, address }).onConflictDoNothing().returning();
      row ??= (await db.select().from(depositAddresses)
        .where(and(eq(depositAddresses.workspaceId, workspaceId), eq(depositAddresses.network, chain.network))))[0];
    }
    if (!row || row.address !== address) {
      console.error(JSON.stringify({ event: "deposit_address_mismatch", severity: "critical", network: chain.network, workspaceId }));
      continue;
    }
    result.push({ network: chain.network, address, unsweptMicroUsd: row.unsweptMicroUsd });
  }
  return result;
}

export interface DepositState {
  balanceMicroUsd: bigint;
  networks: {
    network: CryptoNetworkId;
    address: string;
    testnet: boolean;
    /** USDC que ya se vio llegar y todavía no es saldo. */
    incomingMicroUsd: bigint;
    /** Ya hay un barrido en camino: falta que la red lo confirme. */
    sweeping: boolean;
  }[];
  /** Los últimos depósitos acreditados, del más nuevo al más viejo. */
  credits: { id: string; network: string; amountMicroUsd: bigint; url: string | null; at: Date }[];
}

/** Lo que el dashboard muestra del depósito. Con `watch`, además deja las direcciones vigiladas un día más. */
export async function getDepositState(db: Db, chains: DepositChain[], workspaceId: string, now: number, options: { watch?: boolean } = {}): Promise<DepositState> {
  const addresses = await ensureDepositAddresses(db, chains, workspaceId);
  if (options.watch !== false && chains.some((chain) => chain.live)) {
    // Solo se escribe cuando a la vigilancia le queda menos de 23 horas: no en cada consulta del diálogo.
    await db.update(depositAddresses).set({ watchUntil: new Date(now + WATCH_MS) }).where(and(
      eq(depositAddresses.workspaceId, workspaceId),
      or(isNull(depositAddresses.watchUntil), lte(depositAddresses.watchUntil, new Date(now + WATCH_MS - 60 * 60 * 1000))),
    ));
  }
  const [[workspace], sweeps] = await Promise.all([
    db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces).where(eq(workspaces.id, workspaceId)),
    db.select().from(depositSweeps).where(and(
      eq(depositSweeps.workspaceId, workspaceId),
      or(eq(depositSweeps.status, "pending"), eq(depositSweeps.status, "confirmed")),
    )).orderBy(desc(depositSweeps.createdAt)).limit(50),
  ]);
  if (!workspace) throw new Error("Workspace not found");
  const pending = sweeps.filter((sweep) => sweep.status === "pending");
  const byNetwork = new Map(chains.map((chain) => [chain.network as string, chain]));
  return {
    balanceMicroUsd: workspace.balance,
    networks: addresses.map(({ network, address, unsweptMicroUsd }) => {
      const sweeping = pending.filter((sweep) => sweep.network === network).reduce((sum, sweep) => sum + sweep.amountMicroUsd, ZERO);
      return {
        network,
        address,
        testnet: byNetwork.get(network)?.testnet ?? true,
        // Lo que está en la dirección y lo que va en camino pueden ser el mismo dinero: se muestra el mayor, nunca la suma.
        incomingMicroUsd: sweeping > unsweptMicroUsd ? sweeping : unsweptMicroUsd,
        sweeping: sweeping > ZERO,
      };
    }),
    credits: sweeps
      .filter((sweep) => sweep.status === "confirmed" && sweep.settledAt !== null)
      .toSorted((a, b) => b.settledAt!.getTime() - a.settledAt!.getTime())
      .slice(0, RECENT_CREDITS)
      .map((sweep) => ({
        id: sweep.id,
        network: sweep.network,
        amountMicroUsd: sweep.amountMicroUsd,
        url: byNetwork.get(sweep.network)?.explorerTxUrl(sweep.txId) ?? null,
        at: sweep.settledAt!,
      })),
  };
}

export interface ScanReport {
  network: string;
  /** Direcciones cuyo saldo se leyó en la cadena. */
  checked: number;
  /** Barridos enviados. */
  swept: number;
  /** Barridos confirmados y acreditados. */
  credited: number;
  /** Otro proceso ya está barriendo esta red. */
  busy?: boolean;
  /** A la wallet de comisiones le queda poco. */
  lowFees?: boolean;
  error?: string;
}

/**
 * Una corrida: acredita los barridos que ya se confirmaron y barre lo que haya llegado. Con `workspaceId`
 * solo mira las direcciones de ese workspace (el diálogo de depósito); sin él, las vigiladas y un turno de
 * las demás (el cron).
 */
export async function scanDeposits(db: Db, chains: DepositChain[], now: number, options: { workspaceId?: string } = {}): Promise<ScanReport[]> {
  const reports: ScanReport[] = [];
  for (const chain of chains) {
    if (!chain.live) continue;
    const report: ScanReport = { network: chain.network, checked: 0, swept: 0, credited: 0 };
    try {
      await scanChain(db, chain, now, options.workspaceId, report);
    } catch (error) {
      report.error = error instanceof Error ? error.message : "scan failed";
      console.error(JSON.stringify({ event: "deposit_scan_failed", network: chain.network, message: report.error }));
    }
    reports.push(report);
  }
  return reports;
}

async function scanChain(db: Db, chain: DepositChain, now: number, workspaceId: string | undefined, report: ScanReport) {
  report.credited = await settleSweeps(db, chain, now, workspaceId);
  const targets = await pickAddresses(db, chain.network, now, workspaceId);
  if (targets.length === 0) return;
  if (!await acquireLease(db, chain.network, now)) {
    report.busy = true;
    return;
  }
  try {
    const balances = await chain.balances(targets.map((target) => target.address));
    report.checked = targets.length;
    await db.update(depositAddresses).set({ checkedAt: new Date(now), unsweptMicroUsd: ZERO }).where(and(
      eq(depositAddresses.network, chain.network), inArray(depositAddresses.address, targets.map((target) => target.address)),
    ));
    const funded = targets.filter((target) => (balances.get(target.address) ?? ZERO) > ZERO);
    for (const target of funded) {
      await db.update(depositAddresses).set({ unsweptMicroUsd: balances.get(target.address) }).where(and(
        eq(depositAddresses.network, chain.network), eq(depositAddresses.address, target.address),
      ));
    }
    const sweepable = funded.filter((target) => balances.get(target.address)! >= MIN_DEPOSIT_MICRO_USD);
    if (sweepable.length === 0) return;
    // No se barre una dirección con un barrido en vuelo, ni una a la que le acaba de fallar uno (salvo que solo haya vencido).
    const busy = new Set((await db.select({ address: depositSweeps.address }).from(depositSweeps).where(and(
      eq(depositSweeps.network, chain.network),
      or(
        eq(depositSweeps.status, "pending"),
        and(
          eq(depositSweeps.status, "failed"), ne(depositSweeps.error, "expired"),
          gt(depositSweeps.settledAt, new Date(now - RETRY_AFTER_FAILURE_MS)),
        ),
      ),
    ))).map((row) => row.address));
    for (const target of sweepable) {
      if (report.swept >= MAX_SWEEPS_PER_SCAN) break;
      if (busy.has(target.address)) continue;
      if (await sweep(db, chain, target, balances.get(target.address)!, now)) report.swept++;
    }
  } finally {
    await db.update(depositScans).set({ leasedUntil: new Date(0) }).where(eq(depositScans.network, chain.network));
  }
}

/** Una red la barre un solo proceso a la vez: en Base, dos a la vez cruzarían los nonces del relayer. */
async function acquireLease(db: Db, network: string, now: number): Promise<boolean> {
  await db.insert(depositScans).values({ network, leasedUntil: new Date(0) }).onConflictDoNothing();
  const claimed = await db.update(depositScans).set({ leasedUntil: new Date(now + LEASE_MS) })
    .where(and(eq(depositScans.network, network), lte(depositScans.leasedUntil, new Date(now))))
    .returning({ network: depositScans.network });
  return claimed.length > 0;
}

interface Target {
  workspaceId: string;
  address: string;
}

async function pickAddresses(db: Db, network: string, now: number, workspaceId?: string): Promise<Target[]> {
  const columns = { workspaceId: depositAddresses.workspaceId, address: depositAddresses.address };
  const oldestFirst = sql`${depositAddresses.checkedAt} asc nulls first`;
  if (workspaceId) {
    return db.select(columns).from(depositAddresses).where(and(
      eq(depositAddresses.network, network), eq(depositAddresses.workspaceId, workspaceId),
      or(isNull(depositAddresses.checkedAt), lte(depositAddresses.checkedAt, new Date(now - CHECK_INTERVAL_MS))),
    ));
  }
  const [watched, rotation] = await Promise.all([
    db.select(columns).from(depositAddresses)
      .where(and(eq(depositAddresses.network, network), gt(depositAddresses.watchUntil, new Date(now))))
      .orderBy(oldestFirst).limit(WATCHED_LIMIT),
    db.select(columns).from(depositAddresses).where(eq(depositAddresses.network, network)).orderBy(oldestFirst).limit(ROTATION_BATCH),
  ]);
  const seen = new Set(watched.map((target) => target.address));
  return [...watched, ...rotation.filter((target) => !seen.has(target.address))];
}

/** Firma, guarda y envía el barrido de una dirección. True si salió a la red. */
async function sweep(db: Db, chain: DepositChain, target: Target, amountMicroUsd: bigint, now: number): Promise<boolean> {
  const log = { network: chain.network, workspaceId: target.workspaceId, amountMicroUsd: amountMicroUsd.toString() };
  if (await chain.depositAddress(target.workspaceId) !== target.address) {
    console.error(JSON.stringify({ event: "deposit_address_mismatch", severity: "critical", ...log }));
    return false;
  }
  let prepared;
  try {
    prepared = await chain.prepareSweep(target.workspaceId, amountMicroUsd, now);
  } catch (error) {
    console.error(JSON.stringify({ event: "deposit_sweep_not_prepared", severity: "critical", ...log, message: errorMessage(error) }));
    return false;
  }
  // Se guarda antes de enviar: si el proceso muere a la mitad, el barrido no se pierde de vista.
  const [row] = await db.insert(depositSweeps).values({
    id: uuidv7(), workspaceId: target.workspaceId, network: chain.network, address: target.address, amountMicroUsd,
    txId: prepared.txId, lastValid: prepared.lastValid, authNonce: prepared.authNonce, createdAt: new Date(now),
  }).onConflictDoNothing().returning({ id: depositSweeps.id });
  if (!row) return false;
  try {
    await prepared.send();
  } catch (error) {
    // El nodo la rechazó: no salió. Sin respuesta no se sabe, y queda pendiente hasta que la cadena lo diga.
    if (error instanceof RpcError && error.code !== null) {
      await db.update(depositSweeps).set({ status: "failed", error: errorMessage(error).slice(0, 300), settledAt: new Date(now) })
        .where(eq(depositSweeps.id, row.id));
    }
    console.error(JSON.stringify({ event: "deposit_sweep_not_sent", severity: "critical", ...log, txId: prepared.txId, message: errorMessage(error) }));
    return false;
  }
  console.log(JSON.stringify({ event: "deposit_sweep_sent", ...log, txId: prepared.txId }));
  return true;
}

/** Acredita los barridos que la cadena ya confirmó y cierra los que ya no pueden entrar. Devuelve cuántos acreditó. */
async function settleSweeps(db: Db, chain: DepositChain, now: number, workspaceId?: string): Promise<number> {
  const open = await db.select().from(depositSweeps).where(and(
    eq(depositSweeps.network, chain.network),
    workspaceId ? eq(depositSweeps.workspaceId, workspaceId) : undefined,
    or(
      eq(depositSweeps.status, "pending"),
      // Uno rechazado al enviarse nunca salió a la red; uno vencido pudo haber entrado sin que el nodo lo viera.
      and(eq(depositSweeps.status, "failed"), eq(depositSweeps.error, "expired"), gt(depositSweeps.settledAt, new Date(now - RECHECK_EXPIRED_MS))),
    ),
  )).orderBy(asc(depositSweeps.createdAt)).limit(OPEN_SWEEPS_LIMIT);
  if (open.length === 0) return 0;
  const states = await chain.sweepStates(open, now);
  let credited = 0;
  for (const row of open) {
    const state = states.get(row.txId);
    if (!state) continue;
    if (state.state === "confirmed") {
      if (await creditSweep(db, chain, row, now)) credited++;
    } else if (state.state === "failed" && row.status === "pending") {
      await db.update(depositSweeps).set({ status: "failed", error: state.reason, settledAt: new Date(now) })
        .where(and(eq(depositSweeps.id, row.id), eq(depositSweeps.status, "pending")));
      console.warn(JSON.stringify({ event: "deposit_sweep_failed", network: chain.network, txId: row.txId, reason: state.reason }));
    }
  }
  return credited;
}

async function creditSweep(db: Db, chain: DepositChain, row: typeof depositSweeps.$inferSelect, now: number): Promise<boolean> {
  const credited = await db.transaction(async (tx) => {
    const [confirmed] = await tx.update(depositSweeps).set({ status: "confirmed", error: null, settledAt: new Date(now) })
      .where(and(eq(depositSweeps.id, row.id), ne(depositSweeps.status, "confirmed")))
      .returning({ id: depositSweeps.id });
    if (!confirmed) return false;
    await recordTopUp(tx, {
      workspaceId: row.workspaceId,
      amountMicroUsd: row.amountMicroUsd,
      payment: { provider: `usdc-${row.network}`, externalId: `${row.network}:${row.txId}`, receiptUrl: chain.explorerTxUrl(row.txId) },
    });
    await tx.update(depositAddresses)
      .set({ unsweptMicroUsd: sql`greatest(${depositAddresses.unsweptMicroUsd} - ${row.amountMicroUsd}, 0)` })
      .where(and(eq(depositAddresses.workspaceId, row.workspaceId), eq(depositAddresses.network, row.network)));
    return true;
  });
  if (credited) {
    console.log(JSON.stringify({
      event: "deposit_credited", network: row.network, workspaceId: row.workspaceId, amountMicroUsd: row.amountMicroUsd.toString(), txId: row.txId,
    }));
  }
  return credited;
}

/** Fondos de la wallet de comisiones de cada red. El cron avisa cuando a alguna le queda poco. */
export async function checkFeeWallets(chains: DepositChain[], reports: ScanReport[]) {
  for (const chain of chains) {
    if (!chain.live) continue;
    try {
      const wallet = await chain.feeWallet();
      if (!wallet.low) continue;
      const report = reports.find((candidate) => candidate.network === chain.network);
      if (report) report.lowFees = true;
      console.error(JSON.stringify({
        event: "deposit_fee_wallet_low", severity: "critical", network: chain.network, address: wallet.address, balance: wallet.balance.toString(),
      }));
    } catch (error) {
      console.error(JSON.stringify({ event: "deposit_fee_wallet_unknown", network: chain.network, message: errorMessage(error) }));
    }
  }
}

/** Desarrollo local: acredita un depósito inventado en la red `dev`, sin cadena. */
export async function simulateDeposit(db: Db, workspaceId: string, amountMicroUsd: bigint, now: number) {
  if (amountMicroUsd < MIN_DEPOSIT_MICRO_USD) throw new Error("Deposit is below the minimum");
  const txId = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(depositSweeps).values({
      id: uuidv7(), workspaceId, network: "dev", address: "dev", amountMicroUsd, txId, status: "confirmed", lastValid: ZERO,
      createdAt: new Date(now), settledAt: new Date(now),
    });
    await recordTopUp(tx, { workspaceId, amountMicroUsd, payment: { provider: "usdc-dev", externalId: `dev:${txId}`, receiptUrl: null } });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
