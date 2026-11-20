// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addToWindow, admissionBudget, admit, budgetShortfall, type OverflowSettings, overflowMonthKey, type PlanUsage, planRemaining, planResumesAt, prepaidRules, splitCharge,
  windowFraction,
} from "@/lib/billing/limits";
import { FIVE_HOUR_MS, packGrant, PACK_OFFERS, PLANS, WEEK_MS } from "@/lib/billing/plans";
import { getCatalog } from "@/lib/catalog/queries";

const now = Date.UTC(2026, 10, 15, 15);
const big = (n: number) => BigInt(n);
const overflow: OverflowSettings = { mode: "continue", packs: true, credits: true, capMicroUsd: big(5_000_000), spentThisMonthMicroUsd: big(0) };
const pro = (fiveHourUsed: number, weekUsed = fiveHourUsed): PlanUsage => ({
  plan: PLANS.pro,
  fiveHour: { usedMicroUsd: big(fiveHourUsed), resetsAt: now + FIVE_HOUR_MS / 2 },
  week: { usedMicroUsd: big(weekUsed), resetsAt: now + WEEK_MS / 2 },
});

describe("plan limits", () => {
  it("the smaller of the two limits wins and never goes negative", () => {
    expect(planRemaining(pro(1_000_000, 1_000_000), now)).toBe(big(4_460_000));
    expect(planRemaining(pro(0, 22_400_000), now)).toBe(big(1_000_000));
    expect(planRemaining(pro(9_000_000, 9_000_000), now)).toBe(big(0));
  });

  it("an expired window counts as empty", () => {
    const usage = pro(5_460_000);
    expect(planRemaining(usage, now)).toBe(big(0));
    expect(planRemaining(usage, now + FIVE_HOUR_MS)).toBe(big(5_460_000));
  });

  it("resumes when the binding window resets: the week when it is full", () => {
    expect(planResumesAt(pro(5_460_000, 10_000_000), now)).toBe(now + FIVE_HOUR_MS / 2);
    expect(planResumesAt(pro(1_000_000, 23_400_000), now)).toBe(now + WEEK_MS / 2);
    expect(planResumesAt(pro(1_000_000), now)).toBeNull();
  });

  it("reports fractions between 0 and 1", () => {
    expect(windowFraction({ usedMicroUsd: big(2_730_000), resetsAt: now + 1 }, PLANS.pro.fiveHourLimitMicroUsd, now)).toBe(0.5);
    expect(windowFraction({ usedMicroUsd: big(9_000_000), resetsAt: now + 1 }, PLANS.pro.fiveHourLimitMicroUsd, now)).toBe(1);
    expect(windowFraction(null, PLANS.pro.fiveHourLimitMicroUsd, now)).toBe(0);
  });

  it("opens a window on first use and adds to an active one", () => {
    expect(addToWindow(null, "five_hour", big(10), now)).toEqual({ usedMicroUsd: big(10), resetsAt: now + FIVE_HOUR_MS, startedAt: now });
    expect(addToWindow({ usedMicroUsd: big(5), resetsAt: now + 1_000 }, "five_hour", big(10), now))
      .toEqual({ usedMicroUsd: big(15), resetsAt: now + 1_000, startedAt: now + 1_000 - FIVE_HOUR_MS });
  });
});

describe("prepaid rules", () => {
  it("depend on the key source, the plan and the overflow settings", () => {
    expect(prepaidRules("plan_only", true, overflow)).toEqual({ packs: false, credits: false, overflow: false });
    expect(prepaidRules("prepaid_only", true, overflow)).toEqual({ packs: true, credits: true, overflow: false });
    expect(prepaidRules("plan_then_prepaid", false, overflow)).toEqual({ packs: true, credits: true, overflow: false });
    expect(prepaidRules("plan_then_prepaid", true, { ...overflow, mode: "stop" })).toEqual({ packs: false, credits: false, overflow: true });
    expect(prepaidRules("plan_then_prepaid", true, { ...overflow, packs: false })).toEqual({ packs: false, credits: true, overflow: true });
  });
});

