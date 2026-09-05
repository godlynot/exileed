import { MINION, TICKS_PER_SECOND, monsterScalingMultiplier } from '../data/balance.ts'
import { MINIONS, type MinionDef } from '../data/minions.ts'
import { SKILLS } from '../data/skills.ts'
import { hitChance, rangeBandHitCount, skillDisplayStats } from './combat.ts'
import type {
  AilmentInstance,
  Character,
  CharacterSummon,
  CombatEvent,
  CombatState,
  DamageType,
  Monster,
  PartyMember,
} from '../types/game.ts'

let minionEventCounter = 0

function makeEvent(
  payload: Omit<Extract<CombatEvent, { type: 'minionSpawned' }>, 'id' | 'timestamp'>,
): CombatEvent
function makeEvent(
  payload: Omit<Extract<CombatEvent, { type: 'minionDied' }>, 'id' | 'timestamp'>,
): CombatEvent
function makeEvent(
  payload: Omit<Extract<CombatEvent, { type: 'minionRevived' }>, 'id' | 'timestamp'>,
): CombatEvent
function makeEvent(
  payload: Omit<Extract<CombatEvent, { type: 'summonBlocked' }>, 'id' | 'timestamp'>,
): CombatEvent
function makeEvent(payload: Record<string, unknown>): CombatEvent {
  return {
    id: `evt_minion_${Date.now()}_${minionEventCounter++}`,
    timestamp: Date.now(),
    ...(payload as object),
  } as CombatEvent
}

/**
 * Defensive stats use the gear curve family exponent; offensive flat damage
 * uses the full curve (minion spec §8.1).
 */
export function minionLevelScaling(level: number): number {
  const exponent = MINION.LEVEL_SCALING_EXPONENT
  return Math.pow(monsterScalingMultiplier(level), exponent)
}

/**
 * Minion offense growth curve, fitted against the real player DPS pipeline
 * (skillDisplayStats) so the validator's full 4-member army lands inside the
 * 20-40% DPS-share band at every campaign zone level (minion spec §8.3 —
 * run `bun run validate:balance` after touching). Knots sit exactly at zone
 * levels because the player power model is only sampled there; values are
 * absolute offense scale multipliers (base def flats × table value).
 *
 * Levels above 65 (campaign cap) continue the last measured per-level growth
 * (~×1.074/level) — unverified extrapolation for the Nexus, revisit after a
 * live nexus progression review.
 */
const OFFENSE_GROWTH_TABLE: [level: number, value: number][] = [
  [1, 0.4],
  [2, 0.43],
  [5, 1.15],
  [9, 2.69],
  [12, 4.68],
  [17, 11.3],
  [20, 22.4],
  [25, 40.3],
  [29, 193],
  [33, 232],
  [37, 528],
  [41, 739],
  [46, 1296],
  [51, 2284],
  [56, 3500],
  [60, 5775],
  [65, 8246],
  [70, 11775],
  [75, 16815],
  [80, 24012],
]

function offenseGrowthAt(level: number): number {
  const lv = Math.max(1, Math.floor(level))
  for (let i = 1; i < OFFENSE_GROWTH_TABLE.length; i++) {
    const [hiLevel, hiValue] = OFFENSE_GROWTH_TABLE[i]
    if (lv <= hiLevel) {
      const [loLevel, loValue] = OFFENSE_GROWTH_TABLE[i - 1]
      if (hiLevel === loLevel) return hiValue
      const t = (lv - loLevel) / (hiLevel - loLevel)
      return loValue + t * (hiValue - loValue)
    }
  }
  return OFFENSE_GROWTH_TABLE[OFFENSE_GROWTH_TABLE.length - 1][1]
}

export function minionOffenseScaling(level: number): number {
  // Fitted gear-curve growth (see OFFENSE_GROWTH_TABLE). The old
  // monster-curve offense made the army share decay from ~24% to ~3% across
  // the campaign; this table holds it mid-band at every zone level.
  return offenseGrowthAt(level)
}

