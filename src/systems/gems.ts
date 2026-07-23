import type { Character, EquippedSkill, GemProgress, Support } from '../types/game.ts'
import { GEMS } from '../data/balance.ts'

export function getGemLevel(character: Character, gemId: string): number {
  return character.ownedGems.find(g => g.id === gemId)?.level ?? 1
}

export function getGemProgress(character: Character, gemId: string): GemProgress | undefined {
  return character.ownedGems.find(g => g.id === gemId)
}

export function gemXpForNextLevel(level: number): number {
  return GEMS.XP_PER_LEVEL * level
}

export function skillDamageMultiplier(level: number): number {
  return 1 + (level - 1) * GEMS.SKILL_DAMAGE_PER_LEVEL
}

export function supportModMultiplier(level: number): number {
  return 1 + (level - 1) * GEMS.SUPPORT_MOD_PER_LEVEL
}

export function scaleSupportModifiers(support: Support, level: number) {
  const multiplier = supportModMultiplier(level)
  return support.modifiers.map(mod => ({ ...mod, value: mod.value * multiplier }))
}

export interface GemXpResult {
  ownedGems: GemProgress[]
  leveledUp: { gemId: string; newLevel: number }[]
}

export function addGemXp(character: Character, gemId: string, amount: number): GemXpResult {
  const existing = character.ownedGems.find(g => g.id === gemId)
  if (!existing) {
    return { ownedGems: character.ownedGems, leveledUp: [] }
  }
  let xp = existing.xp + amount
  let level = existing.level
  const leveledUp: { gemId: string; newLevel: number }[] = []
  while (level < GEMS.MAX_LEVEL && xp >= gemXpForNextLevel(level)) {
    xp -= gemXpForNextLevel(level)
    level++
    leveledUp.push({ gemId, newLevel: level })
  }
  const ownedGems = character.ownedGems.map(g => (g.id === gemId ? { ...g, xp, level } : g))
  return { ownedGems, leveledUp }
}

export function gainGemXpForSkillUse(character: Character, equipped: EquippedSkill, damageDealt: number): GemXpResult {
  const ownedGems = [...character.ownedGems]
  const leveledUp: { gemId: string; newLevel: number }[] = []

  // Helper to add XP to a gem in the temporary ownedGems array.
  function addXpToGem(gemId: string, amount: number) {
    const existing = ownedGems.find(g => g.id === gemId)
    if (!existing) return
    let xp = existing.xp + amount
    let level = existing.level
    while (level < GEMS.MAX_LEVEL && xp >= gemXpForNextLevel(level)) {
      xp -= gemXpForNextLevel(level)
      level++
      leveledUp.push({ gemId, newLevel: level })
    }
    const idx = ownedGems.findIndex(g => g.id === gemId)
    ownedGems[idx] = { ...existing, xp, level }
  }

  // Skill gem gains XP on use (scaled by damage dealt, minimum 1).
  addXpToGem(equipped.skillId, Math.max(1, GEMS.XP_PER_SKILL_HIT + Math.floor(damageDealt / 50)))

  // Linked support gems gain XP when the skill fires.
  for (const supportId of equipped.supportIds) {
    addXpToGem(supportId, Math.max(1, GEMS.XP_PER_SUPPORT_HIT + Math.floor(damageDealt / 100)))
  }

  return { ownedGems, leveledUp }
}
