import type { MomentumState, Character } from '../types/game.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'

// Base tuning
// Momentum now caps at 50 stacks. Per-stack values are scaled so the maximum
// effect at 50 stacks matches the old 10-stack cap (e.g. +80% MORE damage).
// The damage bonus is a MORE multiplier, applied multiplicatively in combat.
export const MOMENTUM = {
  BASE_CAP: 50,
  // +1.6% MORE damage per stack -> +80% MORE at 50 stacks (1.8x multiplier)
  DAMAGE_PER_STACK: 0.016,
  // +0.8% action speed per stack -> +40% at 50 stacks
  ACTION_SPEED_PER_STACK: 0.008,
  // +0.4% life regen per stack per second for Marshal -> +20% at 50 stacks
  LIFE_REGEN_PER_STACK: 0.004,
  // +0.4% damage reduction per stack, capped at 20%
  DAMAGE_REDUCTION_PER_STACK: 0.004,
  DAMAGE_REDUCTION_CAP: 0.20,
  // Decay one stack after this many ticks (3 seconds)
  DECAY_TICKS: 3 * TICKS_PER_SECOND,
} as const

export type { MomentumState }

export function createMomentumState(): MomentumState {
  return { stacks: 0, decayTicks: 0, baseCap: MOMENTUM.BASE_CAP, capBonus: 0 }
}

export function momentumCap(state: MomentumState, character?: Character): number {
  let cap = state.baseCap + state.capBonus
  if (character?.special?.warMachine) {
    cap = Math.max(1, cap - 5)
  }
  return cap
}

export function isMaxMomentum(state: MomentumState, character?: Character): boolean {
  return state.stacks >= momentumCap(state, character)
}

export function gainMomentum(state: MomentumState, amount = 1, character?: Character): MomentumState {
  const cap = momentumCap(state, character)
  return { ...state, stacks: Math.min(state.stacks + amount, cap), decayTicks: MOMENTUM.DECAY_TICKS }
}

export function breakneckRaiseCap(state: MomentumState): MomentumState {
  // Breakneck raises the cap by 1 per kill, up to +50% over base
  const maxBonus = Math.floor(state.baseCap * 0.5)
  if (state.capBonus >= maxBonus) return state
  return { ...state, capBonus: Math.min(maxBonus, state.capBonus + 1) }
}

export function tickMomentumDecay(state: MomentumState): MomentumState {
  if (state.stacks <= 0) return state
  const nextDecay = state.decayTicks - 1
  if (nextDecay <= 0) {
    return { ...state, stacks: Math.max(0, state.stacks - 1), decayTicks: MOMENTUM.DECAY_TICKS }
  }
  return { ...state, decayTicks: nextDecay }
}

export function momentumDamageMultiplier(state: MomentumState, character?: Character): number {
  const perStack = character?.special?.warMachine
    ? MOMENTUM.DAMAGE_PER_STACK + 0.05
    : MOMENTUM.DAMAGE_PER_STACK
  return 1 + state.stacks * perStack
}

export function momentumActionSpeed(state: MomentumState, character?: Character): number {
  // Breakneck adds action speed per stack beyond the base amount
  const perStack = character?.special?.breakneck
    ? MOMENTUM.ACTION_SPEED_PER_STACK + 0.02
    : MOMENTUM.ACTION_SPEED_PER_STACK
  return 1 + state.stacks * perStack
}

export function momentumLifeRegenBonus(state: MomentumState, maxLife: number): number {
  return maxLife * MOMENTUM.LIFE_REGEN_PER_STACK * state.stacks
}

export function momentumDamageReduction(state: MomentumState): number {
  return Math.min(MOMENTUM.DAMAGE_REDUCTION_CAP, state.stacks * MOMENTUM.DAMAGE_REDUCTION_PER_STACK)
}

export function effectiveCooldownTicks(baseCooldown: number, state: MomentumState, character?: Character): number {
  return Math.max(1, Math.floor(baseCooldown / momentumActionSpeed(state, character)))
}