describe("admission", () => {
  const base = { source: "plan_then_prepaid" as const, overflow, balanceMicroUsd: big(0), packBalanceMicroUsd: big(0), now };

  it("passes on the plan while there is limit left, even with no credits", () => {
    expect(admit({ ...base, plan: pro(0) })).toEqual({ ok: true, usesPlan: true });
  });

  it("continues with a pack or credits after the limit", () => {
    expect(admit({ ...base, plan: pro(5_460_000), packBalanceMicroUsd: big(1) })).toEqual({ ok: true, usesPlan: false });
    expect(admit({ ...base, plan: pro(5_460_000), balanceMicroUsd: big(1) })).toEqual({ ok: true, usesPlan: false });
  });

  it("rejects with the reset time when the limit is spent and overflow can't pay", () => {
    expect(admit({ ...base, plan: pro(5_460_000), balanceMicroUsd: big(1), overflow: { ...overflow, mode: "stop" } }))
      .toEqual({ ok: false, code: "usage_limit_reached", retryAt: now + FIVE_HOUR_MS / 2 });
    expect(admit({ ...base, plan: pro(5_460_000), balanceMicroUsd: big(1), overflow: { ...overflow, spentThisMonthMicroUsd: big(5_000_000) } }))
      .toMatchObject({ ok: false, code: "usage_limit_reached" });
  });

  it("plan-only keys never use money; prepaid-only keys never use the plan", () => {
    expect(admit({ ...base, source: "plan_only", plan: null, balanceMicroUsd: big(10) })).toEqual({ ok: false, code: "no_active_plan", retryAt: null });
    expect(admit({ ...base, source: "plan_only", plan: pro(5_460_000), balanceMicroUsd: big(10) })).toMatchObject({ ok: false, code: "usage_limit_reached" });
    expect(admit({ ...base, source: "prepaid_only", plan: pro(0) })).toEqual({ ok: false, code: "insufficient_credits", retryAt: null });
  });

  it("without a plan behaves like before: positive balance passes", () => {
    expect(admit({ ...base, plan: null, balanceMicroUsd: big(1) })).toEqual({ ok: true, usesPlan: false });
    expect(admit({ ...base, plan: null, balanceMicroUsd: big(0) })).toEqual({ ok: false, code: "insufficient_credits", retryAt: null });
  });
});

describe("admission budget", () => {
  const base = { source: "plan_then_prepaid" as const, overflow, balanceMicroUsd: big(0), packBalanceMicroUsd: big(0), now };

  it("adds the plan left, the pack and the credits the key may use", () => {
    expect(admissionBudget({ ...base, plan: pro(5_000_000), packBalanceMicroUsd: big(100), balanceMicroUsd: big(1_000) }))
      .toBe(big(460_000 + 100 + 1_000));
    expect(admissionBudget({ ...base, plan: null, packBalanceMicroUsd: big(100), balanceMicroUsd: big(1_000) })).toBe(big(1_100));
  });

  it("caps overflow credits with what is left of the monthly cap, and never counts a negative balance", () => {
    expect(admissionBudget({ ...base, plan: pro(5_460_000), balanceMicroUsd: big(9_000_000), overflow: { ...overflow, spentThisMonthMicroUsd: big(4_999_000) } }))
      .toBe(big(1_000));
    expect(admissionBudget({ ...base, plan: pro(5_000_000), balanceMicroUsd: big(-500) })).toBe(big(460_000));
    expect(admissionBudget({ ...base, plan: pro(5_460_000), balanceMicroUsd: big(1_000), overflow: { ...overflow, mode: "stop" } })).toBe(big(0));
  });

  it("plan-only keys count only the plan; prepaid-only keys never count it", () => {
    expect(admissionBudget({ ...base, source: "plan_only", plan: pro(5_000_000), balanceMicroUsd: big(1_000), packBalanceMicroUsd: big(100) }))
      .toBe(big(460_000));
    expect(admissionBudget({ ...base, source: "prepaid_only", plan: pro(0), balanceMicroUsd: big(1_000) })).toBe(big(1_000));
  });

  it("reports a shortfall with the same code as an exhausted budget, retrying at the first window reset", () => {
    expect(budgetShortfall("plan_then_prepaid", pro(5_000_000), now)).toEqual({ ok: false, code: "usage_limit_reached", retryAt: now + FIVE_HOUR_MS / 2 });
    expect(budgetShortfall("plan_only", pro(5_460_000, 23_400_000), now)).toEqual({ ok: false, code: "usage_limit_reached", retryAt: now + WEEK_MS / 2 });
    expect(budgetShortfall("plan_then_prepaid", { plan: PLANS.pro, fiveHour: null, week: null }, now)).toEqual({ ok: false, code: "usage_limit_reached", retryAt: null });
    expect(budgetShortfall("prepaid_only", pro(0), now)).toEqual({ ok: false, code: "insufficient_credits", retryAt: null });
    expect(budgetShortfall("plan_then_prepaid", null, now)).toEqual({ ok: false, code: "insufficient_credits", retryAt: null });
  });
});