/**
 * Accuracy growth matching the player's own accuracy curve (linear ~+0.125
 * per level, 200 → ~1900 on the validator's reference profile). Minion
 * accuracy is a percent of the player's stat at the same level (§8.1), so it
 * must never ride the exponential damage curve.
 */
export function minionAccuracyScaling(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.125
}

/**
 * Pure resolver: turn one persisted summon into a live PartyMember (minion
 * spec §2.3, §8). Deterministic, no RNG — used by the party resolver and the UI.
 */
export function resolveMinionMember(summon: CharacterSummon, def: MinionDef, instanceIndex = 1): PartyMember {
  const defensiveScale = minionLevelScaling(summon.level)
  const offenseScale = minionOffenseScaling(summon.level)
  const lifeMult = def.lifeMultiplier ?? 1

  return {
    id: `minion_${def.id}_${instanceIndex}`,
    role: 'minion',
    name: def.name,
    level: summon.level,
    maxLife: Math.max(1, Math.floor(def.baseLife * lifeMult * MINION.LIFE_PERCENT * defensiveScale)),
    life: Math.max(1, Math.floor(def.baseLife * lifeMult * MINION.LIFE_PERCENT * defensiveScale)),
    maxEnergyShield: Math.floor(def.baseEnergyShield * MINION.ES_PERCENT * defensiveScale),
    energyShield: Math.floor(def.baseEnergyShield * MINION.ES_PERCENT * defensiveScale),
    armour: Math.floor(def.baseArmour * MINION.ARMOUR_PERCENT * defensiveScale),
    evasion: Math.floor(def.baseEvasion * MINION.EVASION_PERCENT * defensiveScale),
    // Accuracy tracks the player's own accuracy growth (linear, ~200 → ~1900
    // across the campaign on the validator's reference profile) rather than
    // the damage curve — monster evasion grows slowly, so matching the
    // player's hit rates is what keeps minion DPS share level-stable.
    accuracy: Math.floor(def.baseAccuracy * MINION.ACCURACY_PERCENT * minionAccuracyScaling(summon.level)),
    resistances: {
      fire: def.baseResistances.fire ?? 0,
      cold: def.baseResistances.cold ?? 0,
      lightning: def.baseResistances.lightning ?? 0,
      chaos: def.baseResistances.chaos ?? 0,
    },
    attack: {
      skillId: def.attack.skillId,
      attackRate: def.attack.attackRate,
      damageEffectiveness: def.attack.damageEffectiveness,
      flatDamage: {
        min: Math.max(1, Math.floor(def.attack.flatMin * offenseScale)),
        max: Math.max(1, Math.floor(def.attack.flatMax * offenseScale)),
        type: def.attack.damageType,
      },
    },
    source: { type: 'skill', id: def.id },
    minionDefId: def.id,
    alive: true,
    respawnTicksRemaining: 0,
    activeEffects: { herald: [], army: null, momentumStacks: 0 },
  }
}

export interface MinionStatPreview {
  level: number
  maxLife: number
  maxEnergyShield: number
  armour: number
  evasion: number
  accuracy: number
  attackMin: number
  attackMax: number
  damageType: string
  attackRate: number
  /** avg damage x attack rate, before hit chance and mitigation */
  dps: number
}

/**
 * UI-facing stat preview for one minion def at a given level (minion spec
 * §9.2: summon-skill tooltips show the minion's stats at your level). Reuses
 * the real resolver so displayed numbers always match spawned minions.
 */
