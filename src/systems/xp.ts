import type { Character } from '../types/game.ts'
import { experienceForLevel, CHARACTER, TICKS_PER_SECOND } from '../data/balance.ts'

export function getExperienceToNextLevel(level: number): number {
  return experienceForLevel(level)
}

export function addExperience(character: Character, amount: number): Character {
  if (!character.isAlive || amount <= 0) return character

  let next = { ...character, experience: character.experience + amount }
  const experienceToNext = getExperienceToNextLevel(next.level)

  if (next.experience >= experienceToNext) {
    next.experience -= experienceToNext
    next.level = Math.min(next.level + 1, CHARACTER.MAX_LEVEL)
    next.experienceToNext = getExperienceToNextLevel(next.level)
    next.passivePoints += 1
    // Stats will be recalculated by the store from equipment/class data
  }

  return next
}

export function addExperienceAmount(character: Character, amount: number): { character: Character; levelsGained: number } {
  if (amount <= 0) return { character, levelsGained: 0 }
  let next = { ...character }
  let remaining = amount
  let levels = 0
  while (remaining > 0 && next.level < CHARACTER.MAX_LEVEL) {
    const experienceToNext = getExperienceToNextLevel(next.level)
    const toNext = Math.max(0, experienceToNext - next.experience)
    if (remaining >= toNext) {
      remaining -= toNext
      next = {
        ...next,
        experience: 0,
        level: next.level + 1,
        experienceToNext: getExperienceToNextLevel(next.level + 1),
        passivePoints: next.passivePoints + 1,
      }
      levels++
    } else {
      next = { ...next, experience: next.experience + remaining }
      remaining = 0
    }
  }
  // Cap at max level: any excess XP beyond the final level is discarded
  if (next.level >= CHARACTER.MAX_LEVEL) {
    next = { ...next, experience: Math.min(next.experience, getExperienceToNextLevel(next.level)) }
  }
  return { character: next, levelsGained: levels }
}

export function applyDeathPenalty(character: Character): Character {
  const xpToNext = getExperienceToNextLevel(character.level)
  const penalty = Math.floor(xpToNext * CHARACTER.XP_DEATH_PENALTY)
  return {
    ...character,
    experience: Math.max(0, character.experience - penalty),
    isAlive: false,
    respawnTimer: CHARACTER.RESPAWN_TIME_SECONDS * TICKS_PER_SECOND, // ticks
  }
}
