import { describe, it, expect } from "bun:test";
import { createAilmentFromSkill, createAilmentFromAura, tickAilments } from "./ailments.ts";
import { TICKS_PER_SECOND } from "../data/balance.ts";
import type { AilmentInstance } from "../types/game.ts";

describe("ailments", () => {
  it("createAilmentFromSkill uses flat damage", () => {
    const ailment = createAilmentFromSkill(
      { type: "bleed", damagePerSecond: 10, durationSeconds: 5 },
      100,
      "skill1"
    );
    expect(ailment.damagePerTick).toBeCloseTo(10 / TICKS_PER_SECOND);
    expect(ailment.remainingTicks).toBe(Math.floor(5 * TICKS_PER_SECOND));
    expect(ailment.type).toBe("bleed");
    expect(ailment.sourceSkillId).toBe("skill1");
  });

  it("createAilmentFromSkill adds percent of hit damage", () => {
    const ailment = createAilmentFromSkill(
      { type: "poison", damagePerSecond: 0, durationSeconds: 3, percentOfHit: 0.2 },
      100,
      "skill1"
    );
    expect(ailment.damagePerTick).toBeCloseTo(20 / TICKS_PER_SECOND);
  });

  it("createAilmentFromAura creates an aura ailment", () => {
    const ailment = createAilmentFromAura("burn", 30, 2);
    expect(ailment.type).toBe("burn");
    expect(ailment.source).toBe("aura");
    expect(ailment.remainingTicks).toBe(Math.floor(2 * TICKS_PER_SECOND));
  });

  it("tickAilments deals damage and expires", () => {
    const ailment = createAilmentFromAura("burn", 10, 1);
    let current: AilmentInstance[] = [ailment];
    let total = 0;
    let ticked = 0;
    while (current.length > 0 && ticked < 100) {
      const result = tickAilments(current, "m1", 1);
      current = result.newAilments;
      total += result.totalDamage;
      ticked++;
    }
    expect(total).toBeGreaterThan(0);
    expect(current.length).toBe(0);
    expect(ticked).toBeGreaterThan(0);
  });

  it("tickAilments respects tick multiplier", () => {
    const ailment = createAilmentFromAura("poison", 10, 1);
    const result = tickAilments([ailment], "m1", 2);
    expect(result.totalDamage).toBeCloseTo((10 / TICKS_PER_SECOND) * 2);
  });
});
