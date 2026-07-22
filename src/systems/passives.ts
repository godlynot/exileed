import type { Character, PassiveNode, PassiveTree, PassiveSpecialEffects, StatKey, StatMod } from '../types/game.ts'
import { ASCENDANCIES } from '../data/ascendancies.ts'

// --- adjacency ----------------------------------------------------------------

const adjacencyCache = new WeakMap<PassiveTree, Map<string, string[]>>()

export function getAdjacency(tree: PassiveTree): Map<string, string[]> {
  let adj = adjacencyCache.get(tree)
  if (!adj) {
    adj = new Map<string, string[]>()
    for (const node of tree.nodes) {
      adj.set(node.id, [])
    }
    for (const [a, b] of tree.edges) {
      adj.get(a)?.push(b)
      adj.get(b)?.push(a)
    }
    adjacencyCache.set(tree, adj)
  }
  return adj
}

export function getNode(tree: PassiveTree, id: string): PassiveNode | undefined {
  return tree.nodes.find(n => n.id === id)
}

// --- allocation ---------------------------------------------------------------

export function canAllocateNode(character: Character, tree: PassiveTree, nodeId: string): boolean {
  const node = getNode(tree, nodeId)
  if (!node) return false
  if (character.allocatedNodes.includes(nodeId)) return false
  if (character.passivePoints <= 0) return false
  if (node.type === 'root') return false

  const allocatedSet = new Set(character.allocatedNodes)
  const adj = getAdjacency(tree)
  const neighbours = adj.get(nodeId) ?? []
  return neighbours.some(id => allocatedSet.has(id))
}

export function allocateNode(character: Character, tree: PassiveTree, nodeId: string): Character {
  if (!canAllocateNode(character, tree, nodeId)) return character
  return { ...character, allocatedNodes: [...character.allocatedNodes, nodeId], passivePoints: character.passivePoints - 1 }
}

export function refundNode(character: Character, tree: PassiveTree, nodeId: string): Character {
  if (!character.allocatedNodes.includes(nodeId)) return character

  const rootId = `root_${character.classId}`
  if (nodeId === rootId) return character

  const remaining = character.allocatedNodes.filter(id => id !== nodeId)
  if (!remaining.includes(rootId)) return character

  const adj = getAdjacency(tree)
  const set = new Set(remaining)
  const visited = new Set<string>([rootId])
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbour of adj.get(current) ?? []) {
      if (set.has(neighbour) && !visited.has(neighbour)) {
        visited.add(neighbour)
        queue.push(neighbour)
      }
    }
  }

  if (visited.size !== set.size) return character

  return { ...character, allocatedNodes: remaining, passivePoints: character.passivePoints + 1 }
}

// --- aggregation --------------------------------------------------------------

export interface AggregatedPassives {
  flat: Partial<Record<StatKey, number>>
  increased: Partial<Record<StatKey, number>>
  more: Partial<Record<StatKey, number>>
  special: PassiveSpecialEffects
}

export function aggregatePassives(allocatedIds: string[], tree: PassiveTree): StatMod[] {
  const mods: StatMod[] = []
  for (const id of allocatedIds) {
    const node = getNode(tree, id)
    if (!node) continue
    for (const mod of node.stats) {
      mods.push({ ...mod })
    }
  }
  return mods
}