describe("charge split", () => {
  const base = { source: "plan_then_prepaid" as const, overflow, packBalanceMicroUsd: big(0), now };
  const total = (split: ReturnType<typeof splitCharge>) => split.plan + split.pack + split.credits + split.absorbed;

  it("the request that crosses the limit is not cut: the rest goes to the pack, then credits", () => {
    const split = splitCharge({ ...base, costMicroUsd: big(300), plan: pro(5_459_900), packBalanceMicroUsd: big(150) });
    expect(split).toEqual({ plan: big(100), pack: big(150), credits: big(50), absorbed: big(0) });
  });

  it("caps overflow credits at the monthly cap and absorbs the rest", () => {
    const split = splitCharge({ ...base, costMicroUsd: big(300), plan: pro(5_460_000), overflow: { ...overflow, spentThisMonthMicroUsd: big(4_999_900) } });
    expect(split).toEqual({ plan: big(0), pack: big(0), credits: big(100), absorbed: big(200) });
  });

  it("absorbs what passes the limit when overflow is stopped", () => {
    const split = splitCharge({ ...base, costMicroUsd: big(300), plan: pro(5_459_900), overflow: { ...overflow, mode: "stop" } });
    expect(split).toEqual({ plan: big(100), pack: big(0), credits: big(0), absorbed: big(200) });
  });

  it("without a plan charges credits in full, even past zero, as before", () => {
    expect(splitCharge({ ...base, costMicroUsd: big(300), plan: null })).toEqual({ plan: big(0), pack: big(0), credits: big(300), absorbed: big(0) });
  });

  it("always adds up to the cost", () => {
    for (const cost of [0, 1, 10, 999, 5_460_001]) {
      for (const used of [0, 5_459_999, 5_460_000]) {
        const split = splitCharge({ ...base, costMicroUsd: big(cost), plan: pro(used), packBalanceMicroUsd: big(37) });
        expect(total(split)).toBe(big(cost));
      }
    }
  });
});

describe("plans and packs config", () => {
  it("every pack is for an active catalog model and grants 20% more", () => {
    const ids = new Set(getCatalog().filter((model) => model.status === "active").map((model) => model.id));
    for (const offer of PACK_OFFERS) expect(ids.has(offer.modelId), offer.modelId).toBe(true);
    expect(packGrant(big(20_000_000))).toBe(big(24_000_000));
  });

  it("limits grow with the price and the week holds more than one window", () => {
    const plans = Object.values(PLANS);
    for (const plan of plans) expect(plan.weekLimitMicroUsd > plan.fiveHourLimitMicroUsd).toBe(true);
    expect(plans.map((plan) => plan.priceMicroUsd)).toEqual([...plans.map((plan) => plan.priceMicroUsd)].sort((a, b) => (a < b ? -1 : 1)));
  });

  it("keys the overflow cap by UTC month", () => {
    expect(overflowMonthKey(Date.UTC(2026, 10, 30, 23, 59))).toBe("2026-11-01");
    expect(overflowMonthKey(Date.UTC(2026, 11, 1))).toBe("2026-12-01");
  });
});
