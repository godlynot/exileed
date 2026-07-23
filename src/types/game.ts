import type { Equipment, InventoryState, Item, ItemRarity } from './item.ts'

export interface Attributes {
  strength: number
  dexterity: number
  intelligence: number
}

export interface Resistances {
  fire: number
  cold: number
  lightning: number
  chaos: number
}

export interface CharacterClass {
  id: string
  name: string
  description: string
  baseAttributes: Attributes
  baseLife: number
  baseEnergyShield: number
  baseAccuracy: number
  baseEvasion: number
}

export interface PassiveSpecialEffects {
  // Hit / crit
  alwaysHit?: boolean
  cannotCrit?: boolean

  // Damage conversion
  physToLightning?: number

  // Damage taken modifiers
  increasedDamageTaken?: number
  increasedLightningDamageTaken?: number

  // Pool multipliers
  maxLifeMultiplier?: number
  maxEnergyShieldMultiplier?: number

  // Recovery disables
  noEnergyShieldRecharge?: boolean
  noLifeRegen?: boolean

  // Damage dealt multiplier (more)
  moreDamageMultiplier?: number

  // Resistance caps
  maxFireResist?: number
  maxColdResist?: number
  maxLightningResist?: number

  // Active keystone flags (so multipliers can be composed without ambiguity)
  juggernautStance?: boolean
  perfectAim?: boolean
  elementalDominion?: boolean
  ironReservation?: boolean
  zealotsCreed?: boolean
  vengefulResolve?: boolean

  // Momentum access (Warlord ascendancy only)
  momentum?: boolean

  // M4.5 ascendancy / skill hooks
  measuredStrikes?: boolean
  crescendo?: boolean
  foreseenDoom?: boolean
  inevitability?: boolean
  perfectCalculation?: boolean
  proclaimHerald?: 'light' | 'gold' | 'tide' | 'silence' | 'storms' | 'judgment' | null
  unwaveringDeclaration?: boolean
  twinHeralds?: boolean
  resonantTruth?: boolean
  foretoldEnd?: boolean
  plaguewind?: boolean
  pandemic?: boolean
  plagueChorus?: boolean
  patientZero?: boolean
  malignant?: boolean
  septicemia?: boolean
  cardiacArrest?: boolean
  asphyxiation?: boolean
  cirrhosis?: boolean
  calcify?: boolean
  relentlessAdvance?: boolean
  overrun?: boolean
  breakneck?: boolean
  warMachine?: boolean
  blitz?: boolean
  rallyingPresence?: boolean
  holdTheLine?: boolean
  bannermansResolve?: 'iron_legion' | 'skirmishers' | 'zealots' | 'wardens' | 'reapers' | null
  bulwarksWrath?: boolean
  warOfAttrition?: boolean
}

export interface Character {
  id: string
  name: string
  classId: string
  level: number
  experience: number
  experienceToNext: number
  life: number
  maxLife: number
  energyShield: number
  maxEnergyShield: number
  attributes: Attributes
  resistances: Resistances
  accuracy: number
  evasion: number
  armour: number
  // Offense (legacy auto-attack fields; kept for compatibility)
  attackRate: number // attacks per second
  basePhysicalDamageMin: number
  basePhysicalDamageMax: number
  criticalChance: number
  criticalMultiplier: number
  // Aggregated damage modifiers (flat/increased/more)
  increasedPhysicalDamage: number // additive % (e.g. 0.15 = +15%)
  morePhysicalDamage: number      // multiplicative (e.g. 1.3 = 30% more)
  increasedSpellDamage: number
  moreSpellDamage: number
  increasedAttackSpeed: number
  moreAttackSpeed: number
  increasedAccuracy: number
  // Recovery
  lifeRegen: number // life per tick
  esRecharge: number // energy shield per tick
  // Keystone / passive special state computed during recalculation
  special: PassiveSpecialEffects
  // State
  isAlive: boolean
  respawnTimer: number // ticks remaining
  allocatedNodes: string[]
  passivePoints: number
  // Ascendancy
  ascendancyId: string | null
  allocatedAscendancyNodes: string[]
  trial1Completed: boolean
  trial2Completed: boolean
  trial3Completed: boolean
  trial4Completed: boolean
  // Skills / supports (save data)
  equippedSkills: EquippedSkill[]
  ownedGems: GemProgress[]
  // Support slot count grows with campaign milestones (2 -> 3 at Act 3 -> 4 at Act 6 -> 5 at Act 9)
  supportSlotCount: number
  // Ascendancy choice-keystone selections (node id -> choice id)
  keystoneChoices: Record<string, string>
  // Ascendancy points earned from trials (8 total)
  ascendancyPoints: number
  // Dev/debug overrides that persist across tick recalculation
  devOverrides?: Partial<Character>
}