export function aggregatePassivesDetailed(allocatedIds: string[], tree: PassiveTree): AggregatedPassives {
  const flat: Partial<Record<StatKey, number>> = {}
  const increased: Partial<Record<StatKey, number>> = {}
  const more: Partial<Record<StatKey, number>> = {}
  const special: PassiveSpecialEffects = {}

  for (const id of allocatedIds) {
    const node = getNode(tree, id)
    if (!node) continue

    for (const mod of node.stats) {
      if (mod.mode === 'flat') flat[mod.stat] = (flat[mod.stat] ?? 0) + mod.value
      else if (mod.mode === 'increased') increased[mod.stat] = (increased[mod.stat] ?? 0) + mod.value
      else if (mod.mode === 'more') more[mod.stat] = (more[mod.stat] ?? 0) + mod.value
      else if (mod.mode === 'special') {
        switch (mod.stat) {
          case 'special:juggernauts_stance':
            special.juggernautStance = true
            special.maxLifeMultiplier = (special.maxLifeMultiplier ?? 1) * 1.2
            break
          case 'special:perfect_aim':
            special.perfectAim = true
            special.alwaysHit = true
            special.cannotCrit = true
            break
          case 'special:elemental_dominion':
            special.elementalDominion = true
            special.physToLightning = (special.physToLightning ?? 0) + 50
            special.increasedLightningDamageTaken = (special.increasedLightningDamageTaken ?? 0) + 25
            break
          case 'special:iron_reservation':
            special.ironReservation = true
            special.maxLifeMultiplier = (special.maxLifeMultiplier ?? 1) * 1.5
            special.maxEnergyShieldMultiplier = (special.maxEnergyShieldMultiplier ?? 1) * 1.5
            special.noLifeRegen = true
            special.noEnergyShieldRecharge = true
            break
          case 'special:zealots_creed':
            special.zealotsCreed = true
            special.maxFireResist = 0.85
            special.maxColdResist = 0.85
            special.maxLightningResist = 0.85
            special.maxLifeMultiplier = (special.maxLifeMultiplier ?? 1) * 0.5
            special.maxEnergyShieldMultiplier = (special.maxEnergyShieldMultiplier ?? 1) * 0.5
            break
          case 'special:vengeful_resolve':
            special.vengefulResolve = true
            special.moreDamageMultiplier = (special.moreDamageMultiplier ?? 1) * 1.35
            special.increasedDamageTaken = (special.increasedDamageTaken ?? 0) + 25
            break
        }
      }
    }
  }

  return { flat, increased, more, special }
}

// --- application --------------------------------------------------------------

function getFlat(flat: Partial<Record<StatKey, number>>, key: StatKey): number {
  return flat[key] ?? 0
}

function getInc(inc: Partial<Record<StatKey, number>>, key: StatKey): number {
  return 1 + (inc[key] ?? 0) / 100
}

export function applyPassiveStats(character: Character, tree: PassiveTree): Character {
  const { flat, increased, special } = aggregatePassivesDetailed(character.allocatedNodes, tree)

  const attributes = {
    strength: character.attributes.strength + getFlat(flat, 'flat_strength'),
    dexterity: character.attributes.dexterity + getFlat(flat, 'flat_dexterity'),
    intelligence: character.attributes.intelligence + getFlat(flat, 'flat_intelligence'),
  }

  const juggernautArmour = special.juggernautStance ? 1.3 : 1
  const juggernautLife = special.juggernautStance ? 1.2 : 1
  const juggernautAttackRate = special.juggernautStance ? 0.75 : 1

  const lifeMult = getInc(increased, 'inc_life_percent') *
    (special.maxLifeMultiplier ?? 1) *
    juggernautLife

  const maxLife = Math.floor((character.maxLife + getFlat(flat, 'flat_life')) * lifeMult)

  const esMult = getInc(increased, 'inc_es_percent') *
    (special.maxEnergyShieldMultiplier ?? 1)

  const maxEnergyShield = Math.floor((character.maxEnergyShield + getFlat(flat, 'flat_energy_shield')) * esMult)

  const armour = Math.floor((character.armour + getFlat(flat, 'flat_armour')) * getInc(increased, 'inc_armour_percent') * juggernautArmour)
  const evasion = Math.floor((character.evasion + getFlat(flat, 'flat_evasion')) * getInc(increased, 'inc_evasion_percent'))
  const accuracy = Math.floor((character.accuracy + getFlat(flat, 'flat_accuracy')) * getInc(increased, 'inc_accuracy_percent'))
  const attackRate = character.attackRate * getInc(increased, 'inc_attack_speed_percent') * juggernautAttackRate

  const physMore = special.moreDamageMultiplier ?? 1
  const physicalDamageMultiplier = getInc(increased, 'inc_phys_damage_percent') * physMore
  const basePhysicalDamageMin = Math.floor((character.basePhysicalDamageMin + getFlat(flat, 'flat_phys_damage')) * physicalDamageMultiplier)
  const basePhysicalDamageMax = Math.floor((character.basePhysicalDamageMax + getFlat(flat, 'flat_phys_damage')) * physicalDamageMultiplier)

  let criticalChance = character.criticalChance + (increased['inc_crit_chance_percent'] ?? 0) / 100
  let criticalMultiplier = character.criticalMultiplier + (increased['inc_crit_multi_percent'] ?? 0) / 100

  if (special.cannotCrit) {
    criticalChance = 0
  }

  const maxFireResist = special.maxFireResist ?? 0.75
  const maxColdResist = special.maxColdResist ?? 0.75
  const maxLightningResist = special.maxLightningResist ?? 0.75

  const resistances = {
    fire: character.resistances.fire + (getFlat(flat, 'flat_fire_res') + getFlat(flat, 'all_res_percent')) / 100,
    cold: character.resistances.cold + (getFlat(flat, 'flat_cold_res') + getFlat(flat, 'all_res_percent')) / 100,
    lightning: character.resistances.lightning + (getFlat(flat, 'flat_lightning_res') + getFlat(flat, 'all_res_percent')) / 100,
    chaos: character.resistances.chaos + getFlat(flat, 'flat_chaos_res') / 100,
  }

  return {
    ...character,
    attributes,
    maxLife: Math.max(1, maxLife),
    maxEnergyShield: Math.max(0, maxEnergyShield),
    armour: Math.max(0, armour),
    evasion: Math.max(0, evasion),
    accuracy: Math.max(0, accuracy),
    attackRate: Math.max(0.1, attackRate),
    basePhysicalDamageMin: Math.max(0, basePhysicalDamageMin),
    basePhysicalDamageMax: Math.max(0, basePhysicalDamageMax),
    criticalChance: Math.min(1, Math.max(0, criticalChance)),
    criticalMultiplier: Math.max(1, criticalMultiplier),
    resistances: {
      fire: Math.min(maxFireResist, Math.max(-0.75, resistances.fire)),
      cold: Math.min(maxColdResist, Math.max(-0.75, resistances.cold)),
      lightning: Math.min(maxLightningResist, Math.max(-0.75, resistances.lightning)),
      chaos: Math.min(0.75, Math.max(-0.75, resistances.chaos)),
    },
    life: Math.min(character.life, maxLife),
    energyShield: Math.min(character.energyShield, maxEnergyShield),
    special,
  }
}