export function minionStatPreview(def: MinionDef, level: number): MinionStatPreview {
  const member = resolveMinionMember(
    { minionDefId: def.id, level, xp: 0, alive: true, respawnTicksRemaining: 0 },
    def,
    1,
  )
  const avg = (member.attack.flatDamage.min + member.attack.flatDamage.max) / 2
  return {
    level,
    maxLife: member.maxLife,
    maxEnergyShield: member.maxEnergyShield,
    armour: member.armour,
    evasion: member.evasion,
    accuracy: member.accuracy,
    attackMin: member.attack.flatDamage.min,
    attackMax: member.attack.flatDamage.max,
    damageType: member.attack.flatDamage.type,
    attackRate: member.attack.attackRate,
    dps: avg * member.attack.attackRate,
  }
}

/**
 * Unique member id for an instance: `minion_<defId>_<n>` where n is the
 * 1-based instance index among that def's summons.
 */
export function nextMinionId(defId: string, summons: Iterable<CharacterSummon>): string {
  let count = 0
  for (const summon of summons) {
    if (summon.minionDefId === defId) count++
  }
  return `minion_${defId}_${count + 1}`
}

/**
 * Summon (or revive) a minion of `defId`. Cast rules (spec §4.2, decisions
 * D1a/D3a): the cast fizzles with a `summonBlocked` event when the def is at
 * its own cap or the army is at MAX_SUMMONS_TOTAL; a dead instance is revived
 * in place; otherwise a fresh entry appends to `character.summons`. Pure.
 */
export function summonMinion(
  character: Character,
  defId: string,
): { character: Character; event: CombatEvent | null } {
  const def = MINIONS[defId]
  if (!def) return { character, event: null }

  const ofDef = character.summons.filter(summon => summon.minionDefId === defId)
  const aliveOfDef = ofDef.filter(summon => summon.alive).length
  if (aliveOfDef >= def.minionCap || totalAliveSummons(character) >= MINION.MAX_SUMMONS_TOTAL) {
    return { character, event: makeEvent({ type: 'summonBlocked', minionType: def.name, reason: 'capReached' }) }
  }

  // Revive the first dead instance of this def in place (auto-revive D1a also
  // lands here via tickSummonRevivals).
  const dead = ofDef.find(summon => !summon.alive)
  if (dead) {
    const summons = character.summons.map(summon =>
      summon === dead ? { ...summon, alive: true, respawnTicksRemaining: 0 } : summon,
    )
    return {
      character: { ...character, summons },
      event: makeEvent({ type: 'minionRevived', minionId: nextMinionId(defId, summons), minionType: def.name, level: dead.level }),
    }
  }

  // New instance at the caster's current level (spec §8.2).
  const summons: CharacterSummon[] = [
    ...character.summons,
    { minionDefId: defId, level: character.level, xp: 0, alive: true, respawnTicksRemaining: 0 },
  ]
  return {
    character: { ...character, summons },
    event: makeEvent({ type: 'minionSpawned', minionId: nextMinionId(defId, summons), minionType: def.name, level: character.level }),
  }
}

/**
 * Mark the first alive instance of the def dead and start its respawn timer. Pure.
 */
export function killMinion(
  character: Character,
  defId: string,
): { character: Character; event: CombatEvent | null } {
  const def = MINIONS[defId]
  const summon = character.summons.find(entry => entry.minionDefId === defId && entry.alive)
  if (!summon) return { character, event: null }

  const instanceIndex = character.summons
    .filter(entry => entry.minionDefId === defId)
    .indexOf(summon) + 1
  const summons = character.summons.map(entry =>
    entry === summon
      ? { ...entry, alive: false, respawnTicksRemaining: Math.round(def?.summonCooldownSeconds ?? 16) * TICKS_PER_SECOND }
      : entry,
  )
  return {
    character: { ...character, summons },
    event: makeEvent({ type: 'minionDied', minionId: `minion_${defId}_${instanceIndex}`, minionType: def?.name ?? defId }),
  }
}

/**
 * Auto-revival (decision D1a): decrement dead summons' respawn timers and
 * revive when they hit zero. Returns an updated character plus one
 * `minionRevived` event per revived summon.
 */