export interface MonsterDamageComponent {
  type: DamageType
  min: number
  max: number
}

export interface Monster {
  id: string
  name: string
  level: number
  life: number
  maxLife: number
  damage: MonsterDamageComponent[]
  attackRate: number
  accuracy: number
  evasion: number
  armour?: number
  experienceReward: number
  goldReward: number
  isBoss: boolean
  isElite?: boolean
  // Optional aura or mechanic that combat.ts can read generically
  aura?: {
    nearbyAlliesDamagePercent?: number
  }
  // Optional phase thresholds for bosses
  phases?: {
    healthPercent: number
    statOverrides: Partial<Monster>
    addComponents?: MonsterDamageComponent[]
    attackRateMultiplier?: number
  }[]
}

export interface Zone {
  id: string
  name: string
  act: number
  level: number
  // Legacy single-monster fallback; prefer monsterIds pool
  monsterId?: string
  monsterIds: string[]
  packSize: number
  eliteChance: number
  killProgress: number // 0-100%
  killsRequired: number
  unlocked: boolean
}

export type DamageType = 'physical' | 'lightning' | 'fire' | 'cold' | 'chaos'

export interface AilmentInstance {
  id: string
  type: 'poison' | 'bleed' | 'burn'
  source: 'skill' | 'support' | 'aura' | 'keystone'
  // Damage dealt each tick (already scaled by per-stack magnitude)
  damagePerTick: number
  remainingTicks: number
  stacks: number
  sourceSkillId?: string
  // Virulent Cirrhosis: this ailment cannot be cleansed and reverses healing
  cirrhosis?: boolean
}

export interface MomentumState {
  stacks: number
  // Ticks remaining until one stack decays. Base decay after 15 ticks (3s).
  decayTicks: number
  baseCap: number
  capBonus: number // from Breakneck etc.
}

export interface HeraldState {
  active: ('light' | 'gold' | 'tide' | 'silence' | 'storms' | 'judgment')[]
  // Tide-specific ramp multiplier (0..1)
  tideRamp: number
  // Monster ids already hit for Foretold End
  hitTargets: string[]
}

export interface MarshalState {
  army: 'iron_legion' | 'skirmishers' | 'zealots' | 'wardens' | 'reapers' | null
  // Rolling flat damage bonus from Bulwark's Wrath
  bulwarkFlat: number
  bulwarkTicksRemaining: number
}

export interface VirulentState {
  // Per-monster ailment stacks
  stacks: Record<string, number>
  // Septicemia compounding multiplier for each target
  septicemiaMultiplier: Record<string, number>
  // Calcify DOT accumulator per target
  calcifyAccumulator: Record<string, number>
  // Asphyxiation slow multiplier per target (0..1, reduces monster damage/attack speed)
  slow: Record<string, number>
  // Patient Zero: first afflicted monster id in current pack
  patientZeroTarget: string | null
}

export type CombatEvent =
  | { id: string; timestamp: number; type: 'monsterSpawned'; monsterId: string; monsterType: string; level: number }
  | { id: string; timestamp: number; type: 'hitLanded'; source: 'player' | 'monster'; targetId: string; damage: number; damageType: DamageType; crit: boolean }
  | { id: string; timestamp: number; type: 'hitAvoided'; source: 'player' | 'monster'; targetId: string; reason: 'evaded' | 'missed' }
  | { id: string; timestamp: number; type: 'monsterDied'; monsterId: string; monsterType: string }
  | { id: string; timestamp: number; type: 'playerDied' }
  | { id: string; timestamp: number; type: 'itemDropped'; itemId: string; rarity: ItemRarity }
  | { id: string; timestamp: number; type: 'xpGained'; amount: number }
  | { id: string; timestamp: number; type: 'levelUp'; newLevel: number }
  | { id: string; timestamp: number; type: 'zoneProgress'; current: number; total: number }
  | { id: string; timestamp: number; type: 'bossSpawned'; bossId: string }
  | { id: string; timestamp: number; type: 'bossDefeated'; bossId: string }
  | { id: string; timestamp: number; type: 'ailmentApplied'; targetId: string; ailmentType: AilmentInstance['type'] }
  | { id: string; timestamp: number; type: 'ailmentExpired'; targetId: string; ailmentType: AilmentInstance['type'] }
  | { id: string; timestamp: number; type: 'dotTick'; targetId: string; source: AilmentInstance['source']; damage: number; ailmentType: AilmentInstance['type'] }
  | { id: string; timestamp: number; type: 'momentumChanged'; stacks: number }
  | { id: string; timestamp: number; type: 'auraApplied'; auraId: string }
  | { id: string; timestamp: number; type: 'delayedDamageTick'; targetId: string; damage: number }
  | { id: string; timestamp: number; type: 'gemLeveledUp'; gemId: string; gemName: string; newLevel: number }

