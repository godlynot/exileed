import type {
  Character,
  CombatEvent,
  CombatState,
  GameState,
  Monster,
  MonsterRarity,
  PassiveSpecialEffects,
  Zone,
  DamageType,
  EquippedSkill,
  Skill,
  Support,
  AilmentInstance,
} from '../types/game.ts'
import { DAMAGE, MONSTER, RECOVERY, TICKS_PER_SECOND, TICK_RATE, monsterScalingMultiplier } from '../data/balance.ts'
import { applyDeathPenalty, addExperience } from './xp.ts'
import { dropItem, recalculateCharacterFromEquipment } from './items.ts'
import { applyPassiveStats, applyAscendancyStats } from './passives.ts'
import { MONSTERS } from '../data/monsters.ts'
import { SKILLS } from '../data/skills.ts'
import { SUPPORTS } from '../data/supports.ts'
import {
  MONSTER_MODIFIERS_BY_ID,
  REWARD_MULTIPLIERS,
  rollModifiers,
  rollRarity,
  scaleModifierValue,
} from '../data/monsterModifiers.ts'
import { createMomentumState, gainMomentum, tickMomentumDecay, effectiveCooldownTicks, momentumDamageMultiplier, isMaxMomentum, breakneckRaiseCap } from './momentum.ts'
import { createAilmentFromSkill, createAilmentFromAura, tickAilments } from './ailments.ts'
import { getGemLevel, gainGemXpForSkillUse, skillDamageMultiplier } from './gems.ts'

let eventIdCounter = 0

type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never

