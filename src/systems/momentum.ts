import type { MomentumState } from '../types/game.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'

// Base tuning
export const MOMENTUM = {
  BASE_CAP: 10,
  // +8% damage per stack
  DAMAGE_PER_STACK: 0.08,
  // +4% action speed per stack (cooldown reduction)
  ACTION_SPEED_PER_STACK: 0.04,
  // +2% life regen per stack per second for Marshal
  LIFE_REGEN_PER_STACK: 0.02,
  // +2% damage reduction per stack, capped at 20%
  DAMAGE_REDUCTION_PER_STACK: 0.02,
  DAMAGE_REDUCTION_CAP: 0.20,
  // Decay one stack after this many ticks (3 seconds)
  DECAY_TICKS: 3 * TICKS_PER_SECOND,
} as const

export type { MomentumState }

export function createMomentumState(): MomentumState {
  return { stacks: 0, decayTicks: 0, baseCap: MOMENTUM.BASE_CAP, capBonus: 0 }
}

export function momentumCap(state: MomentumState): number {
  return state.baseCap + state.capBonus
}

export function isMaxMomentum(state: MomentumState): boolean {
  return state.stacks >= momentumCap(state)
}

export function gainMomentum(state: MomentumState, amount = 1): MomentumState {
  const cap = momentumCap(state)
  return { ...state, stacks: Math.min(state.stacks + amount, cap), decayTicks: MOMENTUM.DECAY_TICKS }
}

export function breakneckRaiseCap(state: MomentumState): MomentumState {
  // Breakneck raises the cap by 1 per kill, up to +50% over base (hard ceiling of 15)
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

export function momentumDamageMultiplier(state: MomentumState): number {
  return 1 + state.stacks * MOMENTUM.DAMAGE_PER_STACK
}

export function momentumActionSpeed(state: MomentumState): number {
  return 1 + state.stacks * MOMENTUM.ACTION_SPEED_PER_STACK
}

export function momentumLifeRegenBonus(state: MomentumState, maxLife: number): number {
  return maxLife * MOMENTUM.LIFE_REGEN_PER_STACK * state.stacks
}

export function momentumDamageReduction(state: MomentumState): number {
  return Math.min(MOMENTUM.DAMAGE_REDUCTION_CAP, state.stacks * MOMENTUM.DAMAGE_REDUCTION_PER_STACK)
}

export function effectiveCooldownTicks(baseCooldown: number, state: MomentumState): number {
  return Math.max(1, Math.floor(baseCooldown / momentumActionSpeed(state)))
}
