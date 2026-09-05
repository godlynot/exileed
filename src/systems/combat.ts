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
  PackMember,
} from '../types/game.ts'
import { DAMAGE, MONSTER, MOVEMENT, RECOVERY, TICKS_PER_SECOND, TICK_RATE, monsterScalingMultiplier, supportSlotCountForCompletedActs } from '../data/balance.ts'
import { applyDeathPenalty, addExperience } from './xp.ts'
import { dropItem, recalculateCharacterFromEquipment, type DropModifiers } from './items.ts'
import { applyPassiveStats, applyAscendancyStats } from './passives.ts'
import { MONSTERS } from '../data/monsters.ts'
import { isSwarmTemplate } from '../data/swarmMonsters.ts'
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
import { BOSS_ARENA_OFFSET_Y } from './spatial.ts'
import { applyPartyEffects, resolveParty } from './party.ts'
import { createAilmentFromSkill, createAilmentFromAura, tickAilments } from './ailments.ts'
import { getGemLevel, gainGemXpForSkillUse, skillDamageMultiplier, supportModMultiplier } from './gems.ts'
import { summonMinion, tickSummonRevivals, processMinionHits } from './minions.ts'
import { leadWithElite, nextWaypoint, placePackAtWaypoint, playerSpeed } from './spatial.ts'
import { aggregateMapAffixEffects } from '../data/mapAffixes.ts'
import {
  NEXUS_RIFT_CRYSTAL_DROP_CHANCE,
  isNexusZoneId,
  nexusZoneForMap,
  nexusZoneIdForMap,
  recordNexusPackClear,
  riftCrystalRewardForBoss,
  grantSovereignUnlock,
  NEXUS_MAX_TIER,
  SOVEREIGN_MONSTER_ID,
  SOVEREIGN_RIFT_CRYSTAL_REWARD,
} from './nexus.ts'

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
    packSizeRemaining: 0,
    packNamedEliteCount: 0,
    currentPack: [],
    party: { members: [], ticksSinceAnyMemberHit: 0 },
    lastDamageSource: 'player',
    minionAttackCooldowns: {},
    phase: 'engaged',
    travelTicksRemaining: 0,
    travelDurationTicks: 0,
    partyPosition: { x: 0, y: 0 },
    waypoint: { x: 0, y: 0 },
    bossPhaseIndex: 0,
  }
}

/**
 * Nexus Stage 4 boss phase engine: activates the next `phases` entry when the
 * boss crosses its `healthPercent` threshold. Applies statOverrides +
 * attackRateMultiplier + addComponents (mutating the live pack member), emits
 * `bossPhaseChanged`, and clears the phase tracker when the encounter ends so
 * repeat fights start fresh. Thresholds are ordered (deepest last); each fires
 * exactly once per encounter.
 *
 * Returns the combat untouched when the boss has no phases left to trigger.
 */