function makeEvent(payload: DistributiveOmit<CombatEvent, 'id' | 'timestamp'>): CombatEvent {
  return {
    id: `evt_${Date.now()}_${eventIdCounter++}`,
    timestamp: Date.now(),
    ...payload,
  } as CombatEvent
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function rollDamage(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function evadeChance(defenderEvasion: number, attackerAccuracy: number): number {
  // Asymptotic evasion: the more evasion you have, the harder each extra point
  // is to notice. Keeps 1k+ evasion strong (≈70-75%) without ever quite reaching
  // the cap, so accuracy still matters and evasion remains a viable alternative
  // to armour without trivialising attacks.
  const accuracyScale = Math.max(attackerAccuracy, 1)
  const chance = 1 - Math.exp(-defenderEvasion / (accuracyScale * 0.75))
  return Math.min(chance, DAMAGE.EVASION_CAP)
}

export function hitChance(attackerAccuracy: number, defenderEvasion: number, stacks: number = 0): number {
  const base = clamp(1 - evadeChance(defenderEvasion, attackerAccuracy), 0.05, 1)
  const bonus = Math.min(stacks * DAMAGE.EVASION_STREAK_BONUS_PER_STACK, DAMAGE.EVASION_STREAK_BONUS_MAX)
  return clamp(base + bonus, 0.05, 1)
}

export function armourMitigation(armour: number, damage: number): number {
  if (damage <= 0) return 0
  return armour / (armour + DAMAGE.ARMOUR_MITIGATION_DENOMINATOR * damage)
}

function getDamageTakenMultiplier(special: PassiveSpecialEffects | undefined, isLightning = false): number {
  if (!special) return 1
  let multiplier = 1
  if (special.increasedDamageTaken) {
    multiplier += special.increasedDamageTaken / 100
  }
  if (isLightning && special.increasedLightningDamageTaken) {
    multiplier += special.increasedLightningDamageTaken / 100
  }
  return multiplier
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
    events: [],
    ticksSinceDamageTaken: 0,
    playerEvasionStacks: 0,
    monsterEvasionStacks: 0,
    momentum: createMomentumState(),
    herald: { active: [], tideRamp: 0, hitTargets: [] },
    marshal: { army: null, bulwarkFlat: 0, bulwarkTicksRemaining: 0 },
    delayedDamageQueue: [],
    ailments: {},
    virulent: { stacks: {}, septicemiaMultiplier: {}, calcifyAccumulator: {}, slow: {}, patientZeroTarget: null },
    monsterDebuffs: {},
    plaguewindCarryover: [],
    packDamageCarryover: 0,
    damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
    deathSummary: null,
  }
}

function scaleMonster(monster: Monster, zone: Zone): Monster {
  if (monster.level === zone.level) return monster

  // Front-loaded act scaling: scale relative to the monster's natural level
  // using the same curve the rest of the campaign uses.
  const zoneMult = monsterScalingMultiplier(zone.level)
  const monMult = monsterScalingMultiplier(monster.level)
  const combatMult = zoneMult / monMult

  const xpMult = Math.pow(MONSTER.XP_MULTIPLIER_PER_LEVEL, zone.level - monster.level)
  const goldMult = Math.pow(MONSTER.GOLD_MULTIPLIER_PER_LEVEL, zone.level - monster.level)

  return {
    ...monster,
    level: zone.level,
    life: Math.floor(monster.maxLife * combatMult),
    maxLife: Math.floor(monster.maxLife * combatMult),
    damage: monster.damage.map(d => ({
      ...d,
      min: Math.max(1, Math.floor(d.min * combatMult)),
      max: Math.max(1, Math.floor(d.max * combatMult)),
    })),
    experienceReward: Math.floor(monster.experienceReward * xpMult),
    goldReward: Math.floor(monster.goldReward * goldMult),
  }
}

function createMonster(zone: Zone): Monster {
  const pool = zone.monsterIds.length > 0 ? zone.monsterIds : zone.monsterId ? [zone.monsterId] : []
  const id = pool[Math.floor(Math.random() * pool.length)]
  const template = MONSTERS[id]
  if (!template) {
    throw new Error(`Unknown monster id: ${id}`)
  }
  let monster = { ...template, life: template.maxLife }
  monster = scaleMonster(monster, zone)

  // Bosses are hand-tuned and never roll modifiers.
  if (monster.rarity === 'boss') {
    return monster
  }

  // Determine rarity: normal / magic / rare.
  const rarity: MonsterRarity = zone.eliteChance > 0 ? rollRarity(zone.level) : 'normal'
  const modifiers = rarity !== 'normal' ? rollModifiers(rarity, zone.level) : []

  // Apply modifiers in order: additive first, then multiplicative.
  let lifeMult = 1
  let damageMult = 1
  let attackRateMult = 1
  let armourAdd = 0
  let evasionAdd = 0
  let accuracyAdd = 0
  let aura = monster.aura

  for (const mod of modifiers) {
    if (mod.lifeMult) lifeMult *= mod.lifeMult
    if (mod.damageMult) damageMult *= mod.damageMult
    if (mod.attackRateMult) attackRateMult *= mod.attackRateMult
    if (mod.armourAdd) armourAdd += mod.armourAdd
    if (mod.evasionAdd) evasionAdd += mod.evasionAdd
    if (mod.accuracyAdd) accuracyAdd += mod.accuracyAdd
    if (mod.aura) {
      // If multiple auras somehow roll, keep the strongest nearby-ally bonus.
      const current = aura?.nearbyAlliesDamagePercent ?? 0
      const next = mod.aura.nearbyAlliesDamagePercent
      if (next > current) {
        aura = { nearbyAlliesDamagePercent: next }
      }
    }
  }

  // Scale additive values to the zone level.
  const scaledArmourAdd = scaleModifierValue(armourAdd, zone.level)
  const scaledEvasionAdd = scaleModifierValue(evasionAdd, zone.level)
  const scaledAccuracyAdd = scaleModifierValue(accuracyAdd, zone.level)

  const rewardMult = REWARD_MULTIPLIERS[rarity]

  monster = {
    ...monster,
    rarity,
    modifierIds: modifiers.map(m => m.id),
    life: Math.floor(monster.life * lifeMult),
    maxLife: Math.floor(monster.maxLife * lifeMult),
    damage: monster.damage.map(d => ({
      ...d,
      min: Math.max(1, Math.floor(d.min * damageMult)),
      max: Math.max(1, Math.floor(d.max * damageMult)),
    })),
    attackRate: monster.attackRate * attackRateMult,
    accuracy: monster.accuracy + scaledAccuracyAdd,
    evasion: monster.evasion + scaledEvasionAdd,
    armour: (monster.armour ?? 0) + scaledArmourAdd,
    experienceReward: Math.floor(monster.experienceReward * rewardMult),
    goldReward: Math.floor(monster.goldReward * rewardMult),
    aura,
  }

  return monster
}

export function applyResistance(resistance: number, damage: number, cap: number = DAMAGE.RESISTANCE_CAP): number {
  const effective = clamp(resistance, -1, cap)
  return Math.max(0, damage * (1 - effective))
}

function recalcCharacter(state: GameState, character: Character): Character {
  let c = recalculateCharacterFromEquipment(character, state.equipment)
  c = applyPassiveStats(c, state.passiveTree)
  c = applyAscendancyStats(c)
  if (c.devOverrides && Object.keys(c.devOverrides).length > 0) {
    c = { ...c, ...c.devOverrides }
    c.life = Math.min(c.life, c.maxLife)
    c.energyShield = Math.min(c.energyShield, c.maxEnergyShield)
  }
  return c
}

function supportsForSkill(equipped: EquippedSkill, skill: Skill): Support[] {
  return equipped.supportIds
    .map(id => SUPPORTS[id])
    .filter(s => !!s && s.allowedTags.some(tag => skill.tags.includes(tag)))
}

function aggregateSupportModifiers(supports: Support[], supportIds: string[], character: Character) {
  const flat: Record<string, number> = {}
  const increased: Record<string, number> = {}
  const more: Record<string, number> = {}
  for (let i = 0; i < supports.length; i++) {
    const support = supports[i]
    const level = getGemLevel(character, supportIds[i])
    const multiplier = 1 + (level - 1) * 0.02
    for (const mod of support.modifiers) {
      if (mod.mode === 'flat') flat[mod.stat] = (flat[mod.stat] ?? 0) + mod.value * multiplier
      if (mod.mode === 'increased') increased[mod.stat] = (increased[mod.stat] ?? 0) + mod.value * multiplier
      if (mod.mode === 'more') more[mod.stat] = (more[mod.stat] ?? 0) + mod.value * multiplier
    }
  }
  return { flat, increased, more }
}

function isFirstHit(combat: CombatState, monsterId: string): boolean {
  return !combat.herald.hitTargets.includes(monsterId)
}

function markHit(combat: CombatState, monsterId: string): CombatState {
  if (combat.herald.hitTargets.includes(monsterId)) return combat
  return { ...combat, herald: { ...combat.herald, hitTargets: [...combat.herald.hitTargets, monsterId] } }
}

function heraldDamageMultiplier(character: Character, combat: CombatState, monster: Monster, isFirstHitTarget: boolean): number {
  const special = character.special
  const active = combat.herald.active
  if (active.length === 0) return 1

  let multiplier = 1
  for (const aura of active) {
    if (aura === 'light') {
      multiplier += special.unwaveringDeclaration ? 0.18 : 0.1
      // Unwavering Light: blinded enemies take further increased damage
      if (special.unwaveringDeclaration && combat.monsterDebuffs.blind) {
        multiplier += 0.15
      }
    }
    if (aura === 'gold') { /* no combat damage */ }
    if (aura === 'tide') multiplier += combat.herald.tideRamp * (special.unwaveringDeclaration ? 0.5 : 0.3)
    if (aura === 'silence') { /* damage reduction, handled elsewhere */ }
    if (aura === 'storms') { /* handled in tick storm */ }
    if (aura === 'judgment') {
      const healthPercent = combat.monsterLife / monster.maxLife
      if (healthPercent <= 0.2) {
        multiplier += special.unwaveringDeclaration ? 0.35 : 0.2
      }
    }
  }

  if (special.foretoldEnd && isFirstHitTarget) {
    multiplier += 0.4
  }

  return multiplier
}

function heraldDamageReduction(combat: CombatState, special: PassiveSpecialEffects): number {
  const active = combat.herald.active
  if (active.length === 0) return 0
  return active.includes('silence') ? (special.unwaveringDeclaration ? 0.12 : 0.08) : 0
}

export function skillDamage(
  character: Character,
  equipped: EquippedSkill,
  skill: Skill,
  monster: Monster,
  evasionStacks: number,
  combat: CombatState,
): {
  damage: number
  damageType: DamageType
  crit: boolean
  isHit: boolean
  nextEquipped: EquippedSkill
  ailments: AilmentInstance[]
} {
  const supports = supportsForSkill(equipped, skill)
  const supportMods = aggregateSupportModifiers(supports, equipped.supportIds, character)
  const supportActionSpeed = ((supportMods.increased['inc_attack_speed_percent'] ?? 0) + (supportMods.increased['inc_cast_speed_percent'] ?? 0)) / 100

  const isHit = character.special.alwaysHit ? true : Math.random() <= hitChance(character.accuracy, monster.evasion, evasionStacks)
  if (!isHit) {
    return { damage: 0, damageType: skill.damageType, crit: false, isHit: false, nextEquipped: { ...equipped, cooldownRemaining: effectiveCooldownTicks(skill.cooldownTicks, combat.momentum, character, supportActionSpeed) }, ailments: [] }
  }

  const effectiveness = skill.damageEffectiveness
  const flatPhys = (supportMods.flat['flat_phys_damage'] ?? 0) * effectiveness
  const flatFire = (supportMods.flat['flat_fire_damage'] ?? 0) * effectiveness
  const flatCold = (supportMods.flat['flat_cold_damage'] ?? 0) * effectiveness
  const flatLightning = (supportMods.flat['flat_lightning_damage'] ?? 0) * effectiveness

  const weaponMin = character.basePhysicalDamageMin ?? 0
  const weaponMax = character.basePhysicalDamageMax ?? 0
  const levelMultiplier = 1 + (character.level - 1) * 0.05
  const gemLevel = getGemLevel(character, equipped.skillId)
  const gemMultiplier = skillDamageMultiplier(gemLevel)
  const isAttack = skill.tags.includes('attack')
  const baseMin = skill.baseDamageMin + (isAttack ? weaponMin : 0)
  const baseMax = skill.baseDamageMax + (isAttack ? weaponMax : 0)
  const rawBaseRoll = character.special.perfectCalculation
    ? baseMax
    : rollDamage(baseMin, baseMax)
  const rawBase = Math.floor(rawBaseRoll * levelMultiplier * gemMultiplier)
  const lightningPct = Math.min(1, (character.special.physToLightning ?? 0) / 100)

  const incPhys = (character.increasedPhysicalDamage + (supportMods.increased['inc_phys_damage_percent'] ?? 0) / 100)
  const morePhys = character.morePhysicalDamage * (1 + (supportMods.more['inc_phys_damage_percent'] ?? 0) / 100) * (character.special.moreDamageMultiplier ?? 1)

  const incSpell = (character.increasedSpellDamage + (supportMods.increased['inc_spell_damage_percent'] ?? 0) / 100)
  const moreSpell = character.moreSpellDamage * (1 + (supportMods.more['inc_spell_damage_percent'] ?? 0) / 100) * (character.special.moreDamageMultiplier ?? 1)

  const incEle = (supportMods.increased['inc_ele_damage_percent'] ?? 0) / 100
  const moreEle = 1 + (supportMods.more['inc_ele_damage_percent'] ?? 0) / 100

  const monsterArmour = (monster.armour ?? 0) + monster.level * 2

  // Support specials
  const hasExtraProjectile = supports.some(s => s.special === 'extraProjectile') && skill.tags.includes('projectile')
  const hasConvertChaos = supports.some(s => s.special === 'convertPhysicalToChaos')

  let damage = 0
  if (skill.damageType === 'physical') {
    const chaosPct = hasConvertChaos ? 0.5 : 0
    const totalConvert = Math.min(1, lightningPct + chaosPct)
    let normLightning = 0
    let normChaos = 0
    if (totalConvert > 0) {
      normLightning = lightningPct / (lightningPct + chaosPct)
      normChaos = chaosPct / (lightningPct + chaosPct)
    }
    const physicalPart = Math.floor(rawBase * (1 - totalConvert)) + flatPhys
    const lightningPart = Math.floor(rawBase * totalConvert * normLightning) + flatLightning
    const chaosPart = Math.floor(rawBase * totalConvert * normChaos)
    // Armour mitigation applies to the final scaled physical portion, not the raw base roll
    const unmitigatedPhys = physicalPart * (1 + incPhys) * morePhys
    const mitigation = armourMitigation(monsterArmour, unmitigatedPhys)
    const physDamage = unmitigatedPhys * (1 - mitigation)
    const spellDamage = lightningPart * (1 + incSpell + incEle) * moreSpell * moreEle
    const chaosDamage = chaosPart * (1 + incSpell) * moreSpell
    damage = physDamage + spellDamage + chaosDamage
  } else {
    const raw = rawBase + (skill.damageType === 'fire' ? flatFire : skill.damageType === 'cold' ? flatCold : skill.damageType === 'lightning' ? flatLightning : 0)
    const inc = skill.damageType === 'chaos' ? incSpell : (incSpell + incEle)
    const m = skill.damageType === 'chaos' ? moreSpell : moreSpell * moreEle
    damage = raw * (1 + inc) * m
  }

  let nextEquipped: EquippedSkill = { ...equipped, cooldownRemaining: effectiveCooldownTicks(skill.cooldownTicks, combat.momentum, character, supportActionSpeed), hitCounter: equipped.hitCounter + 1 }

  if (character.special.measuredStrikes && nextEquipped.hitCounter % 3 === 0) {
    damage *= 2
  }

  const isCrescendo = character.special.crescendo && nextEquipped.hitCounter % 4 === 0
  let isCrit = isCrescendo || (!character.special.cannotCrit && Math.random() <= clamp(character.criticalChance, 0, DAMAGE.CRITICAL_CHANCE_CAP))
  if (isCrit) damage *= character.criticalMultiplier

  if (skill.targeting === 'pack') damage *= 1.5

  // Momentum damage bonus
  damage *= momentumDamageMultiplier(combat.momentum, character)

  // Extra Projectile: projectile skills deal more damage
  if (hasExtraProjectile) {
    damage *= 1.25
  }

  // Herald damage multiplier
  const firstHit = isFirstHit(combat, monster.id)
  damage *= heraldDamageMultiplier(character, combat, monster, firstHit)

  // Herald of Judgment: instantly execute enemies at or below 10% life
  if (combat.herald.active.includes('judgment')) {
    const healthPercent = combat.monsterLife / monster.maxLife
    if (healthPercent <= 0.1) {
      damage = Math.max(damage, combat.monsterLife)
    }
  }

  // Overrun: at max momentum, 20% of damage is unavoidable flat
  if (character.special.overrun && isMaxMomentum(combat.momentum, character)) {
    const flatPortion = damage * 0.2
    damage = damage * 0.8 + flatPortion * 2
  }

  // Marshal Zealots army
  if (character.special.bannermansResolve === 'zealots') {
    damage *= 1 + combat.momentum.stacks * 0.04
  }

  // Malignant: afflicted enemies take more damage
  if (character.special.malignant && combat.ailments[monster.id] && combat.ailments[monster.id].length > 0) {
    damage *= 1.15
  }

  // Marshal Bulwark's Wrath flat bonus
  if (combat.marshal.bulwarkFlat > 0) {
    damage += combat.marshal.bulwarkFlat
  }

  // Ailments
  const ailments: AilmentInstance[] = []
  if (skill.appliesAilment) {
    const ailment = createAilmentFromSkill(skill.appliesAilment, Math.floor(damage), skill.id)
    ailments.push(ailment)
  }

  // Gear chance-to-ailment procs
  if (Math.random() * 100 < (character.chanceToBleed ?? 0)) {
    ailments.push(createAilmentFromSkill({ type: 'bleed', damagePerSecond: Math.max(1, Math.floor(damage * 0.2)), durationSeconds: 5 }, Math.floor(damage), skill.id))
  }
  if (Math.random() * 100 < (character.chanceToShock ?? 0)) {
    ailments.push(createAilmentFromSkill({ type: 'burn', damagePerSecond: Math.max(1, Math.floor(damage * 0.15)), durationSeconds: 4 }, Math.floor(damage), skill.id))
  }
  if (Math.random() * 100 < (character.chanceToInflictDespair ?? 0)) {
    ailments.push(createAilmentFromSkill({ type: 'poison', damagePerSecond: Math.max(1, Math.floor(damage * 0.25)), durationSeconds: 6 }, Math.floor(damage), skill.id))
  }

  if (monster.rarity === 'boss') {
    damage *= (1 + (character.damageVsBossesPercent ?? 0) / 100)
  }

  return { damage: Math.max(1, Math.floor(damage)), damageType: skill.damageType, crit: isCrit, isHit: true, nextEquipped, ailments }
}

interface SkillProcessResult {
  character: Character
  damage: number
  evaded: boolean
  event: CombatEvent
  monsterEvasionStacks: number
  combat: CombatState
  ailments: AilmentInstance[]
  crit: boolean
  extraEvents: CombatEvent[]
}

function processSkillHits(character: Character, monster: Monster, combat: CombatState): SkillProcessResult {
  let totalDamage = 0
  let anyCrit = false
  let evaded = true
  let currentStacks = combat.monsterEvasionStacks
  const nextEquipped: EquippedSkill[] = []
  let ailments: AilmentInstance[] = []
  const leveledUp: { gemId: string; newLevel: number }[] = []

  for (const equipped of character.equippedSkills) {
    const skill = SKILLS[equipped.skillId]
    if (!skill) {
      nextEquipped.push(equipped)
      continue
    }
    if (equipped.cooldownRemaining > 0) {
      nextEquipped.push({ ...equipped, cooldownRemaining: equipped.cooldownRemaining - 1 })
      continue
    }
    const result = skillDamage(character, equipped, skill, monster, currentStacks, combat)
    if (result.isHit) {
      currentStacks = 0
      evaded = false
      const xpResult = gainGemXpForSkillUse(character, equipped, result.damage)
      character = { ...character, ownedGems: xpResult.ownedGems }
      leveledUp.push(...xpResult.leveledUp)
    } else {
      currentStacks++
    }
    totalDamage += result.damage
    anyCrit = anyCrit || result.crit
    nextEquipped.push(result.nextEquipped)
    ailments = ailments.concat(result.ailments)
  }

  character = { ...character, equippedSkills: nextEquipped }

  const extraEvents: CombatEvent[] = leveledUp.map(l => {
    const gem = SKILLS[l.gemId] ?? SUPPORTS[l.gemId]
    return makeEvent({ type: 'gemLeveledUp', gemId: l.gemId, gemName: gem?.name ?? l.gemId, newLevel: l.newLevel })
  })

  const event: CombatEvent = evaded
    ? makeEvent({ type: 'hitAvoided', source: 'player', targetId: monster.id, reason: 'missed' })
    : makeEvent({
        type: 'hitLanded',
        source: 'player',
        targetId: monster.id,
        damage: totalDamage,
        damageType: 'physical',
        crit: anyCrit,
      })

  return { character, damage: totalDamage, evaded, event, monsterEvasionStacks: currentStacks, combat, ailments, crit: anyCrit, extraEvents }
}

function applyDevOverrides(character: Character): Character {
  if (!character.devOverrides || Object.keys(character.devOverrides).length === 0) {
    return character
  }
  const merged = { ...character, ...character.devOverrides }
  return {
    ...merged,
    life: Math.min(merged.life, merged.maxLife),
    energyShield: Math.min(merged.energyShield, merged.maxEnergyShield),
  }
}

// Herald auras and Marshal armies are designed as party-set effects. In v1 there is no
// party/minion system, so they are applied to the player character as self-buffs. When a
// party framework is added, these hooks should be moved to target the whole party set.
function getHeraldActive(special: PassiveSpecialEffects, choices: Record<string, string>): ('light' | 'gold' | 'tide' | 'silence' | 'storms' | 'judgment')[] {
  if (special.twinHeralds) {
    const choice = choices['herald_k3'] ?? 'light'
    const selected = choice.split(',').filter(Boolean)
    const first = (selected[0] as 'light' | 'gold' | 'tide' | 'silence' | 'storms' | 'judgment') ?? 'light'
    const second = (selected[1] as 'light' | 'gold' | 'tide' | 'silence' | 'storms' | 'judgment') ?? 'gold'
    return [first, second]
  }
  if (!special.proclaimHerald) return []
  return [special.proclaimHerald]
}

function hasHerald(combat: CombatState, aura: 'light' | 'gold' | 'tide' | 'silence' | 'storms' | 'judgment'): boolean {
  return combat.herald.active.includes(aura)
}

export function simulateTick(state: GameState): { state: GameState; events: CombatEvent[] } {
  const events: CombatEvent[] = []
  let character: Character = { ...state.character }
  let combat: CombatState = { ...state.combat, combatLog: [...state.combat.combatLog] }
  let currencies = { ...state.currencies }
  let zones: Zone[] = state.zones.map(z => ({ ...z }))
  let inventory = { ...state.inventory, items: [...state.inventory.items] }
  let activeTrial = state.activeTrial
  let gamePhase = state.gamePhase

  const zone = zones.find(z => z.id === state.activeZoneId)

  // Herald storm periodic lightning tick
  // Herald auras are set-wide effects on the party set (currently just the player).
  // Apply pending delayed damage from Fateseer Foreseen Doom at the start of the tick
  if (character.isAlive && combat.delayedDamageQueue.length > 0) {
    const tickDelayed = combat.delayedDamageQueue[0] ?? 0
    let energyShield = character.energyShield
    let life = character.life
    let remaining = tickDelayed
    if (energyShield > 0) {
      const absorb = Math.min(energyShield, remaining)
      energyShield -= absorb
      remaining -= absorb
    }
    life -= remaining
    character = { ...character, life, energyShield }
    // Delayed damage interrupts ES recharge just like any other hit
    combat = {
      ...combat,
      delayedDamageQueue: combat.delayedDamageQueue.slice(1),
      ticksSinceDamageTaken: 0,
      damageTakenByType: { ...combat.damageTakenByType, physical: combat.damageTakenByType.physical + tickDelayed },
    }
    events.push(makeEvent({ type: 'delayedDamageTick', targetId: character.id, damage: tickDelayed }))

    if (character.life <= 0) {
      character = { ...character, life: 0 }
      character = applyDeathPenalty(character)
      const deathSummary = combat.monster
        ? {
            monsterName: combat.monster.name,
            monsterLevel: combat.monster.level,
            monsterRarity: combat.monster.rarity,
            monsterModifiers: (combat.monster.modifierIds ?? []).map(
              id => MONSTER_MODIFIERS_BY_ID[id]?.displayName ?? id
            ),
            damageTaken: { ...combat.damageTakenByType },
          }
        : null
      combat = {
        ...combat,
        isRespawning: true,
        respawnTicks: character.respawnTimer,
        delayedDamageQueue: [],
        deathSummary,
      }
      events.push(makeEvent({ type: 'playerDied' }))
      return {
        state: { ...state, character, combat, zones, inventory, activeTrial, gamePhase },
        events,
      }
    }
  }

  // Snapshot the active auras into combat state so all combat hooks read from the same source.
  combat = { ...combat, herald: { ...combat.herald, active: getHeraldActive(character.special, character.keystoneChoices) } }
  const activeHeralds = combat.herald.active
  if (combat.monster && combat.monsterLife > 0 && activeHeralds.includes('storms')) {
    const stormPeriod = 3 * TICKS_PER_SECOND
    if (state.tickCounter % stormPeriod < TICK_RATE) {
      const stormDamage = Math.floor(character.level * 3 + 10)
      const targetId = combat.monster.id
      combat = { ...combat, monsterLife: Math.max(0, combat.monsterLife - stormDamage) }
      events.push(makeEvent({ type: 'hitLanded', source: 'player', targetId, damage: stormDamage, damageType: 'lightning', crit: false }))
    }
  }

  // Marshal War of Attrition aura: apply DOT every second, scaling with general damage modifiers
  if (combat.monster && combat.monsterLife > 0 && character.special.warOfAttrition) {
    if (state.tickCounter % TICKS_PER_SECOND < TICK_RATE) {
      const inc = 1 + character.increasedPhysicalDamage
      const more = character.morePhysicalDamage * (character.special.moreDamageMultiplier ?? 1)
      const baseDot = character.maxLife * 0.05 * inc * more
      const dot = createAilmentFromAura('poison', baseDot, 3)
      combat.ailments[combat.monster.id] = [...(combat.ailments[combat.monster.id] ?? []), dot]
      events.push(makeEvent({ type: 'ailmentApplied', targetId: combat.monster.id, ailmentType: 'poison' }))
    }
  }

  // Marshal Reapers army: apply a minor DOT every second to nearby enemies
  if (combat.monster && combat.monsterLife > 0 && character.special.bannermansResolve === 'reapers') {
    if (state.tickCounter % TICKS_PER_SECOND < TICK_RATE) {
      const dot = createAilmentFromAura('poison', Math.max(1, character.level * 2), 3)
      combat.ailments[combat.monster.id] = [...(combat.ailments[combat.monster.id] ?? []), dot]
      events.push(makeEvent({ type: 'ailmentApplied', targetId: combat.monster.id, ailmentType: 'poison' }))
    }
  }

  // Marshal Bulwark's Wrath decay
  if (combat.marshal.bulwarkTicksRemaining > 0) {
    const nextBulwarkTicks = combat.marshal.bulwarkTicksRemaining - 1
    combat = { ...combat, marshal: { ...combat.marshal, bulwarkTicksRemaining: nextBulwarkTicks } }
  } else if (combat.marshal.bulwarkFlat > 0) {
    combat = { ...combat, marshal: { ...combat.marshal, bulwarkFlat: 0 } }
  }

  // Momentum decay tick (only if Warlord has unlocked Momentum; Relentless Advance pauses decay while in combat)
  if (character.special.momentum) {
    const inCombat = combat.monster !== null && combat.monsterLife > 0
    if (!character.special.relentlessAdvance || !inCombat) {
      combat = { ...combat, momentum: tickMomentumDecay(combat.momentum) }
    }
  }

  // Recovery: life regen (always) and ES recharge (after delay)
  if (character.isAlive) {
    const newTicksSinceDamage = combat.ticksSinceDamageTaken + 1

    let regen = character.lifeRegen
    if (character.special.rallyingPresence) {
      regen += character.maxLife * 0.02 * combat.momentum.stacks
    }
    if (character.life < character.maxLife && !character.special.noLifeRegen) {
      character = { ...character, life: Math.min(character.maxLife, character.life + regen) }
    }

    const esDelayTicks = RECOVERY.ES_RECHARGE_DELAY_SECONDS * TICKS_PER_SECOND
    if (character.energyShield < character.maxEnergyShield && !character.special.noEnergyShieldRecharge && newTicksSinceDamage >= esDelayTicks) {
      character = { ...character, energyShield: Math.min(character.maxEnergyShield, character.energyShield + character.esRecharge) }
    }

    combat = { ...combat, ticksSinceDamageTaken: newTicksSinceDamage }
  }

  // Respawn handling
  if (!character.isAlive) {
    if (character.respawnTimer > 0) {
      const nextTimer = character.respawnTimer - 1
      if (nextTimer <= 0) {
        character = { ...character, isAlive: true, life: character.maxLife, energyShield: character.maxEnergyShield, respawnTimer: 0 }
        combat = { ...combat, respawnTicks: 0, isRespawning: false, deathSummary: null }
      } else {
        character = { ...character, respawnTimer: nextTimer }
        combat = { ...combat, respawnTicks: nextTimer }
      }
    }
    return {
      state: { ...state, character, combat, zones, inventory, activeTrial, gamePhase },
      events,
    }
  }

  // Ensure a monster exists
  if (!combat.monster) {
    if (!zone) return { state, events }
    const monster = createMonster(zone)
    combat = {
      ...combat,
      monster,
      monsterLife: monster.maxLife,
      damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
    }
    events.push(makeEvent({
      type: 'monsterSpawned',
      monsterId: monster.id,
      monsterType: monster.name,
      level: monster.level,
      rarity: monster.rarity,
      modifierNames: (monster.modifierIds ?? []).map(id => MONSTER_MODIFIERS_BY_ID[id]?.displayName ?? id),
    }))
    if (monster.rarity === 'boss') {
      events.push(makeEvent({ type: 'bossSpawned', bossId: monster.id }))
    }
  }

  const monster = combat.monster!

  // Player skills
  if (combat.monsterLife > 0) {
    const skillResult = processSkillHits(character, monster, combat)
    character = skillResult.character
    combat = { ...combat, monsterEvasionStacks: skillResult.monsterEvasionStacks }
    events.push(...skillResult.extraEvents)
    if (skillResult.damage > 0) {
      combat = { ...combat, lastDamageDealt: skillResult.damage, monsterLife: Math.max(0, combat.monsterLife - skillResult.damage) }
      events.push(skillResult.event)
      // apply ailments
      if (skillResult.ailments.length > 0) {
        let appliedAilments = skillResult.ailments
        // Patient Zero: first afflicted enemy in the pack becomes a super-spreader
        if (character.special.patientZero && !combat.virulent.patientZeroTarget) {
          appliedAilments = appliedAilments.map(a => ({ ...a, damagePerTick: a.damagePerTick * 1.5 }))
          combat = { ...combat, virulent: { ...combat.virulent, patientZeroTarget: monster.id } }
        }
        // Cirrhosis: your ailments cannot be cleansed and reverse healing
        if (character.special.cirrhosis) {
          appliedAilments = appliedAilments.map(a => ({ ...a, cirrhosis: true }))
        }
        combat.ailments[monster.id] = [...(combat.ailments[monster.id] ?? []), ...appliedAilments]
        for (const ailment of appliedAilments) {
          events.push(makeEvent({ type: 'ailmentApplied', targetId: monster.id, ailmentType: ailment.type }))
        }
        // Virulent: increment ailment stacks per target
        if (character.special.septicemia || character.special.cardiacArrest || character.special.asphyxiation || character.special.cirrhosis || character.special.calcify) {
          const newStacks = (combat.virulent.stacks[monster.id] ?? 0) + appliedAilments.length
          combat = { ...combat, virulent: { ...combat.virulent, stacks: { ...combat.virulent.stacks, [monster.id]: newStacks } } }
        }
        // Asphyxiation: afflicted enemies slow down as ailments persist
        if (character.special.asphyxiation) {
          const existingSlow = combat.virulent.slow[monster.id] ?? 0
          const newSlow = Math.min(0.3, existingSlow + 0.03 * appliedAilments.length)
          combat = { ...combat, virulent: { ...combat.virulent, slow: { ...combat.virulent.slow, [monster.id]: newSlow } } }
        }
        // Pandemic: seed a weaker copy of each ailment into the pack carryover
        if (character.special.pandemic) {
          const spread = appliedAilments.map(a => ({ ...a, id: `ail_pandemic_${eventIdCounter++}`, damagePerTick: a.damagePerTick * 0.5, stacks: 1 }))
          combat = { ...combat, plaguewindCarryover: [...combat.plaguewindCarryover, ...spread] }
          for (const ailment of spread) {
            events.push(makeEvent({ type: 'ailmentApplied', targetId: 'pack', ailmentType: ailment.type }))
          }
        }
      }
      // Herald Tide ramp while untouched
      if (hasHerald(combat, 'tide')) {
        const rampAmount = character.special.unwaveringDeclaration ? 0.1 : 0.06
        combat = { ...combat, herald: { ...combat.herald, tideRamp: Math.min(1, combat.herald.tideRamp + rampAmount) } }
      }
      // Resonant Truth: damage returns as ES
      if (character.special.resonantTruth) {
        const esGain = Math.floor(skillResult.damage * (character.special.unwaveringDeclaration ? 0.08 : 0.05))
        if (esGain > 0) {
          character = { ...character, energyShield: Math.min(character.maxEnergyShield, character.energyShield + esGain) }
        }
      }
      // Herald of Light: chance to blind enemy on hit
      if (activeHeralds.includes('light')) {
        const blindChance = character.special.unwaveringDeclaration ? 1 : 0.25
        if (Math.random() < blindChance) {
          combat = { ...combat, monsterDebuffs: { ...combat.monsterDebuffs, blind: true } }
        }
      }

      combat = markHit(combat, monster.id)
    } else if (skillResult.evaded) {
      events.push(skillResult.event)
    }
  }

  // DOT ticks
  if (combat.monsterLife > 0 && combat.ailments[monster.id] && combat.ailments[monster.id].length > 0) {
    let tickMultiplier = 1
    // Plague Chorus: +8% per afflicted enemy (single target: 1 if current monster afflicted)
    if (character.special.plagueChorus) {
      tickMultiplier += 0.08
    }
    // Septicemia: +5% per ailment stack on target
    if (character.special.septicemia) {
      const stacks = combat.virulent.stacks[monster.id] ?? 1
      tickMultiplier += stacks * 0.05
    }
    const tickResult = tickAilments(combat.ailments[monster.id], monster.id, tickMultiplier)
    let dotDamage = tickResult.totalDamage

    // Cardiac Arrest: at 10+ stacks, flare for accumulated burst and consume half
    if (character.special.cardiacArrest) {
      const stacks = combat.virulent.stacks[monster.id] ?? 0
      if (stacks >= 10) {
        const burst = Math.floor(dotDamage * 2)
        dotDamage += burst
        combat = { ...combat, virulent: { ...combat.virulent, stacks: { ...combat.virulent.stacks, [monster.id]: Math.floor(stacks / 2) } } }
      }
    }

    // Calcify: accumulate DOT damage; burst on threshold
    if (character.special.calcify) {
      const current = (combat.virulent.calcifyAccumulator[monster.id] ?? 0) + dotDamage
      const threshold = Math.max(50, character.level * 10)
      if (current >= threshold) {
        dotDamage = Math.floor(dotDamage * 1.5)
        combat = { ...combat, virulent: { ...combat.virulent, calcifyAccumulator: { ...combat.virulent.calcifyAccumulator, [monster.id]: 0 } } }
        events.push(makeEvent({ type: 'hitLanded', source: 'player', targetId: monster.id, damage: dotDamage, damageType: 'physical', crit: false }))
      } else {
        combat = { ...combat, virulent: { ...combat.virulent, calcifyAccumulator: { ...combat.virulent.calcifyAccumulator, [monster.id]: current } } }
      }
    }

    combat = { ...combat, ailments: { ...combat.ailments, [monster.id]: tickResult.newAilments } }
    if (dotDamage > 0) {
      combat = { ...combat, monsterLife: Math.max(0, combat.monsterLife - dotDamage), lastDamageDealt: dotDamage }
    }
    events.push(...tickResult.events)
  }

  // Monster attacks player
  if (combat.monsterLife > 0) {
    const monsterSlow = character.special.asphyxiation ? (combat.virulent.slow[monster.id] ?? 0) : 0
    // Herald of Silence Unwavering: enemies are periodically silenced / slowed
    const silenced = activeHeralds.includes('silence') && character.special.unwaveringDeclaration && Math.random() < 0.25
    if (silenced) {
      events.push(makeEvent({ type: 'hitAvoided', source: 'monster', targetId: character.id, reason: 'missed' }))
      combat = { ...combat, lastDamageTaken: 0 }
    } else {
      const effectiveMonsterAccuracy = combat.monsterDebuffs.blind ? monster.accuracy * 0.9 : monster.accuracy
      const monsterHit = character.special.alwaysHit ? true : Math.random() <= hitChance(effectiveMonsterAccuracy, character.evasion, combat.playerEvasionStacks)
    if (monsterHit) {
      let damageTaken = 0
      const damageByType: Record<DamageType, number> = { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 }
      for (const component of monster.damage) {
        const raw = rollDamage(component.min, component.max) * (1 - monsterSlow)
        let componentDamage = raw
        if (component.type === 'physical') {
          const mitigation = armourMitigation(character.armour, raw)
          componentDamage = Math.max(1, Math.floor(raw * (1 - mitigation)))
        } else {
          const cap = Math.max(
            DAMAGE.RESISTANCE_CAP,
            character.special.maxFireResist ?? 0,
            character.special.maxColdResist ?? 0,
            character.special.maxLightningResist ?? 0,
          )
          componentDamage = Math.floor(applyResistance(character.resistances[component.type], raw, cap))
        }
        damageByType[component.type] += componentDamage
        damageTaken += componentDamage
      }
      const damageTakenMultiplier = getDamageTakenMultiplier(character.special)
      const preMultTotal = Math.max(1, Object.values(damageByType).reduce((a, b) => a + b, 0))
      damageTaken = Math.max(1, Math.floor(preMultTotal * damageTakenMultiplier))

      // Track final damage dealt by type (proportional split after multipliers).
      const nextDamageTakenByType = { ...combat.damageTakenByType }
      for (const type of Object.keys(damageByType) as DamageType[]) {
        nextDamageTakenByType[type] += Math.floor(damageByType[type] * damageTakenMultiplier)
      }
      combat = { ...combat, damageTakenByType: nextDamageTakenByType }

      // Marshal Hold the Line: flat DR from armour
      if (character.special.holdTheLine) {
        damageTaken = Math.max(1, damageTaken - Math.floor(character.armour * 0.12))
      }

      // Marshal Iron Legion: bonus armour (already in stats) and flat damage resistance
      if (character.special.bannermansResolve === 'iron_legion') {
        damageTaken = Math.max(1, damageTaken - Math.max(1, character.level))
      }

      // Marshal Rallying Presence DR from momentum
      if (character.special.rallyingPresence) {
        const dr = Math.min(0.2, combat.momentum.stacks * 0.02)
        damageTaken = Math.floor(damageTaken * (1 - dr))
      }

      // Wardens army: share a portion of Momentum's defensive bonuses with the party set
      if (character.special.bannermansResolve === 'wardens' && combat.momentum.stacks > 0) {
        const dr = Math.min(0.1, combat.momentum.stacks * 0.01)
        damageTaken = Math.floor(damageTaken * (1 - dr))
      }

      // Herald Silence damage reduction
      damageTaken = Math.floor(damageTaken * (1 - heraldDamageReduction(combat, character.special)))

      // Fateseer Foreseen Doom: delay 40% of damage
      let delayed = 0
      if (character.special.foreseenDoom) {
        delayed = Math.floor(damageTaken * 0.4)
        damageTaken -= delayed
      }

      // ES absorbs damage before life
      let life = character.life
      let energyShield = character.energyShield
      if (energyShield > 0) {
        const shieldAbsorb = Math.min(energyShield, damageTaken)
        energyShield -= shieldAbsorb
        const remainingDamage = damageTaken - shieldAbsorb
        life -= remainingDamage
      } else {
        life -= damageTaken
      }

      if (delayed > 0) {
        const perTick = delayed / (3 * TICKS_PER_SECOND)
        const window = 3 * TICKS_PER_SECOND
        const newQueue = [...combat.delayedDamageQueue]
        for (let i = 0; i < window; i++) {
          if (i < newQueue.length) {
            newQueue[i] += perTick
          } else {
            newQueue.push(perTick)
          }
        }
        combat = { ...combat, delayedDamageQueue: newQueue }
      }

      if (damageTaken > 0) {
        combat = { ...combat, ticksSinceDamageTaken: 0, playerEvasionStacks: 0 }
        // Herald Tide: reset ramp on hit (Unwavering halves instead)
        if (combat.herald.tideRamp > 0) {
          const nextRamp = character.special.unwaveringDeclaration ? combat.herald.tideRamp * 0.5 : 0
          combat = { ...combat, herald: { ...combat.herald, tideRamp: nextRamp } }
        }
        // Bulwark's Wrath: store portion of damage taken as flat phys
        if (character.special.bulwarksWrath) {
          combat = { ...combat, marshal: { ...combat.marshal, bulwarkFlat: damageTaken * 0.1, bulwarkTicksRemaining: 3 * TICKS_PER_SECOND } }
        }
      }

      const primaryComponent = [...monster.damage].sort((a, b) => b.max - a.max)[0]
      character = { ...character, life, energyShield }
      combat = { ...combat, lastDamageTaken: damageTaken }
      events.push(makeEvent({
        type: 'hitLanded',
        source: 'monster',
        targetId: character.id,
        damage: damageTaken,
        damageType: primaryComponent ? primaryComponent.type : 'physical',
        crit: false,
      }))

      if (character.life <= 0) {
        character = { ...character, life: 0 }
        character = applyDeathPenalty(character)
        const deathSummary = combat.monster
          ? {
              monsterName: combat.monster.name,
              monsterLevel: combat.monster.level,
              monsterRarity: combat.monster.rarity,
              monsterModifiers: (combat.monster.modifierIds ?? []).map(
                id => MONSTER_MODIFIERS_BY_ID[id]?.displayName ?? id
              ),
              damageTaken: { ...combat.damageTakenByType },
            }
          : null
        combat = {
          ...combat,
          isRespawning: true,
          respawnTicks: character.respawnTimer,
          delayedDamageQueue: [],
          deathSummary,
        }
        events.push(makeEvent({ type: 'playerDied' }))
        return {
          state: { ...state, character, combat, zones, inventory, activeTrial, gamePhase },
          events,
        }
      }
    } else {
      combat = { ...combat, lastDamageTaken: 0, playerEvasionStacks: combat.playerEvasionStacks + 1 }
      events.push(makeEvent({ type: 'hitAvoided', source: 'monster', targetId: character.id, reason: 'evaded' }))
    }
    }
  }

  // Monster killed
  if (combat.monsterLife <= 0) {
    let goldEarned = monster.goldReward
    if (hasHerald(combat, 'gold')) {
      const goldMultiplier = character.special.unwaveringDeclaration ? 1.5 : 1.25
      goldEarned = Math.floor(goldEarned * goldMultiplier)
    }
    goldEarned = Math.floor(goldEarned * (1 + (character.goldFindPercent ?? 0) / 100))
    const xpEarned = monster.experienceReward

    events.push(makeEvent({ type: 'monsterDied', monsterId: monster.id, monsterType: monster.name }))
    if (monster.rarity === 'boss') {
      events.push(makeEvent({ type: 'bossDefeated', bossId: monster.id }))
    }

    // Momentum gain on kill (only for Warlords who have unlocked Momentum; Skirmishers build faster)
    if (character.special.momentum) {
      if (!character.special.relentlessAdvance) {
        const momentumGain = character.special.bannermansResolve === 'skirmishers' ? 2 : 1
        let nextMomentum = gainMomentum(combat.momentum, momentumGain, character)
        if (character.special.breakneck) {
          nextMomentum = breakneckRaiseCap(nextMomentum)
        }
        combat = { ...combat, momentum: nextMomentum }
        events.push(makeEvent({ type: 'momentumChanged', stacks: combat.momentum.stacks }))
      } else if (character.special.breakneck) {
        // Relentless Advance resets stacks when the fight ends, but Breakneck still raises the cap
        combat = { ...combat, momentum: breakneckRaiseCap(combat.momentum) }
      }

      // Relentless Advance: momentum fully resets when the fight ends
      if (character.special.relentlessAdvance) {
        combat = { ...combat, momentum: { ...createMomentumState(), capBonus: combat.momentum.capBonus } }
        events.push(makeEvent({ type: 'momentumChanged', stacks: 0 }))
      }
    }

    // Vanguard Blitz: at max momentum, echo damage to pack
    if (character.special.blitz && isMaxMomentum(combat.momentum, character)) {
      const echoDamage = combat.lastDamageDealt
      events.push(makeEvent({ type: 'hitLanded', source: 'player', targetId: 'pack', damage: echoDamage, damageType: 'physical', crit: false }))
      combat = { ...combat, packDamageCarryover: combat.packDamageCarryover + echoDamage }
    }

    // Unwavering Herald on-kill specials
    const activeAuras = getHeraldActive(character.special, character.keystoneChoices)
    if (character.special.unwaveringDeclaration) {
      // Herald of Storms: bolts on killing blow
      if (activeAuras.includes('storms')) {
        const stormDamage = Math.max(1, Math.floor(character.level * 5 + character.basePhysicalDamageMax * 0.5))
        events.push(makeEvent({ type: 'hitLanded', source: 'player', targetId: 'pack', damage: stormDamage, damageType: 'lightning', crit: false }))
        combat = { ...combat, packDamageCarryover: combat.packDamageCarryover + stormDamage }
      }
      // Herald of Judgment: detonate corpse for player-scaled splash (never % enemy max HP)
      if (activeAuras.includes('judgment')) {
        const detonationDamage = Math.max(1, Math.floor((character.basePhysicalDamageMin + character.basePhysicalDamageMax) * 0.5 * (1 + character.increasedPhysicalDamage) * character.morePhysicalDamage * (character.special.moreDamageMultiplier ?? 1)))
        events.push(makeEvent({ type: 'hitLanded', source: 'player', targetId: 'pack', damage: detonationDamage, damageType: 'fire', crit: false }))
        combat = { ...combat, packDamageCarryover: combat.packDamageCarryover + detonationDamage }
      }
    }

    // Inevitability: cancel pending delayed damage on kill
    if (character.special.inevitability && combat.delayedDamageQueue.length > 0) {
      const cancelAmount = Math.floor(combat.delayedDamageQueue.reduce((a, b) => a + b, 0) * 0.25)
      let removed = 0
      combat = { ...combat, delayedDamageQueue: combat.delayedDamageQueue.filter(amount => {
        if (removed < cancelAmount) {
          removed += amount
          return false
        }
        return true
      }) }
    }

    // Plaguewind: spread DOTs on death
    if (character.special.plaguewind && combat.ailments[monster.id] && combat.ailments[monster.id].length > 0) {
      // In single-target v1, "rest of pack" is the next monster: carry the DOTs over
      const carryover = combat.ailments[monster.id].map(a => ({ ...a, id: `ail_plaguewind_${eventIdCounter++}`, remainingTicks: a.remainingTicks }))
      combat = { ...combat, plaguewindCarryover: [...combat.plaguewindCarryover, ...carryover] }
      events.push(makeEvent({ type: 'ailmentApplied', targetId: 'pack', ailmentType: combat.ailments[monster.id][0].type }))
    }

    if (goldEarned > 0) {
      currencies['gold'] = (currencies['gold'] || 0) + goldEarned
    }

    if (xpEarned > 0) {
      let beforeLevel = character.level
      character = addExperience(character, xpEarned)
      events.push(makeEvent({ type: 'xpGained', amount: xpEarned }))
      if (character.level > beforeLevel) {
        events.push(makeEvent({ type: 'levelUp', newLevel: character.level }))
      }
      character = recalcCharacter({ ...state, character, combat, zones, inventory, currencies, activeTrial, gamePhase }, character)
    }

    // Drop item
    if (zone) {
      const hasGold = hasHerald(combat, 'gold')
      const unwavering = character.special.unwaveringDeclaration
      const dropModifiers = hasGold
        ? {
            rarityBonus: { rare: unwavering ? 0.1 : 0.05, magic: unwavering ? 0.2 : 0.1 },
            extraDropChance: unwavering ? 0.5 : 0.25,
          }
        : undefined
      const drops = [dropItem(zone.level, dropModifiers)]
      if (dropModifiers && Math.random() < dropModifiers.extraDropChance) {
        drops.push(dropItem(zone.level, dropModifiers))
      }
      for (const dropped of drops) {
        if (!dropped) continue
        const isAutoSell =
          (dropped.rarity === 'normal' && inventory.autoSellNormal && dropped.itemLevel <= character.level) ||
          (dropped.rarity === 'magic' && inventory.autoSellMagic && dropped.itemLevel <= character.level)

        if (isAutoSell) {
          currencies['gold'] = (currencies['gold'] || 0) + Math.max(1, dropped.itemLevel * 2)
        } else if (inventory.items.length < inventory.maxSize) {
          inventory.items = [...inventory.items, dropped]
          events.push(makeEvent({ type: 'itemDropped', itemId: dropped.id, rarity: dropped.rarity }))
        }
      }
    }

    // Currency drop chance
    if (Math.random() < 0.1) {
      const currencyPool = ['awakening', 'mutation', 'cleansing']
      const currencyId = currencyPool[Math.floor(Math.random() * currencyPool.length)]
      currencies[currencyId] = (currencies[currencyId] || 0) + 1
    }

    // Zone progress
    if (zone) {
      const newProgress = Math.min(100, zone.killProgress + 100 / zone.killsRequired)
      zones = zones.map(w => (w.id === zone.id ? { ...w, killProgress: newProgress } : w))
      events.push(makeEvent({ type: 'zoneProgress', current: newProgress, total: 100 }))

      const currentIndex = zones.findIndex(w => w.id === zone.id)
      if (zones[currentIndex].killProgress >= 100 && currentIndex < zones.length - 1) {
        zones = zones.map((w, idx) => (idx === currentIndex + 1 ? { ...w, unlocked: true } : w))
      }

      // Support slot growth at campaign milestones (Act 3, 6, 9 -> 3, 4, 5 slots)
      const completedActs = new Set(zones.filter(w => w.killProgress >= 100).map(w => w.act))
      let slotCount = 2
      if (completedActs.has(3)) slotCount = 3
      if (completedActs.has(6)) slotCount = 4
      if (completedActs.has(9)) slotCount = 5
      if (character.supportSlotCount !== slotCount) {
        character = { ...character, supportSlotCount: slotCount }
      }
    }

    // Trial completion
    if (activeTrial) {
      let trial1Completed = character.trial1Completed
      let trial2Completed = character.trial2Completed
      let trial3Completed = character.trial3Completed
      let trial4Completed = character.trial4Completed
      if (activeTrial.id === 'trial_of_ascension_1') trial1Completed = true
      if (activeTrial.id === 'trial_of_ascension_2') trial2Completed = true
      if (activeTrial.id === 'trial_of_ascension_3') trial3Completed = true
      if (activeTrial.id === 'trial_of_ascension_4') trial4Completed = true
      const ascendancyPoints = character.ascendancyPoints + activeTrial.rewardAscendancyPoints
      character = { ...character, trial1Completed, trial2Completed, trial3Completed, trial4Completed, ascendancyPoints }
      if (!character.ascendancyId) {
        gamePhase = 'ascendancy-select'
      }
      activeTrial = null
    }

    // Spawn next monster
    if (zone) {
      const nextMonster = createMonster(zone)
      const nextAilments: Record<string, AilmentInstance[]> = { ...combat.ailments }
      // Plaguewind carryover: DOTs from the last killed monster infect the next one
      if (combat.plaguewindCarryover.length > 0) {
        nextAilments[nextMonster.id] = [...(nextAilments[nextMonster.id] ?? []), ...combat.plaguewindCarryover]
      }
      const carryoverDamage = combat.packDamageCarryover
      combat = {
        ...combat,
        monster: nextMonster,
        monsterLife: Math.max(1, nextMonster.maxLife - carryoverDamage),
        virulent: { ...combat.virulent, patientZeroTarget: null },
        ailments: nextAilments,
        plaguewindCarryover: [],
        packDamageCarryover: 0,
      }
      events.push(makeEvent({
        type: 'monsterSpawned',
        monsterId: nextMonster.id,
        monsterType: nextMonster.name,
        level: nextMonster.level,
        rarity: nextMonster.rarity,
        modifierNames: (nextMonster.modifierIds ?? []).map(id => MONSTER_MODIFIERS_BY_ID[id]?.displayName ?? id),
      }))
      if (nextMonster.rarity === 'boss') {
        events.push(makeEvent({ type: 'bossSpawned', bossId: nextMonster.id }))
      }
    }
  }

  // Apply dev overrides after all calculations
  character = applyDevOverrides(character)

  const nextState: GameState = {
    ...state,
    character,
    combat,
    currencies,
    zones,
    inventory,
    activeTrial,
    gamePhase,
  }

  return { state: nextState, events }
}

export function processCombatTick(character: Character, combat: CombatState): { character: Character; combat: CombatState; goldEarned: number; xpEarned: number } {
  return { character, combat, goldEarned: 0, xpEarned: 0 }
}
