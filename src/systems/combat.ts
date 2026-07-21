import type { Character, CombatState, Monster } from '../types/game.ts'
import { DAMAGE } from '../data/balance.ts'
import { applyDeathPenalty } from './xp.ts'

export interface CombatResult {
  character: Character
  combat: CombatState
  goldEarned: number
  xpEarned: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function rollDamage(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function hitChance(attackerAccuracy: number, defenderEvasion: number): number {
  return clamp(0.5 + (attackerAccuracy - defenderEvasion) / 200, 0.05, 0.95)
}

function armourMitigation(armour: number, damage: number): number {
  return armour / (armour + DAMAGE.ARMOUR_MITIGATION_DENOMINATOR * damage)
}

function calculateArmour(character: Character): number {
  // In M1, armour scales with strength. M2 adds gear.
  return character.attributes.strength * 2
}

export function createCombatState(monster: Monster): CombatState {
  return {
    monster,
    monsterLife: monster.life,
    lastDamageDealt: 0,
    lastDamageTaken: 0,
    combatLog: [],
    isRespawning: false,
    respawnTicks: 0,
  }
}

export function processCombatTick(
  character: Character,
  combat: CombatState,
): CombatResult {
  let nextChar = { ...character }
  let nextCombat = { ...combat }
  let goldEarned = 0
  let xpEarned = 0

  // Regenerate energy shield passively (simplified v1 rule)
  if (nextChar.energyShield < nextChar.maxEnergyShield && nextChar.isAlive) {
    nextChar.energyShield = Math.min(
      nextChar.maxEnergyShield,
      nextChar.energyShield + Math.max(1, Math.floor(nextChar.maxEnergyShield * 0.01)),
    )
  }

  if (!nextChar.isAlive) {
    nextChar = tickRespawnFn(nextChar)
    return { character: nextChar, combat: nextCombat, goldEarned, xpEarned }
  }

  if (!nextCombat.monster) {
    return { character: nextChar, combat: nextCombat, goldEarned, xpEarned }
  }

  const monster = nextCombat.monster

  // Player attacks monster
  if (nextCombat.monsterLife > 0) {
    const isHit = Math.random() <= hitChance(nextChar.accuracy, monster.evasion)
    if (isHit) {
      const rawDamage = rollDamage(nextChar.basePhysicalDamageMin, nextChar.basePhysicalDamageMax)
      // Apply strength melee damage bonus
      const strBonus = 1 + (nextChar.attributes.strength * 0.002)
      // Armour mitigation from monster (monsters have armour = level * 2 for now)
      const monsterArmour = monster.level * 2
      const mitigation = armourMitigation(monsterArmour, rawDamage)
      const mitigatedDamage = Math.max(1, Math.floor(rawDamage * (1 - mitigation) * strBonus))
      const isCrit = Math.random() <= clamp(nextChar.criticalChance, 0, DAMAGE.CRITICAL_CHANCE_CAP)
      const finalDamage = isCrit
        ? Math.floor(mitigatedDamage * nextChar.criticalMultiplier)
        : mitigatedDamage

      nextCombat.lastDamageDealt = finalDamage
      nextCombat.monsterLife = Math.max(0, nextCombat.monsterLife - finalDamage)
    }
  }

  // Monster attacks player
  if (nextCombat.monsterLife > 0) {
    const monsterHit = Math.random() <= hitChance(monster.accuracy, nextChar.evasion)
    if (monsterHit) {
      const rawMonsterDamage = rollDamage(monster.physicalDamageMin, monster.physicalDamageMax)
      const armour = calculateArmour(nextChar)
      const mitigation = armourMitigation(armour, rawMonsterDamage)
      const damageTaken = Math.max(1, Math.floor(rawMonsterDamage * (1 - mitigation)))
      nextCombat.lastDamageTaken = damageTaken

      // ES absorbs damage first
      if (nextChar.energyShield > 0) {
        const shieldAbsorb = Math.min(nextChar.energyShield, damageTaken)
        nextChar.energyShield -= shieldAbsorb
        const remainingDamage = damageTaken - shieldAbsorb
        nextChar.life -= remainingDamage
      } else {
        nextChar.life -= damageTaken
      }

      if (nextChar.life <= 0) {
        nextChar.life = 0
        nextChar = applyDeathPenalty(nextChar)
        nextCombat.isRespawning = true
        nextCombat.respawnTicks = nextChar.respawnTimer
        return { character: nextChar, combat: nextCombat, goldEarned, xpEarned }
      }
    } else {
      nextCombat.lastDamageTaken = 0
    }
  }

  // Monster killed
  if (nextCombat.monsterLife <= 0) {
    goldEarned = monster.goldReward
    xpEarned = monster.experienceReward
    nextCombat.combatLog = [
      `Killed ${monster.name}`,
      ...nextCombat.combatLog,
    ].slice(0, 20)

    // Spawn next monster of same type immediately for idle loop
    nextCombat.monsterLife = monster.maxLife
  }

  return { character: nextChar, combat: nextCombat, goldEarned, xpEarned }
}

function tickRespawnFn(character: Character): Character {
  if (character.isAlive) return character
  const nextTimer = character.respawnTimer - 1
  if (nextTimer <= 0) {
    return {
      ...character,
      isAlive: true,
      life: character.maxLife,
      energyShield: character.maxEnergyShield,
      respawnTimer: 0,
    }
  }
  return { ...character, respawnTimer: nextTimer }
}

