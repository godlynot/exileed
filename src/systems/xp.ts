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