export function tickSummonRevivals(character: Character): { character: Character; events: CombatEvent[] } {
  const events: CombatEvent[] = []
  let changed = false
  // Defensive read: hand-built characters (combat fixtures) and pre-migration
  // state may not carry the summons field.
  const existingSummons = character.summons ?? []
  if (existingSummons.length === 0) return { character, events }
  const summons = existingSummons.map(summon => {
    if (summon.alive || summon.respawnTicksRemaining <= 0) return summon
    changed = true
    if (summon.respawnTicksRemaining === 1) {
      const def = MINIONS[summon.minionDefId]
      events.push(makeEvent({ type: 'minionRevived', minionId: `minion_${summon.minionDefId}_r`, minionType: def?.name ?? summon.minionDefId, level: summon.level }))
      return { ...summon, alive: true, respawnTicksRemaining: 0 }
    }
    return { ...summon, respawnTicksRemaining: summon.respawnTicksRemaining - 1 }
  })
  return { character: changed ? { ...character, summons } : character, events }
}

/**
 * Revive-on-claim (minion spec §10.2, decision D1a): bring every dead summon
 * back instantly at the end of offline progress — they were "away" too, so
 * their respawn timers already elapsed. Revived minions return at the
 * character's current level, exactly as a fresh cast would (§8.2), so leveling
 * offline never leaves the army under-leveled.
 *
 * Also re-levels summons that revived MID-sim (tickSummonRevivals restores
 * them at their stored level): without this, dying offline and reviving early
 * while the character then levels up leaves alive-but-stale minions. Pure;
 * returns the character unchanged when nothing needs reviving or re-leveling.
 */
export function reviveAllSummons(character: Character): Character {
  const existingSummons = character.summons ?? []
  if (existingSummons.length === 0) return character
  const needsChange = existingSummons.some(summon => !summon.alive || summon.level < character.level)
  if (!needsChange) return character
  return {
    ...character,
    summons: existingSummons.map(summon =>
      summon.alive && summon.level >= character.level
        ? summon
        : { ...summon, level: Math.max(summon.level, character.level), alive: true, respawnTicksRemaining: 0 },
    ),
  }
}

/**
 * Expected damage per tick from one minion member against one monster
 * (average roll x set auras x band targets x hit chance / attack cooldown).
 * Shared by the DPS-share estimator and the balance validator (minion spec §8.3).
 */
export function estimateMinionDpsPerTick(member: PartyMember, monster: Monster, herald: string[], unwavering: boolean, tideRamp = 0): number {
  const flat = member.attack.flatDamage
  const avg = (flat.min + flat.max) / 2
  // Conservative estimate: no Judgment low-life bonus (target at full health).
  const aura = minionHeraldMultiplier(herald, unwavering, tideRamp, 1)
  const chance = hitChance(member.accuracy, monster.evasion, 0)
  const cooldown = minionAttackCooldownTicks(member.attack.attackRate)
  const band = (() => {
    const skill = SKILLS[member.attack.skillId]
    return skill ? rangeBandHitCount(skill, 4) : 1
  })()
  return (avg * aura * chance * band) / cooldown
}

/**
 * Army DPS as a share of the player's own DPS (minion spec §8.1 band:
 * 0.2-0.4). The player side uses the game's real skillDamage pipeline
 * (skillDisplayStats: weapon, supports, gem levels, % stacks) so the band is
 * measured against actual player output, not a toy model. Deterministic.
 */
export function estimateMinionDpsShare(
  character: Character,
  members: PartyMember[],
  monster: Monster,
  herald: string[],
  unwavering: boolean,
  combat?: import('../types/game.ts').CombatState,
): number {
  const unwaveringFlag = unwavering === true
  let minionDps = 0
  for (const member of members) {
    if (member.role !== 'minion' || !member.alive) continue
    minionDps += estimateMinionDpsPerTick(member, monster, herald, unwaveringFlag)
  }
  const combatState = combat ?? emptyCombatForEstimates()
  let playerDps = 0
  for (const equipped of character.equippedSkills ?? []) {
    const skill = SKILLS[equipped.skillId]
    if (!skill) continue
    const display = skillDisplayStats(character, equipped, skill, combatState)
    const avg = (display.minDamage + display.maxDamage) / 2
    const band = rangeBandHitCount(skill, 4)
    const chance = hitChance(character.accuracy, monster.evasion, 0)
    playerDps += (avg * band * chance) / display.cooldownTicks
  }
  if (playerDps <= 0) return minionDps > 0 ? Infinity : 0
  return minionDps / playerDps
}