export interface CombatState {
  monster: Monster | null
  monsterLife: number
  lastDamageDealt: number
  lastDamageTaken: number
  combatLog: string[]
  isRespawning: boolean
  respawnTicks: number
  events: CombatEvent[]
  ticksSinceDamageTaken: number // tracks ES recharge delay
  // Evasion streak stacks: each consecutive dodge builds a stack that makes the next attack more likely to hit
  playerEvasionStacks: number
  monsterEvasionStacks: number
  // M4.5 state
  momentum: MomentumState
  herald: HeraldState
  marshal: MarshalState
  // Fateseer delayed damage queue (amounts to apply on future ticks)
  delayedDamageQueue: number[]
  // Active ailments keyed by monster id
  ailments: Record<string, AilmentInstance[]>
  virulent: VirulentState
  // M4.5 debuff state for the current single-monster encounter
  monsterDebuffs: {
    blind?: boolean
  }
  // M4.5 Plaguebringer Plaguewind carryover: ailments spread from the last killed monster
  plaguewindCarryover: AilmentInstance[]
}

export type NodeType = 'small' | 'notable' | 'keystone' | 'root'

export type StatMode = 'flat' | 'increased' | 'more' | 'special'

export type StatKey =
  // Attributes
  | 'flat_strength' | 'flat_dexterity' | 'flat_intelligence'
  // Flat defensive
  | 'flat_life' | 'flat_energy_shield' | 'flat_armour' | 'flat_evasion' | 'flat_accuracy'
  // Flat offensive
  | 'flat_phys_damage' | 'flat_fire_damage' | 'flat_cold_damage' | 'flat_lightning_damage'
  // Increased offensive
  | 'inc_phys_damage_percent' | 'inc_spell_damage_percent' | 'inc_ele_damage_percent'
  | 'inc_attack_speed_percent' | 'inc_crit_chance_percent' | 'inc_crit_multi_percent'
  | 'inc_accuracy_percent'
  // Increased defensive
  | 'inc_life_percent' | 'inc_es_percent' | 'inc_armour_percent' | 'inc_evasion_percent'
  | 'es_recharge_rate_percent' | 'phys_reduction_percent'
  // Resistances
  | 'flat_fire_res' | 'flat_cold_res' | 'flat_lightning_res' | 'flat_chaos_res'
  | 'all_res_percent'
  // Keystone hooks
  | 'special:juggernauts_stance' | 'special:perfect_aim' | 'special:elemental_dominion'
  | 'special:iron_reservation' | 'special:zealots_creed' | 'special:vengeful_resolve'
  // M4.5 ascendancy keystones
  | 'special:measured_strikes' | 'special:crescendo' | 'special:foreseen_doom' | 'special:inevitability' | 'special:perfect_calculation'
  | 'special:proclaim_herald' | 'special:unwavering_declaration' | 'special:twin_heralds' | 'special:resonant_truth' | 'special:foretold_end'
  | 'special:plaguewind' | 'special:pandemic' | 'special:plague_chorus' | 'special:patient_zero' | 'special:malignant'
  | 'special:septicemia' | 'special:cardiac_arrest' | 'special:asphyxiation' | 'special:cirrhosis' | 'special:calcify'
  | 'special:relentless_advance' | 'special:overrun' | 'special:breakneck' | 'special:war_machine' | 'special:blitz'
  | 'special:rallying_presence' | 'special:hold_the_line' | 'special:bannermans_resolve' | 'special:bulwarks_wrath' | 'special:war_of_attrition'
  // Warlord core mechanic
  | 'special:momentum'

