import type { HoldBook } from "./types";

/**
 * Cuánto se recuerda una reserva ya liberada. Solo importa a un request que leyó la base antes de que el cobro
 * de otro terminara y todavía no reservó: eso dura milisegundos, no un minuto.
 */
const RELEASED_MEMORY_MS = 60_000;

interface Released {
  sequence: number;
  at: number;
  amount: bigint;
}

/**
 * Reservas de los requests en curso, en memoria y por instancia (ADR-0066), igual que el rate limiter. Si el
 * proceso muere, sus requests en curso mueren con él: no quedan reservas huérfanas que liberar.
 *
 * Una reserva se libera después de que su cobro quedó en la base. Un request que leyó la base antes de ese cobro
 * todavía no lo ve, así que lo liberado después de su `mark()` sigue contando para él.
 */
export function createHoldBook({ now = Date.now }: { now?: () => number } = {}): HoldBook {
  let sequence = 0;
  let sweptAt = 0;
  const active = new Map<string, bigint>();
  const released = new Map<string, Released[]>();

  const recent = (slot: string, cutoff: number) => {
    const entries = released.get(slot);
    if (!entries) return [];
    const kept = entries.filter((entry) => entry.at > cutoff);
    if (kept.length > 0) released.set(slot, kept);
    else released.delete(slot);
    return kept;
  };

  const heldBy = (slot: string, since: number, cutoff: number) => {
    let total = active.get(slot) ?? BigInt(0);
    for (const entry of recent(slot, cutoff)) if (entry.sequence > since) total += entry.amount;
    return total;
  };

  return {
    mark: () => sequence,
    held(workspaceId, apiKeyId, since) {
      const at = now();
      const cutoff = at - RELEASED_MEMORY_MS;
      // De vez en cuando también se olvidan las liberaciones de workspaces que ya no piden nada.
      if (at - sweptAt > RELEASED_MEMORY_MS) {
        sweptAt = at;
        for (const slot of [...released.keys()]) recent(slot, cutoff);
      }
      return { workspace: heldBy(`workspace:${workspaceId}`, since, cutoff), key: heldBy(`key:${apiKeyId}`, since, cutoff) };
    },
    hold(workspaceId, apiKeyId, amount) {
      if (amount < BigInt(0)) throw new RangeError("A hold must not be negative");
      const slots = [`workspace:${workspaceId}`, `key:${apiKeyId}`];
      for (const slot of slots) active.set(slot, (active.get(slot) ?? BigInt(0)) + amount);
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        sequence++;
        const entry = { sequence, at: now(), amount };
        for (const slot of slots) {
          const left = (active.get(slot) ?? BigInt(0)) - amount;
          if (left > BigInt(0)) active.set(slot, left);
          else active.delete(slot);
          const entries = released.get(slot);
          if (entries) entries.push(entry);
          else released.set(slot, [entry]);
        }
      };
    },
  };
}