// --- ascendancy (kept for compatibility) --------------------------------------

export function applyAscendancyStats(character: Character): Character {
  if (!character.ascendancyId) return character

  const ascendancy = ASCENDANCIES[character.ascendancyId]
  if (!ascendancy) return character

  const flat: Partial<Record<StatKey, number>> = {}
  const increased: Partial<Record<StatKey, number>> = {}
  const more: Partial<Record<StatKey, number>> = {}
  const special: PassiveSpecialEffects = { ...character.special }

  for (const nodeId of character.allocatedAscendancyNodes) {
    const node = ascendancy.nodes.find(n => n.id === nodeId)
    if (!node) continue
    for (const mod of node.stats ?? []) {
      if (mod.mode === 'flat') flat[mod.stat] = (flat[mod.stat] ?? 0) + mod.value
      else if (mod.mode === 'increased') increased[mod.stat] = (increased[mod.stat] ?? 0) + mod.value
      else if (mod.mode === 'more') more[mod.stat] = (more[mod.stat] ?? 0) + mod.value
      else if (mod.mode === 'special') {
        switch (mod.stat) {
          case 'special:measured_strikes': special.measuredStrikes = true; break
          case 'special:crescendo': special.crescendo = true; break
          case 'special:foreseen_doom': special.foreseenDoom = true; break
          case 'special:inevitability': special.inevitability = true; break
          case 'special:perfect_calculation': special.perfectCalculation = true; break
          case 'special:proclaim_herald': special.proclaimHerald = (character.keystoneChoices[nodeId] ?? 'light') as PassiveSpecialEffects['proclaimHerald']; break
          case 'special:unwavering_declaration': special.unwaveringDeclaration = true; break
          case 'special:twin_heralds': special.twinHeralds = true; special.proclaimHerald = null; break
          case 'special:resonant_truth': special.resonantTruth = true; break
          case 'special:foretold_end': special.foretoldEnd = true; break
          case 'special:plaguewind': special.plaguewind = true; break
          case 'special:pandemic': special.pandemic = true; break
          case 'special:plague_chorus': special.plagueChorus = true; break
          case 'special:patient_zero': special.patientZero = true; break
          case 'special:malignant': special.malignant = true; break
          case 'special:septicemia': special.septicemia = true; break
          case 'special:cardiac_arrest': special.cardiacArrest = true; break
          case 'special:asphyxiation': special.asphyxiation = true; break
          case 'special:cirrhosis': special.cirrhosis = true; break
          case 'special:calcify': special.calcify = true; break
          case 'special:relentless_advance': special.relentlessAdvance = true; break
          case 'special:overrun': special.overrun = true; break
          case 'special:breakneck': special.breakneck = true; break
          case 'special:war_machine': special.warMachine = true; break
          case 'special:blitz': special.blitz = true; break
          case 'special:rallying_presence': special.rallyingPresence = true; break
          case 'special:hold_the_line': special.holdTheLine = true; break
          case 'special:bannermans_resolve': special.bannermansResolve = (character.keystoneChoices[nodeId] ?? 'iron_legion') as PassiveSpecialEffects['bannermansResolve']; break
          case 'special:bulwarks_wrath': special.bulwarksWrath = true; break
          case 'special:war_of_attrition': special.warOfAttrition = true; break
        }
      }
    }
  }

  const attributes = {
    strength: character.attributes.strength + (flat['flat_strength'] ?? 0),
    dexterity: character.attributes.dexterity + (flat['flat_dexterity'] ?? 0),
    intelligence: character.attributes.intelligence + (flat['flat_intelligence'] ?? 0),
  }

  const lifeMult = (1 + (increased['inc_life_percent'] ?? 0) / 100)
  const esMult = (1 + (increased['inc_es_percent'] ?? 0) / 100)

  // Marshal army choice: apply party-set stat bonuses
  if (special.bannermansResolve) {
    const army = special.bannermansResolve
    if (army === 'iron_legion') {
      flat['flat_armour'] = (flat['flat_armour'] ?? 0) + character.level * 2
      character.armour += Math.max(0, character.level * 2)
    } else if (army === 'skirmishers') {
      increased['inc_attack_speed_percent'] = (increased['inc_attack_speed_percent'] ?? 0) + 10
      increased['inc_evasion_percent'] = (increased['inc_evasion_percent'] ?? 0) + 10
    } else if (army === 'zealots') {
      increased['inc_phys_damage_percent'] = (increased['inc_phys_damage_percent'] ?? 0) + 15
    } else if (army === 'wardens') {
      flat['flat_life'] = (flat['flat_life'] ?? 0) + character.level * 2
    } else if (army === 'reapers') {
      // Reapers apply a minor DOT to enemies handled in combat
    }
  }

  return {
    ...character,
    attributes,
    maxLife: Math.max(1, character.maxLife + (flat['flat_life'] ?? 0) * lifeMult),
    maxEnergyShield: Math.max(0, character.maxEnergyShield + (flat['flat_energy_shield'] ?? 0) * esMult),
    accuracy: Math.max(0, character.accuracy + (flat['flat_accuracy'] ?? 0) * (1 + (increased['inc_accuracy_percent'] ?? 0) / 100)),
    evasion: Math.max(0, character.evasion + (flat['flat_evasion'] ?? 0) * (1 + (increased['inc_evasion_percent'] ?? 0) / 100)),
    armour: Math.max(0, character.armour + (flat['flat_armour'] ?? 0) * (1 + (increased['inc_armour_percent'] ?? 0) / 100)),
    attackRate: character.attackRate * (1 + (increased['inc_attack_speed_percent'] ?? 0) / 100),
    basePhysicalDamageMin: Math.floor(character.basePhysicalDamageMin * (1 + (increased['inc_phys_damage_percent'] ?? 0) / 100) * (1 + (more['inc_phys_damage_percent'] ?? 0) / 100)),
    basePhysicalDamageMax: Math.floor(character.basePhysicalDamageMax * (1 + (increased['inc_phys_damage_percent'] ?? 0) / 100) * (1 + (more['inc_phys_damage_percent'] ?? 0) / 100)),
    criticalChance: Math.min(1, character.criticalChance + ((increased['inc_crit_chance_percent'] ?? 0) / 100)),
    criticalMultiplier: character.criticalMultiplier + ((increased['inc_crit_multi_percent'] ?? 0) / 100),
    special,
  }
}