function advanceBossPhases(
  combat: CombatState,
  events: CombatEvent[],
): CombatState {
  const monster = combat.monster
  if (!monster || monster.rarity !== 'boss' || !monster.phases || monster.phases.length === 0) {
    return combat
  }
  if (combat.monsterLife <= 0) return combat
  if (combat.bossPhaseIndex >= monster.phases.length) return combat

  const healthPercent = combat.monsterLife / monster.maxLife
  const nextPhase = monster.phases[combat.bossPhaseIndex]
  if (!nextPhase || healthPercent > nextPhase.healthPercent) return combat

  // Apply the phase shift to the live monster (pack member + active pointer).
  const pack = [...combat.currentPack]
  const memberIdx = pack.findIndex(member => member.monster.id === monster.id)
  const shifted: Monster = {
    ...monster,
    ...nextPhase.statOverrides,
    damage: [
      ...monster.damage.map(d => ({ ...d })),
      ...(nextPhase.addComponents ?? []).map(c => ({ ...c })),
    ],
    attackRate: nextPhase.attackRateMultiplier
      ? monster.attackRate * nextPhase.attackRateMultiplier
      : monster.attackRate,
  }
  if (memberIdx >= 0) {
    pack[memberIdx] = { ...pack[memberIdx], monster: shifted }
  }
  events.push(makeEvent({
    type: 'bossPhaseChanged',
    bossId: monster.id,
    phaseIndex: combat.bossPhaseIndex + 1,
    totalPhases: monster.phases.length,
  }))
  return {
    ...combat,
    currentPack: memberIdx >= 0 ? pack : combat.currentPack,
    monster: shifted,
    bossPhaseIndex: combat.bossPhaseIndex + 1,
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

function rollPackSize(zone: Zone): number {
  // Stage 4: swarm-tagged monsters engage in oversized packs of 4-8 (spec:
  // "4-8 for swarm-tagged monsters"). The pack is a swarm if the FIRST rolled
  // template is a swarm monster — swarm members share the pack.
  if (zone.monsterIds.some(id => isSwarmTemplate(id))) {
    return 4 + Math.floor(Math.random() * 5)
  }
  // Pack size 1-4, weighted toward smaller packs earlier and larger packs later.
  const levelWeight = Math.min(1, (zone.level - 1) / 60)
  const roll = Math.random()
  const fourChance = 0.05 + levelWeight * 0.15
  const threeChance = 0.15 + levelWeight * 0.15
  const twoChance = 0.35 + levelWeight * 0.1
  if (roll < fourChance) return 4
  if (roll < fourChance + threeChance) return 3
  if (roll < fourChance + threeChance + twoChance) return 2
  return 1
}

function maxNamedElitesForZone(zone: Zone): number {
  // Acts 1-7: at most 1 named elite per pack. Act 8+ and maps: up to 2.
  return zone.act >= 8 ? 2 : 1
}

function rollEliteRarity(): Exclude<MonsterRarity, 'normal' | 'boss'> {
  // Biased toward rare (60% rare, 40% magic).
  return Math.random() < 0.6 ? 'rare' : 'magic'
}

function createMonster(zone: Zone, canSpawnNamedElite: boolean): Monster {
  const isNamedEliteSpawn =
    canSpawnNamedElite &&
    zone.eliteTemplateIds &&
    zone.eliteTemplateIds.length > 0 &&
    zone.eliteChance > 0 &&
    Math.random() < zone.eliteChance

  let id: string
  if (isNamedEliteSpawn) {
    id = zone.eliteTemplateIds![Math.floor(Math.random() * zone.eliteTemplateIds!.length)]
  } else {
    const pool = zone.monsterIds.length > 0 ? zone.monsterIds : zone.monsterId ? [zone.monsterId] : []
    id = pool[Math.floor(Math.random() * pool.length)]
  }

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

  // Determine rarity: named elites are guaranteed magic+, others roll normally.
  let rarity: MonsterRarity
  if (isNamedEliteSpawn) {
    rarity = rollEliteRarity()
  } else {
    rarity = zone.eliteChance > 0 ? rollRarity(zone.level) : 'normal'
  }
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
  const mapEffects = aggregateMapAffixEffects(zone.mapAffixes)

  monster = {
    ...monster,
    rarity,
    isNamedElite: isNamedEliteSpawn,
    modifierIds: modifiers.map(m => m.id),
    life: Math.floor(monster.life * lifeMult * mapEffects.monsterLifeMultiplier),
    maxLife: Math.floor(monster.maxLife * lifeMult * mapEffects.monsterLifeMultiplier),
    damage: monster.damage.map(d => ({
      ...d,
      min: Math.max(1, Math.floor(d.min * damageMult * mapEffects.monsterDamageMultiplier)),
      max: Math.max(1, Math.floor(d.max * damageMult * mapEffects.monsterDamageMultiplier)),
    })),
    attackRate: monster.attackRate * attackRateMult * mapEffects.monsterAttackRateMultiplier,
    accuracy: monster.accuracy + scaledAccuracyAdd,
    evasion: Math.floor((monster.evasion + scaledEvasionAdd) * mapEffects.monsterEvasionMultiplier),
    armour: (monster.armour ?? 0) + scaledArmourAdd,
    experienceReward: Math.floor(monster.experienceReward * rewardMult),
    goldReward: Math.floor(monster.goldReward * rewardMult),
    aura,
  }

  return monster
}

function seedPack(zone: Zone, combat: CombatState): { pack: PackMember[]; combat: CombatState; events: CombatEvent[] } {
  // Stage 2 (spatial boss encounters): a zone whose entire monster pool is
  // bosses (act-end boss arenas, killsRequired = 1) is a solo encounter —
  // pack sizing must never multiply the boss into a pack of clones.
  const bossOnlyPool =
    zone.monsterIds.length > 0 &&
    zone.monsterIds.every(id => MONSTERS[id]?.rarity === 'boss')
  // Stage 4: swarm zones engage in oversized wedge formations.
  const isSwarmPack = !bossOnlyPool && zone.monsterIds.some(id => isSwarmTemplate(id))
  const size = bossOnlyPool ? 1 : rollPackSize(zone)
  const maxElites = maxNamedElitesForZone(zone)
  const pack: PackMember[] = []
  const events: CombatEvent[] = []
  let packNamedEliteCount = 0

  for (let slot = 0; slot < size; slot++) {
    const canSpawnNamedElite = packNamedEliteCount < maxElites
    const monster = createMonster(zone, canSpawnNamedElite)

    if (monster.isNamedElite) {
      packNamedEliteCount++
      events.push(makeEvent({
        type: 'eliteSpawned',
        monsterId: monster.id,
        monsterType: monster.name,
        level: monster.level,
      }))
    }

    pack.push({
      id: `${monster.id}_${slot}_${Date.now()}_${eventIdCounter++}`,
      monster,
      currentLife: monster.maxLife,
      maxLife: monster.maxLife,
      slot,
      // Positioned by placePackAtWaypoint after seeding; origin is a safe
      // pre-placement default.
      position: { x: 0, y: 0 },
    })
  }

  events.push(makeEvent({
    type: 'packSeeded',
    size: pack.length,
    hasElite: packNamedEliteCount > 0,
    zoneId: zone.id,
  }))

  return {
    // Boss arenas: the boss stands centered just north of the waypoint (the
    // party arrives at the waypoint itself, approaching from the south).
    // Swarm packs engage in a tight wedge (Stage 4). Regular packs scatter
    // north of it (placePackAtWaypoint), with a named elite leading the
    // formation (Stage 3: the elite engages first).
    pack: bossOnlyPool
      ? pack.map(member => ({
          ...member,
          position: {
            x: Math.round(combat.waypoint.x * 100) / 100,
            y: Math.round((combat.waypoint.y - BOSS_ARENA_OFFSET_Y) * 100) / 100,
          },
        }))
      : placePackAtWaypoint(leadWithElite(pack), combat.waypoint, isSwarmPack),
    combat: { ...combat, packNamedEliteCount, packSizeRemaining: size },
    events,
  }
}

function activatePackMember(combat: CombatState, member: PackMember): CombatState {
  return {
    ...combat,
    monster: member.monster,
    monsterLife: member.currentLife,
  }
}

function syncActivePackMember(combat: CombatState): CombatState {
  if (combat.currentPack.length === 0 || !combat.monster) return combat
  const [first, ...rest] = combat.currentPack
  if (first.monster.id !== combat.monster.id && first.id !== combat.monster.id) return combat
  return {
    ...combat,
    currentPack: [{ ...first, currentLife: combat.monsterLife }, ...rest],
  }
}

function advancePack(
  zone: Zone,
  combat: CombatState,
  events: CombatEvent[],
  carryoverDamage: number,
  character?: Character
): CombatState {
  const originalSize = combat.currentPack.length

  // Remove the dead front member and any pack members already killed by a band hit.
  const remaining = combat.currentPack.slice(1).filter(member => member.currentLife > 0)

  // If the pack still has members, promote the next one
  if (remaining.length > 0) {
    const nextMember = remaining[0]
    const updatedLife = Math.max(1, nextMember.currentLife - carryoverDamage)
    const updated = { ...nextMember, currentLife: updatedLife }
    events.push(makeEvent({
      type: 'monsterSpawned',
      monsterId: updated.monster.id,
      monsterType: updated.monster.name,
      level: updated.monster.level,
      rarity: updated.monster.rarity,
      modifierNames: (updated.monster.modifierIds ?? []).map(id => MONSTER_MODIFIERS_BY_ID[id]?.displayName ?? id),
    }))
    if (updated.monster.rarity === 'boss') {
      events.push(makeEvent({ type: 'bossSpawned', bossId: updated.monster.id }))
    }
    return activatePackMember({ ...combat, currentPack: [updated, ...remaining.slice(1)] }, updated)
  }

  // Pack cleared (Stage 1 spatial): the next pack is NOT seeded this tick.
  // Combat enters the traveling phase for a deterministic tick duration; the
  // next pack seeds on arrival. Momentum/regen/DOTs keep ticking meanwhile.
  events.push(makeEvent({ type: 'packCleared', size: originalSize }))
  void zone
  return beginTravelToNextPack(combat, events, character)
}

/**
 * Stage 1 travel phase: pick the next waypoint, compute the tick duration
 * from the player's current movement speed, and enter 'traveling'. The next
 * pack is seeded by arriveAtWaypoint on the tick travelTicksRemaining hits 0.
 * Pure: caller passes its own events array (we only append the log line).
 */
function beginTravelToNextPack(
  combat: CombatState,
  events: CombatEvent[],
  character?: Character
): CombatState {
  const { waypoint, distance } = nextWaypoint(combat.partyPosition)
  const speed = character
    ? playerSpeed(character, combat)
    : MOVEMENT.BASE_SPEED
  const duration = Math.max(1, Math.ceil(distance / speed))
  events.push(makeEvent({
    type: 'travelStarted',
    distance,
    durationTicks: duration,
  }))
  return {
    ...combat,
    phase: 'traveling',
    travelTicksRemaining: duration,
    travelDurationTicks: duration,
    waypoint,
    // Party position stays where it is; the renderer interpolates movement.
    monster: null,
    monsterLife: 0,
    // Post-pack bookkeeping, unchanged from the old same-tick reseed.
    damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
    currentPack: [],
    packSizeRemaining: 0,
    // Boss phase tracker resets per encounter (Stage 4).
    bossPhaseIndex: 0,
    packNamedEliteCount: 0,
  }
}

export function spawnMonster(zone: Zone, combat: CombatState): { monster: Monster; combat: CombatState; events: CombatEvent[] } {
  // Seeds the pack around combat.waypoint (set by beginTravelToNextPack or
  // zone entry) and activates the front member. Does NOT change phase — the
  // caller decides engaged vs. still traveling.
  const seed = seedPack(zone, combat)
  const nextCombat = activatePackMember(seed.combat, seed.pack[0])
  return {
    monster: seed.pack[0].monster,
    combat: { ...nextCombat, currentPack: seed.pack },
    events: seed.events,
  }
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

function linkedSupportsForSkill(equipped: EquippedSkill, skill: Skill): { id: string; support: Support }[] {
  return equipped.supportIds
    .map(id => ({ id, support: SUPPORTS[id] }))
    .filter((entry): entry is { id: string; support: Support } =>
      !!entry.support && entry.support.allowedTags.some(tag => skill.tags.includes(tag)),
    )
}

export function aggregateSupportModifiers(supports: Support[], supportIds: string[], character: Character) {
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
      if (mod.mode === 'more') more[mod.stat] = (more[mod.stat] ?? 1) * (1 + (mod.value * multiplier) / 100)
    }
  }
  return { flat, increased, more }
}

export function skillDisplayStats(
  character: Character,
  equipped: EquippedSkill,
  skill: Skill,
  combat: CombatState,
): { minDamage: number; maxDamage: number; cooldownTicks: number } {
  const linkedSupports = linkedSupportsForSkill(equipped, skill)
  const supportMods = aggregateSupportModifiers(
    linkedSupports.map(entry => entry.support),
    linkedSupports.map(entry => entry.id),
    character,
  )
  const supportActionSpeed = (
    (supportMods.increased['inc_attack_speed_percent'] ?? 0) +
    (supportMods.increased['inc_cast_speed_percent'] ?? 0)
  ) / 100
  const cooldownTicks = effectiveCooldownTicks(skill.cooldownTicks, combat.momentum, character, supportActionSpeed)
  const isAttack = skill.tags.includes('attack')
  const baseMin = skill.baseDamageMin + (isAttack ? character.basePhysicalDamageMin : 0)
  const baseMax = skill.baseDamageMax + (isAttack ? character.basePhysicalDamageMax : 0)
  const levelMultiplier = 1 + (character.level - 1) * 0.05
  const gemMultiplier = skillDamageMultiplier(getGemLevel(character, equipped.skillId))
  const scaledMin = baseMin * levelMultiplier * gemMultiplier
  const scaledMax = baseMax * levelMultiplier * gemMultiplier
  const flatStat = skill.damageType === 'physical'
    ? 'flat_phys_damage'
    : skill.damageType === 'fire'
      ? 'flat_fire_damage'
      : skill.damageType === 'cold'
        ? 'flat_cold_damage'
        : skill.damageType === 'lightning'
          ? 'flat_lightning_damage'
          : null
  const flat = flatStat ? (supportMods.flat[flatStat] ?? 0) * skill.damageEffectiveness : 0
  const increased = skill.damageType === 'physical'
    ? (character.increasedPhysicalDamage + (supportMods.increased['inc_phys_damage_percent'] ?? 0) / 100)
    : character.increasedSpellDamage + (skill.damageType === 'chaos' ? 0 : (supportMods.increased['inc_ele_damage_percent'] ?? 0) / 100)
  const more = skill.damageType === 'physical'
    ? character.morePhysicalDamage * (supportMods.more['inc_phys_damage_percent'] ?? 1)
    : character.moreSpellDamage * (skill.damageType === 'chaos' ? 1 : (supportMods.more['inc_ele_damage_percent'] ?? 1))
  const specialMore = character.special.moreDamageMultiplier ?? 1
  const packMultiplier = skill.targeting === 'pack' ? 1.5 : 1
  const projectileMultiplier = linkedSupports.some(entry => entry.support.special === 'extraProjectile') && skill.tags.includes('projectile') ? 1.25 : 1
  const multiplier = (1 + increased) * more * specialMore * packMultiplier * projectileMultiplier * momentumDamageMultiplier(combat.momentum, character)
  return {
    minDamage: Math.max(1, Math.floor((scaledMin + flat) * multiplier)),
    maxDamage: Math.max(1, Math.floor((scaledMax + flat) * multiplier)),
    cooldownTicks,
  }
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

/**
 * How many front-to-back pack members a skill can hit, derived from its range-band tag.
 * melee = front only, nearRange = front 2, farRange = front 3, allRange = whole pack.
 * Band membership is a static slot index — no continuous distance or positioning math.
 */
export function rangeBandHitCount(skill: Skill, packSize: number): number {
  const tags = skill.tags
  if (tags.includes('allRange')) return Math.max(1, packSize)
  if (tags.includes('farRange')) return Math.min(3, packSize)
  if (tags.includes('nearRange')) return Math.min(2, packSize)
  return 1 // melee / default single-target
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
  targetCount: number
} {
  const linkedSupports = linkedSupportsForSkill(equipped, skill)
  const supports = linkedSupports.map(entry => entry.support)
  const supportIds = linkedSupports.map(entry => entry.id)
  const supportMods = aggregateSupportModifiers(supports, supportIds, character)
  const supportActionSpeed = ((supportMods.increased['inc_attack_speed_percent'] ?? 0) + (supportMods.increased['inc_cast_speed_percent'] ?? 0)) / 100

  const isHit = character.special.alwaysHit ? true : Math.random() <= hitChance(character.accuracy, monster.evasion, evasionStacks)
  if (!isHit) {
    return {
      damage: 0,
      damageType: skill.damageType,
      crit: false,
      isHit: false,
      nextEquipped: { ...equipped, cooldownRemaining: effectiveCooldownTicks(skill.cooldownTicks, combat.momentum, character, supportActionSpeed) },
      ailments: [],
      targetCount: rangeBandHitCount(skill, combat.currentPack.length || 1),
    }
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

  const incPhys = character.increasedPhysicalDamage + (supportMods.increased['inc_phys_damage_percent'] ?? 0) / 100
  const morePhys = character.morePhysicalDamage * (supportMods.more['inc_phys_damage_percent'] ?? 1) * (character.special.moreDamageMultiplier ?? 1)

  const incSpell = character.increasedSpellDamage + (supportMods.increased['inc_spell_damage_percent'] ?? 0) / 100
  const moreSpell = character.moreSpellDamage * (supportMods.more['inc_spell_damage_percent'] ?? 1) * (character.special.moreDamageMultiplier ?? 1)

  const incEle = (supportMods.increased['inc_ele_damage_percent'] ?? 0) / 100
  const moreEle = supportMods.more['inc_ele_damage_percent'] ?? 1

  const monsterArmour = (monster.armour ?? 0) + monster.level * 2

  // Support specials
  const hasExtraProjectile = supports.some(s => s.special === 'extraProjectile') && skill.tags.includes('projectile')
  const hasConvertChaos = supports.some(s => s.special === 'convertPhysicalToChaos')
  const hasAilmentDuration = supports.some(s => s.special === 'ailmentDuration')
  const hasExtraPackTarget = supports.some(s => s.special === 'extraPackTarget') && skill.tags.includes('aoe')
  const hasSpreadOnDeath = supports.some(s => s.special === 'spreadDotOnDeath') && skill.tags.includes('dot')

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
    const isAttack = skill.tags.includes('attack')
    const baseInc = isAttack ? incPhys : incSpell
    const baseMore = isAttack ? morePhys : moreSpell
    const inc = skill.damageType === 'chaos' ? baseInc : baseInc + incEle
    const m = skill.damageType === 'chaos' ? baseMore : baseMore * moreEle
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
    if (hasAilmentDuration) {
      const durationSupport = linkedSupports.find(entry => entry.support.special === 'ailmentDuration')
      const durationMultiplier = 1 + 0.25 * supportModMultiplier(getGemLevel(character, durationSupport?.id ?? ''))
      ailment.remainingTicks = Math.max(1, Math.floor(ailment.remainingTicks * durationMultiplier))
    }
    if (hasSpreadOnDeath) ailment.spreadOnDeath = true
    ailments.push(ailment)
  }

  // Gear chance-to-ailment procs
  if (Math.random() * 100 < (character.chanceToBleed ?? 0)) {
    const ailment = createAilmentFromSkill({ type: 'bleed', damagePerSecond: Math.max(1, Math.floor(damage * 0.2)), durationSeconds: 5 }, Math.floor(damage), skill.id)
    if (hasSpreadOnDeath) ailment.spreadOnDeath = true
    ailments.push(ailment)
  }
  if (Math.random() * 100 < (character.chanceToShock ?? 0)) {
    const ailment = createAilmentFromSkill({ type: 'burn', damagePerSecond: Math.max(1, Math.floor(damage * 0.15)), durationSeconds: 4 }, Math.floor(damage), skill.id)
    if (hasSpreadOnDeath) ailment.spreadOnDeath = true
    ailments.push(ailment)
  }
  if (Math.random() * 100 < (character.chanceToInflictDespair ?? 0)) {
    const ailment = createAilmentFromSkill({ type: 'poison', damagePerSecond: Math.max(1, Math.floor(damage * 0.25)), durationSeconds: 6 }, Math.floor(damage), skill.id)
    if (hasSpreadOnDeath) ailment.spreadOnDeath = true
    ailments.push(ailment)
  }

  if (monster.rarity === 'boss') {
    damage *= (1 + (character.damageVsBossesPercent ?? 0) / 100)
  }

  const baseTargetCount = rangeBandHitCount(skill, combat.currentPack.length || 1)
  const targetCount = hasExtraPackTarget && !skill.tags.includes('allRange')
    ? Math.min(combat.currentPack.length || 1, baseTargetCount + 1)
    : baseTargetCount

  return { damage: Math.max(1, Math.floor(damage)), damageType: skill.damageType, crit: isCrit, isHit: true, nextEquipped, ailments, targetCount }
}

export interface SkillHitOutcome {
  skillId: string
  damage: number
  isHit: boolean
  crit: boolean
  ailments: AilmentInstance[]
  targetCount: number
}

export interface SkillProcessResult {
  character: Character
  damage: number
  evaded: boolean
  event: CombatEvent
  monsterEvasionStacks: number
  combat: CombatState
  ailments: AilmentInstance[]
  crit: boolean
  extraEvents: CombatEvent[]
  // Per-skill outcomes so the sim can apply damage to the first N pack members per range band
  hitsBySkill: SkillHitOutcome[]
}

export function processSkillHits(character: Character, monster: Monster, combat: CombatState): SkillProcessResult {
  let totalDamage = 0
  let anyCrit = false
  let evaded = true
  let currentStacks = combat.monsterEvasionStacks
  const nextEquipped: EquippedSkill[] = []
  let ailments: AilmentInstance[] = []
  const leveledUp: { gemId: string; newLevel: number }[] = []
  const hitsBySkill: SkillHitOutcome[] = []
  const summonEvents: CombatEvent[] = []
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
    // Summon skills spawn/renew a minion instead of dealing damage (minion spec §4.2).
    if (skill.summons) {
      const linkedSummonSupports = linkedSupportsForSkill(equipped, skill)
      const summonMods = aggregateSupportModifiers(
        linkedSummonSupports.map(entry => entry.support),
        linkedSummonSupports.map(entry => entry.id),
        character,
      )
      const summonActionSpeed = (
        (summonMods.increased['inc_attack_speed_percent'] ?? 0) +
        (summonMods.increased['inc_cast_speed_percent'] ?? 0)
      ) / 100
      const summonResult = summonMinion(character, skill.summons.minionDefId)
      character = summonResult.character
      if (summonResult.event) summonEvents.push(summonResult.event)
      nextEquipped.push({
        ...equipped,
        cooldownRemaining: effectiveCooldownTicks(skill.cooldownTicks, combat.momentum, character, summonActionSpeed),
        hitCounter: equipped.hitCounter + 1,
      })
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
    hitsBySkill.push({
      skillId: skill.id,
      damage: result.damage,
      isHit: result.isHit,
      crit: result.crit,
      ailments: result.ailments,
      targetCount: result.targetCount,
    })
  }

  character = { ...character, equippedSkills: nextEquipped }

  // Momentum gain on hit (Warlord core mechanic)
  if (!evaded && character.special.momentum) {
    combat = { ...combat, momentum: gainMomentum(combat.momentum, 1, character) }
  }

  const extraEvents: CombatEvent[] = [
    ...leveledUp.map(l => {
      const gem = SKILLS[l.gemId] ?? SUPPORTS[l.gemId]
      return makeEvent({ type: 'gemLeveledUp', gemId: l.gemId, gemName: gem?.name ?? l.gemId, newLevel: l.newLevel })
    }),
    ...summonEvents,
  ]

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

  return { character, damage: totalDamage, evaded, event, monsterEvasionStacks: currentStacks, combat, ailments, crit: anyCrit, extraEvents, hitsBySkill }
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
  let combat: CombatState = { ...state.combat }
  let currencies = { ...state.currencies }
  let zones: Zone[] = state.zones.map(z => ({ ...z }))
  let inventory = { ...state.inventory, items: [...state.inventory.items] }
  let activeTrial = state.activeTrial
  let gamePhase = state.gamePhase
  let activeZoneId = state.activeZoneId
  let previousZoneId = state.previousZoneId
  const sourceNexus = state.nexus ?? { maps: [], activeMapId: null, packsCleared: 0, completedTierRewards: [] }
  let nexus = {
    ...sourceNexus,
    maps: (Array.isArray(sourceNexus.maps) ? sourceNexus.maps : []).map(map => ({ ...map })),
  }

  const campaignZone = zones.find(z => z.id === state.activeZoneId)
  const activeNexusMap = sourceNexus.activeMapId
    ? (Array.isArray(sourceNexus.maps) ? sourceNexus.maps : []).find(map => map.id === sourceNexus.activeMapId) ?? null
    : null
  const zone = campaignZone ?? (activeNexusMap && isNexusZoneId(state.activeZoneId) ? nexusZoneForMap(activeNexusMap) : undefined)
  const isNexusRun = !!activeNexusMap && !campaignZone && state.activeZoneId === nexusZoneIdForMap(activeNexusMap)

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
        state: { ...state, character, combat, zones, inventory, activeZoneId, previousZoneId, activeTrial, gamePhase, nexus },
        events,
      }
    }
  }

  // Party-set effects (M1, minion spec §2.4): every active aura/army is stamped
  // onto all party members' activeEffects. Later phases refactor these reads to
  // consume the set instead of re-deriving them from character.special here.
  combat = {
    ...combat,
    herald: { ...combat.herald, active: getHeraldActive(character.special, character.keystoneChoices) },
    party: applyPartyEffects({ ...state, combat }).combat.party,
  }
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
      state: { ...state, character, combat, zones, inventory, activeZoneId, previousZoneId, activeTrial, gamePhase, nexus },
      events,
    }
  }

  // Travel phase (Stage 1 spatial): no attacks in either direction. Buffs,
  // DOTs, ES recharge and Momentum decay already ran above on their normal
  // timers. When the timer expires, seed the pack at the waypoint and engage.
  if (combat.phase === 'traveling') {
    if (combat.travelTicksRemaining > 1) {
      combat = { ...combat, travelTicksRemaining: combat.travelTicksRemaining - 1 }
      // Minion respawn timers and the party mirror keep ticking during travel
      // (spec section 3: timers run on their normal schedule mid-travel).
      const travelRevival = tickSummonRevivals(character)
      character = travelRevival.character
      events.push(...travelRevival.events)
      combat = { ...combat, party: { ...combat.party, members: resolveParty(character) } }
      return {
        state: { ...state, character, combat, zones, inventory, activeZoneId, previousZoneId, activeTrial, gamePhase, nexus },
        events,
      }
    }
    // Arrival tick: seed the pack at the waypoint and engage. Seeding must
    // happen with phase 'engaged' so placement uses the waypoint correctly.
    if (!zone) {
      return { state: { ...state, character, combat, zones, inventory, activeZoneId, previousZoneId, activeTrial, gamePhase, nexus }, events }
    }
    const spawnResult = spawnMonster(zone, { ...combat, phase: 'engaged' })
    combat = {
      ...spawnResult.combat,
      phase: 'engaged',
      travelTicksRemaining: 0,
      damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
      // The party now stands at the pack: re-anchor to the waypoint.
      partyPosition: { ...combat.waypoint },
    }
    events.push(...spawnResult.events)
    const monster = spawnResult.monster
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
  } else if (combat.currentPack.length === 0) {
    // Engaged with no pack (fresh zone entry / post-nexus reset): start a
    // travel beat to the first pack instead of spawning it instantly.
    if (!zone) {
      return { state: { ...state, character, combat, zones, inventory, activeZoneId, previousZoneId, activeTrial, gamePhase, nexus }, events }
    }
    combat = beginTravelToNextPack(combat, events, character)
  } else if (!combat.monster) {
    // A pack exists but the active monster pointer was lost; restore it
    combat = activatePackMember(combat, combat.currentPack[0])
  }

  const monster = combat.monster!

  // Player skills — range bands: each skill hits the first N pack members front-to-back.
  if (combat.monsterLife > 0) {
    const skillResult = processSkillHits(character, monster, combat)
    character = skillResult.character
    combat = { ...combat, monsterEvasionStacks: skillResult.monsterEvasionStacks }
    events.push(...skillResult.extraEvents)
    if (skillResult.damage > 0) {
      // Apply each skill's damage to the first N pack members (band-derived target count),
      // front-to-back, never skipping the front monster. Band membership is a static slot
      // index — no positional math or movement.
      const pack = [...combat.currentPack]
      let bandHitCount = 0
      let appliedDamage = 0
      const bandAilments: AilmentInstance[] = []
      for (const hit of skillResult.hitsBySkill) {
        if (!hit.isHit || hit.damage <= 0) continue
        const count = Math.min(hit.targetCount, pack.length)
        for (let i = 0; i < count; i++) {
          pack[i] = { ...pack[i], currentLife: Math.max(0, pack[i].currentLife - hit.damage) }
        }
        // Track actual damage dealt to the pack (per-target damage x number of targets hit)
        appliedDamage += hit.damage * count
        bandHitCount = Math.max(bandHitCount, count)
        if (count > 1) {
          const bandSkill = SKILLS[hit.skillId]
          // Only ailments from a skill that actually multi-hit spread to the back row
          bandAilments.push(...hit.ailments)
          events.push(makeEvent({
            type: 'bandHit',
            skillName: bandSkill?.name ?? hit.skillId,
            targetCount: count,
          }))
        }
      }
      const frontLife = pack.length > 0 ? pack[0].currentLife : 0
      combat = { ...combat, currentPack: pack, monsterLife: frontLife, lastDamageDealt: appliedDamage, lastDamageSource: 'player' }
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

      // Range-band multi-hit: back members also take plain copies of the ailments applied
      // by the multi-target skills that actually reached them.
      if (bandAilments.length > 0 && bandHitCount > 1) {
        for (let i = 1; i < bandHitCount && i < pack.length; i++) {
          const targetId = pack[i].monster.id
          combat.ailments[targetId] = [...(combat.ailments[targetId] ?? []), ...bandAilments.map(a => ({ ...a }))]
          for (const ailment of bandAilments) {
            events.push(makeEvent({ type: 'ailmentApplied', targetId, ailmentType: ailment.type }))
          }
        }
      }

      combat = markHit(combat, monster.id)
    } else if (skillResult.evaded) {
      events.push(skillResult.event)
    }
  }

  // Minion attack turns (minion spec §5): alive minions fire on their own
  // cooldowns through the same front-to-back band distribution as player
  // skills. Minion kills grant no rewards (§5.4) — attribution below.
  if (combat.monsterLife > 0 && combat.currentPack.length > 0) {
    const minionResult = processMinionHits(character, combat, monster)
    combat = minionResult.combat
    events.push(...minionResult.events)
    for (const hit of minionResult.hits) {
      const count = Math.min(hit.targetCount, combat.currentPack.length)
      const pack = [...combat.currentPack]
      for (let i = 0; i < count; i++) {
        pack[i] = { ...pack[i], currentLife: Math.max(0, pack[i].currentLife - hit.damage) }
      }
      const appliedDamage = hit.damage * count
      const frontLife = pack.length > 0 ? pack[0].currentLife : 0
      combat = { ...combat, currentPack: pack, monsterLife: frontLife, lastDamageDealt: appliedDamage, lastDamageSource: 'minion' }
      // Ailments on every band target (plain copies on back members).
      if (hit.ailments.length > 0) {
        const nextAilments = { ...combat.ailments }
        for (let i = 0; i < count && i < pack.length; i++) {
          const targetId = pack[i].monster.id
          nextAilments[targetId] = [...(nextAilments[targetId] ?? []), ...hit.ailments.map(a => ({ ...a }))]
          events.push(makeEvent({ type: 'ailmentApplied', targetId, ailmentType: hit.ailments[0].type }))
        }
        combat = { ...combat, ailments: nextAilments }
        // Wretch bites feed Virulent stack tracking (spec §7.3).
        if (
          character.special.septicemia || character.special.cardiacArrest ||
          character.special.asphyxiation || character.special.cirrhosis || character.special.calcify
        ) {
          const newStacks = (combat.virulent.stacks[monster.id] ?? 0) + hit.ailments.length
          combat = { ...combat, virulent: { ...combat.virulent, stacks: { ...combat.virulent.stacks, [monster.id]: newStacks } } }
        }
      }
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
      combat = { ...combat, monsterLife: Math.max(0, combat.monsterLife - dotDamage), lastDamageDealt: dotDamage, lastDamageSource: 'player' }
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
      const monsterHit = Math.random() <= hitChance(effectiveMonsterAccuracy, character.evasion, combat.playerEvasionStacks)
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
          state: { ...state, character, combat, currencies, zones, inventory, activeZoneId, previousZoneId, activeTrial, gamePhase, nexus },
          events,
        }
      }
    } else {
      combat = { ...combat, lastDamageTaken: 0, playerEvasionStacks: combat.playerEvasionStacks + 1 }
      events.push(makeEvent({ type: 'hitAvoided', source: 'monster', targetId: character.id, reason: 'evaded' }))
    }
    }
  }

  // Keep the pack member's current life in sync before deciding death
  combat = syncActivePackMember(combat)


  // Nexus Stage 4: phased bosses shift stats when crossing health thresholds.
  // Runs after all player/minion/DOT damage so a phase never overrides the
  // killing blow in the same tick, and before the death check.
  combat = advanceBossPhases(combat, events)
  // Monster killed
  if (combat.monsterLife <= 0) {
    // Reward attribution (minion spec 5.4): minion killing blows grant no
    // gold, XP, loot, currency, or zone/trial progress.
    const minionKill = combat.lastDamageSource === 'minion'
    let goldEarned = minionKill ? 0 : monster.goldReward
    if (!minionKill && hasHerald(combat, 'gold')) {
      const goldMultiplier = character.special.unwaveringDeclaration ? 1.5 : 1.25
      goldEarned = Math.floor(goldEarned * goldMultiplier)
    }
    if (!minionKill) {
      goldEarned = Math.floor(goldEarned * (1 + (character.goldFindPercent ?? 0) / 100))
    }
    const xpEarned = minionKill ? 0 : monster.experienceReward

    events.push(makeEvent({ type: 'monsterDied', monsterId: monster.id, monsterType: monster.name }))
    if (monster.rarity === 'boss') {
      events.push(makeEvent({ type: 'bossDefeated', bossId: monster.id }))
    }

    // Act 8 final boss gateway + map sustain: award Rift Crystals on eligible kills.
    const bossCrystalReward = riftCrystalRewardForBoss(campaignZone, monster)
    const mapEffects = aggregateMapAffixEffects(zone?.mapAffixes)
    const mapCrystalReward = isNexusRun && Math.random() < NEXUS_RIFT_CRYSTAL_DROP_CHANCE * (1 + mapEffects.riftCrystalChance) ? 1 : 0
    const riftCrystalReward = bossCrystalReward + mapCrystalReward
    if (riftCrystalReward > 0) {
      currencies['rift_crystal'] = (currencies['rift_crystal'] || 0) + riftCrystalReward
      events.push(makeEvent({ type: 'riftCrystalGained', amount: riftCrystalReward }))
    }

    // Nexus Stage 4: the Primeval Sovereign pays 25 crystals + a guaranteed
    // unique (approved design). Player kills only — minion spec 5.4.
    if (!minionKill && monster.id === SOVEREIGN_MONSTER_ID) {
      currencies['rift_crystal'] = (currencies['rift_crystal'] || 0) + SOVEREIGN_RIFT_CRYSTAL_REWARD
      events.push(makeEvent({ type: 'riftCrystalGained', amount: SOVEREIGN_RIFT_CRYSTAL_REWARD }))
      const pinnacleDrop = dropItem(zone?.level ?? character.level, { forceRarity: 'unique' })
      if (pinnacleDrop) {
        if (inventory.items.length < inventory.maxSize) {
          inventory.items = [...inventory.items, pinnacleDrop]
          events.push(makeEvent({ type: 'itemDropped', itemId: pinnacleDrop.id, rarity: pinnacleDrop.rarity }))
        } else {
          currencies['gold'] = (currencies['gold'] || 0) + Math.max(1, pinnacleDrop.itemLevel * 2)
        }
      }
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

    // Drop item (player kills only - minion spec 5.4)
    if (zone && !minionKill) {
      const hasGold = hasHerald(combat, 'gold')
      const unwavering = character.special.unwaveringDeclaration
      const namedEliteBonuses = monster.dropBonuses
      const rarityBonus = {
        rare: (hasGold ? (unwavering ? 0.1 : 0.05) : 0) + (namedEliteBonuses?.rareChance ?? 0),
        magic: hasGold ? (unwavering ? 0.2 : 0.1) : 0,
      }
      const mapEffects = aggregateMapAffixEffects(zone.mapAffixes)
      const extraDropChance =
        (hasGold ? (unwavering ? 0.5 : 0.25) : 0) +
        (namedEliteBonuses?.extraDropChance ?? 0) +
        mapEffects.extraDropChance
      const dropModifiers: DropModifiers = {
        rarityBonus,
        extraDropChance,
      }
      const drops = [dropItem(zone.level, dropModifiers)]
      if (Math.random() < extraDropChance) {
        drops.push(dropItem(zone.level, dropModifiers))
      }
      // Named elite unique chance (no-op until unique items exist)
      if (namedEliteBonuses?.uniqueChance && Math.random() < namedEliteBonuses.uniqueChance) {
        drops.push(dropItem(zone.level, { rarityBonus, extraDropChance: 0, forceRarity: 'unique' }))
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

    // Currency drop chance (player kills only - minion spec 5.4)
    if (!minionKill && Math.random() < 0.1) {
      const currencyPool = ['awakening', 'mutation', 'cleansing']
      const currencyId = currencyPool[Math.floor(Math.random() * currencyPool.length)]
      currencies[currencyId] = (currencies[currencyId] || 0) + 1
    }

    // Zone progress (player kills only - minion spec 5.4)
    if (zone && !minionKill) {
      const newProgress = Math.min(100, zone.killProgress + 100 / zone.killsRequired)
      zones = zones.map(w => (w.id === zone.id ? { ...w, killProgress: newProgress } : w))
      events.push(makeEvent({ type: 'zoneProgress', current: newProgress, total: 100 }))

      const currentIndex = zones.findIndex(w => w.id === zone.id)
      if (currentIndex >= 0 && zones[currentIndex].killProgress >= 100 && currentIndex < zones.length - 1) {
        zones = zones.map((w, idx) => (idx === currentIndex + 1 ? { ...w, unlocked: true } : w))
      }

      // Support slot growth at campaign milestones via the shared balance
      // helper so offline-simulated progress matches live play exactly.
      const completedActs = zones.filter(w => w.killProgress >= 100).map(w => w.act)
      const slotCount = supportSlotCountForCompletedActs(completedActs)
      if (character.supportSlotCount !== slotCount) {
        character = { ...character, supportSlotCount: slotCount }
      }
    }

    // Trial completion (player kills only - minion spec 5.4)
    if (activeTrial && !minionKill) {
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

    // Advance to the next pack member or seed a fresh pack
    if (zone) {
      const carryoverDamage = combat.packDamageCarryover
      combat = advancePack(zone, combat, events, carryoverDamage, character)

      // Plaguewind carryover: DOTs from the last killed monster infect the next active one
      if (combat.monster && combat.plaguewindCarryover.length > 0) {
        const nextAilments: Record<string, AilmentInstance[]> = { ...combat.ailments }
        nextAilments[combat.monster.id] = [...(nextAilments[combat.monster.id] ?? []), ...combat.plaguewindCarryover]
        combat = { ...combat, ailments: nextAilments, plaguewindCarryover: [], packDamageCarryover: 0, virulent: { ...combat.virulent, patientZeroTarget: null } }
      } else {
        combat = { ...combat, packDamageCarryover: 0, virulent: { ...combat.virulent, patientZeroTarget: null } }
      }

      // A Nexus map advances only when a whole pack is cleared.
      if (isNexusRun && events.some(event => event.type === 'packCleared')) {
        const clearResult = recordNexusPackClear(nexus)
        nexus = clearResult.nexus
        if (clearResult.mapCompleted) {
          const returnZone = previousZoneId ? zones.find(candidate => candidate.id === previousZoneId) : undefined
          activeZoneId = returnZone?.id ?? zones[0]?.id ?? activeZoneId
          previousZoneId = null
          combat = {
            ...combat,
            monster: null as any,
            monsterLife: 0,
            currentPack: [],
            packSizeRemaining: 0,
            packNamedEliteCount: 0,
            packDamageCarryover: 0,
            phase: 'engaged',
          }
          events.push(makeEvent({ type: 'nexusMapCompleted' }))
          // Nexus Stage 4: the first T16 clear unlocks the Primeval Sovereign arena.
          if (clearResult.completedTier === NEXUS_MAX_TIER) {
            const unlock = grantSovereignUnlock(nexus, zones)
            nexus = unlock.nexus
            zones = unlock.zones
            if (unlock.unlocked) {
              events.push(makeEvent({ type: 'bossSpawned', bossId: SOVEREIGN_MONSTER_ID }))
            }
          }
        }
      }
    }
  }

  // Apply dev overrides after all calculations
  character = applyDevOverrides(character)

  // Minion lifecycle: auto-revive elapsed respawn timers (decision D1a) and
  // refresh the live party mirror so dead members leave the set immediately
  // (minion spec section 4.2 steps 3-4).
  const revivalResult = tickSummonRevivals(character)
  character = revivalResult.character
  events.push(...revivalResult.events)
  combat = { ...combat, party: { ...combat.party, members: resolveParty(character) } }

  const nextState: GameState = {
    ...state,
    character,
    combat,
    currencies,
    zones,
    inventory,
    activeTrial,
    gamePhase,
    activeZoneId,
    previousZoneId,
    nexus,
  }

  return { state: nextState, events }
}

export function processCombatTick(character: Character, combat: CombatState): { character: Character; combat: CombatState; goldEarned: number; xpEarned: number } {
  return { character, combat, goldEarned: 0, xpEarned: 0 }
}
