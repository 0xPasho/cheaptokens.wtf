// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRateLimiter } from "@/lib/rate-limit/memory";
import type { RateLimiter } from "@/lib/rate-limit/types";

describe("createMemoryRateLimiter", () => {
  let time: number;
  let limiter: RateLimiter;

  beforeEach(() => {
    time = 0;
    limiter = createMemoryRateLimiter({ now: () => time });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deja pasar N requests y rechaza el N+1, indicando cuántos quedan", async () => {
    expect(await limiter.limit("workspace-a", 3)).toEqual({ ok: true, remaining: 2 });
    expect(await limiter.limit("workspace-a", 3)).toEqual({ ok: true, remaining: 1 });
    expect(await limiter.limit("workspace-a", 3)).toEqual({ ok: true, remaining: 0 });
    expect(await limiter.limit("workspace-a", 3)).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("mantiene el límite con llamadas simultáneas", async () => {
    const decisions = await Promise.all(Array.from({ length: 10 }, () => limiter.limit("workspace-a", 3)));
    expect(decisions.filter((decision) => decision.ok)).toHaveLength(3);
    expect(decisions.filter((decision) => !decision.ok)).toHaveLength(7);
  });

  it("calcula retryAfterSeconds desde el request más viejo y redondea hacia arriba", async () => {
    await limiter.limit("workspace-a", 2);
    time = 10_000;
    await limiter.limit("workspace-a", 2);
    time = 15_001;
    expect(await limiter.limit("workspace-a", 2)).toEqual({ ok: false, retryAfterSeconds: 45 });
    time = 59_999;
    expect(await limiter.limit("workspace-a", 2)).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it("libera cada request exactamente a los 60 s sin reiniciar toda la ventana", async () => {
    await limiter.limit("workspace-a", 2);
    time = 10_000;
    await limiter.limit("workspace-a", 2);
    time = 60_000;
    expect(await limiter.limit("workspace-a", 2)).toEqual({ ok: true, remaining: 0 });
    expect(await limiter.limit("workspace-a", 2)).toEqual({ ok: false, retryAfterSeconds: 10 });
    time = 70_000;
    expect(await limiter.limit("workspace-a", 2)).toEqual({ ok: true, remaining: 0 });
  });

  it("los rechazos no prolongan la ventana ni consumen cupo", async () => {
    await limiter.limit("workspace-a", 1);
    time = 30_000;
    expect(await limiter.limit("workspace-a", 1)).toEqual({ ok: false, retryAfterSeconds: 30 });
    time = 60_000;
    expect(await limiter.limit("workspace-a", 1)).toEqual({ ok: true, remaining: 0 });
  });

  it("dos workspaces no se afectan entre sí", async () => {
    await limiter.limit("workspace-a", 1);
    expect(await limiter.limit("workspace-a", 1)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(await limiter.limit("workspace-b", 1)).toEqual({ ok: true, remaining: 0 });
    time = 60_000;
    expect(await limiter.limit("workspace-b", 1)).toEqual({ ok: true, remaining: 0 });
    expect(await limiter.limit("workspace-a", 1)).toEqual({ ok: true, remaining: 0 });
  });

  it("dos instancias tienen estado independiente", async () => {
    await limiter.limit("workspace-a", 1);
    const other = createMemoryRateLimiter({ now: () => time });
    expect(await other.limit("workspace-a", 1)).toEqual({ ok: true, remaining: 0 });
  });

  it("descarta toda la ventana tras un período de inactividad", async () => {
    await limiter.limit("workspace-a", 3);
    await limiter.limit("workspace-a", 3);
    time = 600_000;
    expect(await limiter.limit("workspace-a", 3)).toEqual({ ok: true, remaining: 2 });
  });

  it("aplica cambios del límite al historial vigente", async () => {
    await limiter.limit("workspace-a", 3);
    await limiter.limit("workspace-a", 3);
    expect(await limiter.limit("workspace-a", 1)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(await limiter.limit("workspace-a", 4)).toEqual({ ok: true, remaining: 1 });
  });

  it("usa Date.now cuando no se inyecta un reloj", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const defaultLimiter = createMemoryRateLimiter();
    await defaultLimiter.limit("workspace-a", 1);
    vi.advanceTimersByTime(59_001);
    expect(await defaultLimiter.limit("workspace-a", 1)).toEqual({ ok: false, retryAfterSeconds: 1 });
    vi.advanceTimersByTime(999);
    expect(await defaultLimiter.limit("workspace-a", 1)).toEqual({ ok: true, remaining: 0 });
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rechaza un límite inválido: %s",
    async (perMinute) => {
      await expect(limiter.limit("workspace-a", perMinute)).rejects.toThrow(RangeError);
    },
  );
});
