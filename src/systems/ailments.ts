import type { AilmentInstance, CombatEvent } from '../types/game.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'

let ailmentIdCounter = 0

export function makeAilmentId(): string {
  return `ail_${Date.now()}_${ailmentIdCounter++}`
}

type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never

function makeEvent(payload: DistributiveOmit<CombatEvent, 'id' | 'timestamp'>): CombatEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    ...payload,
  } as CombatEvent
}

export function createAilmentFromSkill(
  spec: { type: 'poison' | 'bleed' | 'burn'; damagePerSecond: number; durationSeconds: number; percentOfHit?: number },
  hitDamage: number,
  sourceSkillId: string,
): AilmentInstance {
  const damagePerSecond = spec.damagePerSecond + hitDamage * (spec.percentOfHit ?? 0)
  return {
    id: makeAilmentId(),
    type: spec.type,
    source: 'skill',
    damagePerTick: damagePerSecond / TICKS_PER_SECOND,
    remainingTicks: Math.max(1, Math.floor(spec.durationSeconds * TICKS_PER_SECOND)),
    stacks: 1,
    sourceSkillId,
  }
}

export function createAilmentFromAura(
  type: 'poison' | 'bleed' | 'burn',
  damagePerSecond: number,
  durationSeconds: number,
): AilmentInstance {
  return {
    id: makeAilmentId(),
    type,
    source: 'aura',
    damagePerTick: damagePerSecond / TICKS_PER_SECOND,
    remainingTicks: Math.max(1, Math.floor(durationSeconds * TICKS_PER_SECOND)),
    stacks: 1,
  }
}

export interface AilmentTickResult {
  newAilments: AilmentInstance[]
  totalDamage: number
  events: CombatEvent[]
}

export function tickAilments(
  ailments: AilmentInstance[],
  monsterId: string,
  tickMultiplier = 1,
): AilmentTickResult {
  const newAilments: AilmentInstance[] = []
  let totalDamage = 0
  const events: CombatEvent[] = []

  for (const ailment of ailments) {
    const tickDamage = ailment.damagePerTick * tickMultiplier
    totalDamage += tickDamage
    events.push(makeEvent({
      type: 'dotTick',
      targetId: monsterId,
      source: ailment.source,
      damage: Math.floor(tickDamage),
      ailmentType: ailment.type,
    }))
    const nextRemaining = ailment.remainingTicks - 1
    if (nextRemaining > 0) {
      newAilments.push({ ...ailment, remainingTicks: nextRemaining })
    } else {
      events.push(makeEvent({
        type: 'ailmentExpired',
        targetId: monsterId,
        ailmentType: ailment.type,
      }))
    }
  }

  return { newAilments, totalDamage: Math.floor(totalDamage), events }
}

export function addAilment(
  existing: AilmentInstance[],
  ailment: AilmentInstance,
): { ailments: AilmentInstance[]; event: CombatEvent } {
  const merged = [...existing, ailment]
  const event = makeEvent({
    type: 'ailmentApplied',
    targetId: 'unknown',
    ailmentType: ailment.type,
  })
  return { ailments: merged, event }
}

export function spreadAilmentsToPack(
  sourceAilments: AilmentInstance[],
  targetCount: number,
): AilmentInstance[] {
  const spread: AilmentInstance[] = []
  for (const ailment of sourceAilments) {
    for (let i = 0; i < targetCount; i++) {
      spread.push({ ...ailment, id: makeAilmentId(), damagePerTick: ailment.damagePerTick * 0.5, stacks: 1 })
    }
  }
  return spread
}

// Virulent helpers
export function septicemiaTickMultiplier(stacks: number): number {
  // +5% tick rate per stack, compounding lightly
  return 1 + stacks * 0.05
}

export function cardiacArrestThreshold(stacks: number): boolean {
  // Flare every 10 stacks
  return stacks >= 10
}