/** Minimal combat state for skillDisplayStats (no momentum/herald side effects). */
function emptyCombatForEstimates(): import('../types/game.ts').CombatState {
  return {
    monster: null,
    monsterLife: 1,
    lastDamageDealt: 0,
    lastDamageTaken: 0,
    isRespawning: false,
    respawnTicks: 0,
    events: [],
    ticksSinceDamageTaken: 99,
    playerEvasionStacks: 0,
    monsterEvasionStacks: 0,
    damageTakenByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
    deathSummary: null,
    momentum: { stacks: 0, decayTicks: 0, baseCap: 10, capBonus: 0 },
    herald: { active: [], tideRamp: 0, hitTargets: [] },
    marshal: { army: null, bulwarkFlat: 0, bulwarkTicksRemaining: 0 },
    delayedDamageQueue: [],
    ailments: {},
    virulent: { stacks: {}, septicemiaMultiplier: {}, calcifyAccumulator: {}, slow: {}, patientZeroTarget: null },
    monsterDebuffs: {},
    plaguewindCarryover: [],
    packDamageCarryover: 0,
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

/** Def ids that currently have a live summon instance. */
export function activeSummonDefIds(character: Character): string[] {
  return character.summons.filter(summon => summon.alive).map(summon => summon.minionDefId)
}

/** Total alive summons across all defs (army cap check). */
export function totalAliveSummons(character: Character): number {
  return character.summons.filter(summon => summon.alive).length
}

// ---------------------------------------------------------------------------
// M3: minion attack turns (minion spec §5)
// ---------------------------------------------------------------------------

export interface MinionHit {
  member: PartyMember
  damage: number
  crit: boolean
  damageType: DamageType
  ailments: AilmentInstance[]
  targetCount: number
}

export interface MinionAttackResult {
  combat: CombatState
  events: CombatEvent[]
  hits: MinionHit[]
}

let minionHitCounter = 0

function makeHitEvent(payload: {
  targetId: string
  damage: number
  damageType: DamageType
  crit: boolean
  sourceId: string
}): CombatEvent {
  return {
    id: `evt_minionhit_${Date.now()}_${minionHitCounter++}`,
    timestamp: Date.now(),
    type: 'hitLanded',
    source: 'minion',
    ...payload,
  }
}

/** Ticks between two attacks for the member's attack rate. */
export function minionAttackCooldownTicks(attackRate: number): number {
  return Math.max(1, Math.round(TICKS_PER_SECOND / Math.max(0.05, attackRate)))
}

/**
 * Set-wide Herald aura damage bonus for a minion hit (spec §7.1): Light adds
 * the same % the player gets, Tide consumes the shared ramp, Judgment adds its
 * low-life finisher. Storms stays player-cast; Gold is player-only loot.
 */
export function minionHeraldMultiplier(
  herald: string[],
  unwavering: boolean,
  tideRamp: number,
  targetHealthPercent: number,
): number {
  let multiplier = 1
  for (const aura of herald) {
    if (aura === 'light') multiplier += unwavering ? 0.15 : 0.1
    if (aura === 'tide') multiplier += tideRamp * (unwavering ? 0.45 : 0.3)
    if (aura === 'judgment' && targetHealthPercent <= 0.2) multiplier += unwavering ? 0.3 : 0.2
  }
  return multiplier
}

/**
 * Fire every alive minion whose attack cooldown elapsed. Each hit is a single
 * roll; the caller applies it front-to-back across the member's range band
 * (same distribution rule as player multi-hit skills) and copies ailments to
 * every band target. Minion kills grant no rewards — attribution is handled by
 * the caller setting combat.lastDamageSource (spec §5.4).
 *
 * Pure: returns updated combat (cooldown map) plus per-minion hit outcomes.
 */
export function processMinionHits(
  character: Character,
  combat: CombatState,
  monster: Monster,
): MinionAttackResult {
  const events: CombatEvent[] = []
  const hits: MinionHit[] = []
  const unwavering = character.special.unwaveringDeclaration === true
  const previousCooldowns = combat.minionAttackCooldowns ?? {}
  const nextCooldowns: Record<string, number> = {}

  for (const member of combat.party.members) {
    if (member.role !== 'minion' || !member.alive) continue

    const cooldownTicks = minionAttackCooldownTicks(member.attack.attackRate)
    const remaining = previousCooldowns[member.id] ?? 0
    if (remaining > 0) {
      nextCooldowns[member.id] = remaining - 1
      continue
    }
    nextCooldowns[member.id] = cooldownTicks

    // Hit chance against the front monster's evasion — the same formula the
    // player uses; minions just never build evasion streaks (stacks = 0).
    if (Math.random() > hitChance(member.accuracy, monster.evasion, 0)) {
      events.push({
        id: `evt_minionmiss_${Date.now()}_${minionHitCounter++}`,
        timestamp: Date.now(),
        type: 'hitAvoided',
        source: 'player',
        targetId: monster.id,
        reason: 'missed',
      })
      continue
    }

    // Base damage roll from the member's own flat damage (no player gear scaling).
    const flat = member.attack.flatDamage
    let damage = flat.min + Math.random() * (flat.max - flat.min)

    // 5% crit at the default multiplier (minions have no crit stats in v1).
    const crit = Math.random() < 0.05
    if (crit) damage *= 1.5

    // Party-set auras (Herald of Light / Tide / Judgment — spec §7.1).
    const targetHealthPercent = monster.maxLife > 0 ? combat.monsterLife / monster.maxLife : 1
    damage *= minionHeraldMultiplier(member.activeEffects.herald, unwavering, combat.herald.tideRamp, targetHealthPercent)

    // Herald of Judgment execution mirrors the player rule.
    if (member.activeEffects.herald.includes('judgment') && targetHealthPercent <= 0.1) {
      damage = Math.max(damage, combat.monsterLife)
    }

    const finalDamage = Math.max(1, Math.floor(damage))

    // Ailments come from the minion's own skill data (e.g. wretch_bite poison).
    const ailments: AilmentInstance[] = []
    const skill = SKILLS[member.attack.skillId]
    if (skill?.appliesAilment) {
      const spec = skill.appliesAilment
      ailments.push({
        id: `ail_minion_${member.id}_${Date.now()}_${minionHitCounter++}`,
        type: spec.type,
        source: 'skill',
        damagePerTick: Math.max(1, Math.floor((finalDamage * (spec.percentOfHit ?? 0.2)) / TICKS_PER_SECOND)),
        remainingTicks: Math.max(1, Math.round(spec.durationSeconds * TICKS_PER_SECOND)),
        stacks: 1,
        sourceSkillId: skill.id,
      })
    }

    events.push(makeHitEvent({
      targetId: monster.id,
      damage: finalDamage,
      damageType: member.attack.flatDamage.type,
      crit,
      sourceId: member.id,
    }))

    hits.push({
      member,
      damage: finalDamage,
      crit,
      damageType: member.attack.flatDamage.type,
      ailments,
      // Band targeting: minion skills hit the pack front-to-back like player skills.
      targetCount: skill ? rangeBandHitCount(skill, combat.currentPack.length || 1) : 1,
    })
  }

  return { combat: { ...combat, minionAttackCooldowns: nextCooldowns }, events, hits }
}