export const STAT_KEYS: StatKey[] = [
  'flat_strength', 'flat_dexterity', 'flat_intelligence',
  'flat_life', 'flat_energy_shield', 'flat_armour', 'flat_evasion', 'flat_accuracy',
  'flat_phys_damage', 'flat_fire_damage', 'flat_cold_damage', 'flat_lightning_damage',
  'inc_phys_damage_percent', 'inc_spell_damage_percent', 'inc_ele_damage_percent',
  'inc_attack_speed_percent', 'inc_crit_chance_percent', 'inc_crit_multi_percent',
  'inc_accuracy_percent',
  'inc_life_percent', 'inc_es_percent', 'inc_armour_percent', 'inc_evasion_percent',
  'es_recharge_rate_percent', 'phys_reduction_percent',
  'flat_fire_res', 'flat_cold_res', 'flat_lightning_res', 'flat_chaos_res',
  'all_res_percent',
  'special:juggernauts_stance', 'special:perfect_aim', 'special:elemental_dominion',
  'special:iron_reservation', 'special:zealots_creed', 'special:vengeful_resolve',
  // M4.5 ascendancy keystones
  'special:measured_strikes', 'special:crescendo', 'special:foreseen_doom', 'special:inevitability', 'special:perfect_calculation',
  'special:proclaim_herald', 'special:unwavering_declaration', 'special:twin_heralds', 'special:resonant_truth', 'special:foretold_end',
  'special:plaguewind', 'special:pandemic', 'special:plague_chorus', 'special:patient_zero', 'special:malignant',
  'special:septicemia', 'special:cardiac_arrest', 'special:asphyxiation', 'special:cirrhosis', 'special:calcify',
  'special:relentless_advance', 'special:overrun', 'special:breakneck', 'special:war_machine', 'special:blitz',
  'special:rallying_presence', 'special:hold_the_line', 'special:bannermans_resolve', 'special:bulwarks_wrath', 'special:war_of_attrition',
  // Warlord core mechanic
  'special:momentum',
]

export interface StatMod {
  stat: StatKey
  mode: StatMode
  value: number
}

export type ClassId =
  | 'brute'
  | 'stalker'
  | 'acolyte'
  | 'oracle'
  | 'warlord'
  | 'plaguebringer'

export interface AscendancyChoice {
  id: string
  name: string
  description: string
}

export interface AscendancyNode {
  id: string
  name: string
  description: string
  // Visual position within the ascendancy tree (0-300 SVG space)
  x: number
  y: number
  type: 'small' | 'keystone'
  // Prerequisite node ids that must be allocated before this one
  requires?: string[]
  // If set, allocating this node opens a picker for one of these choices
  choices?: AscendancyChoice[]
  // For choice keystones that allow selecting multiple options (e.g. Twin Heralds)
  maxChoices?: number
  // Stat mods for small nodes and non-choice keystones
  stats?: StatMod[]
  // Node ids that cannot coexist with this one
  mutuallyExclusiveWith?: string[]
  // If true, this node is auto-allocated when the ascendancy is chosen and costs no points
  free?: boolean
}

export interface Ascendancy {
  id: string
  name: string
  classId: ClassId
  description: string
  nodes: AscendancyNode[]
}

// ---------------------------------------------------------------------------
// SKILL / SUPPORT SYSTEM
// ---------------------------------------------------------------------------
export type SkillTag =
  | 'attack'
  | 'spell'
  | 'physical'
  | 'chaos'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'dot'
  | 'aoe'
  | 'projectile'
  | 'melee'

export interface AilmentSpec {
  type: 'poison' | 'bleed' | 'burn'
  damagePerSecond: number
  durationSeconds: number
  percentOfHit?: number
}

export interface Skill {
  id: string
  name: string
  description: string
  tags: SkillTag[]
  baseDamageMin: number
  baseDamageMax: number
  damageType: DamageType
  cooldownTicks: number
  damageEffectiveness: number
  targeting: 'single' | 'pack'
  appliesAilment?: AilmentSpec
}

export interface Support {
  id: string
  name: string
  description: string
  allowedTags: SkillTag[]
  modifiers: StatMod[]
  special?: string
}

export interface EquippedSkill {
  skillId: string
  supportIds: string[]
  cooldownRemaining: number
  hitCounter: number
}

export interface GemProgress {
  id: string
  level: number
  xp: number
}

export interface PassiveNode {
  id: string
  type: NodeType
  name: string
  classRoot?: ClassId
  x: number
  y: number
  stats: StatMod[]
  description?: string
}

export interface PassiveTree {
  nodes: PassiveNode[]
  edges: [string, string][]
}

export type GamePhase = 'class-select' | 'playing' | 'ascendancy-select'

export interface Trial {
  id: string
  name: string
  requiredLevel: number
  monsterId: string
  rewardAscendancyPoints: number
}

export interface GameState {
  character: Character
  zones: Zone[]
  activeZoneId: string
  inventory: InventoryState
  equipment: Equipment
  currencies: Record<string, number>
  combat: CombatState
  lastSaveTime: number
  saveVersion: number
  passiveTree: PassiveTree
  gamePhase: GamePhase
  activeTrial: Trial | null
  // Monotonic tick counter for gameplay timers (advances every simulateTick)
  tickCounter: number
}

export interface DroppedItem {
  item: Item
  currency: { type: string; amount: number }
}
