import { describe, it, expect } from "bun:test";
import {
  createMomentumState,
  gainMomentum,
  tickMomentumDecay,
  effectiveCooldownTicks,
  momentumCap,
  isMaxMomentum,
  momentumDamageMultiplier,
  momentumActionSpeed,
  breakneckRaiseCap,
} from "./momentum.ts";
import { MOMENTUM } from "./momentum.ts";

describe("momentum", () => {
  it("createMomentumState initializes at zero stacks with base cap", () => {
    const state = createMomentumState();
    expect(state.stacks).toBe(0);
    expect(state.baseCap).toBe(50);
    expect(state.capBonus).toBe(0);
    expect(state.decayTicks).toBe(0);
  });

  it("gainMomentum adds stacks up to the cap", () => {
    let state = createMomentumState();
    state = gainMomentum(state, 10);
    expect(state.stacks).toBe(10);
    expect(state.decayTicks).toBe(MOMENTUM.DECAY_TICKS);
  });

  it("gainMomentum respects the cap", () => {
    let state = createMomentumState();
    state = gainMomentum(state, 60);
    expect(state.stacks).toBe(momentumCap(state));
  });

  it("isMaxMomentum returns true only at cap", () => {
    let state = createMomentumState();
    expect(isMaxMomentum(state)).toBe(false);
    state = gainMomentum(state, momentumCap(state));
    expect(isMaxMomentum(state)).toBe(true);
  });

  it("tickMomentumDecay decays one stack after DECAY_TICKS", () => {
    let state = createMomentumState();
    state = gainMomentum(state, 5);
    for (let i = 0; i < MOMENTUM.DECAY_TICKS; i++) {
      state = tickMomentumDecay(state);
    }
    expect(state.stacks).toBe(4);
    expect(state.decayTicks).toBe(MOMENTUM.DECAY_TICKS);
  });

  it("tickMomentumDecay does nothing below zero stacks", () => {
    const state = createMomentumState();
    const after = tickMomentumDecay(state);
    expect(after.stacks).toBe(0);
  });

  it("momentumDamageMultiplier scales with stacks", () => {
    let state = createMomentumState();
    state = gainMomentum(state, 50);
    const mult = momentumDamageMultiplier(state);
    expect(mult).toBeCloseTo(1 + 50 * MOMENTUM.DAMAGE_PER_STACK);
  });

  it("momentumActionSpeed scales with stacks", () => {
    let state = createMomentumState();
    state = gainMomentum(state, 50);
    const speed = momentumActionSpeed(state);
    expect(speed).toBeCloseTo(1 + 50 * MOMENTUM.ACTION_SPEED_PER_STACK);
  });

  it("effectiveCooldownTicks shortens as stacks increase", () => {
    const base = 60;
    let state = createMomentumState();
    const noStacks = effectiveCooldownTicks(base, state);
    state = gainMomentum(state, 50);
    const fullStacks = effectiveCooldownTicks(base, state);
    expect(fullStacks).toBeLessThan(noStacks);
    expect(fullStacks).toBe(Math.floor(base / momentumActionSpeed(state)));
  });

  it("breakneckRaiseCap increases cap bonus up to a limit", () => {
    let state = createMomentumState();
    state = breakneckRaiseCap(state);
    expect(state.capBonus).toBe(1);
    // Cap is 50% of base, so it should stop increasing eventually
    const maxBonus = Math.floor(state.baseCap * 0.5);
    for (let i = 0; i < maxBonus + 10; i++) {
      state = breakneckRaiseCap(state);
    }
    expect(state.capBonus).toBe(maxBonus);
  });
});
