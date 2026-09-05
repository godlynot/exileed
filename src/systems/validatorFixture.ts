/**
 * Shared geared reference fixtures (minion spec §8.3).
 *
 * Extracted from scripts/validateBalance.ts so the balance validator and unit
 * tests measure against the identical player model: a real level-`level`
 * character built through the game's actual systems (equipment, passives,
 * ascendancy) — no dev overrides, no hand-tuned stats.
 */
import { CLASSES, CLASS_ROOT_MAP } from '../data/classes.ts'
import { MINIONS } from '../data/minions.ts'
import { PASSIVE_TREE } from '../data/passiveTree.ts'
import type { Character, ClassId, PartyMember } from '../types/game.ts'
import type { Equipment, ItemRarity } from '../types/item.ts'
import { createItem, recalculateCharacterFromEquipment } from './items.ts'
import { allocateNode, applyAscendancyStats, applyPassiveStats, getAdjacency, getNode } from './passives.ts'
import { resolveMinionMember } from './minions.ts'

const SLOT_BASES: Record<keyof Equipment, string> = {
  weapon: 'rusted_axe',
  offhand: 'worn_shield',
  helmet: 'tattered_hood',
  body: 'battered_chest',
  gloves: 'fingerless_gloves',
  boots: 'worn_boots',
  belt: 'rope_belt',
  amulet: 'seashell_amulet',
  ring1: 'iron_ring',
  ring2: 'iron_ring',
}

export function buildEquipment(level: number, rarity: ItemRarity = 'rare'): Equipment {
  // Gear rarity gives extra mods; item level controls tier magnitude. The main
  // campaign table uses rare gear, while the validator's sensitivity report
  // compares it against normal and magic gear without changing the model.
  const equipment: Equipment = {
    weapon: null,
    offhand: null,
    helmet: null,
    body: null,
    gloves: null,
    boots: null,
    belt: null,
    amulet: null,
    ring1: null,
    ring2: null,
  }
  for (const slot of Object.keys(equipment) as (keyof Equipment)[]) {
    const baseId = SLOT_BASES[slot]
    if (!baseId) continue
    equipment[slot] = createItem(baseId, level, rarity)
  }
  return equipment
}

function allocatePassivesBFS(character: Character, points: number): Character {
  const adj = getAdjacency(PASSIVE_TREE)
  const allocated = new Set(character.allocatedNodes)
  const queue = [...character.allocatedNodes]
  let c = { ...character }
  c.passivePoints = points

  while (points > 0 && queue.length > 0) {
    const current = queue.shift()!
    const neighbors = adj.get(current) ?? []
    for (const neighbor of neighbors) {
      if (!allocated.has(neighbor)) {
        const node = getNode(PASSIVE_TREE, neighbor)
        if (!node || node.type === 'root') continue
        const before = c.allocatedNodes.length
        c = allocateNode(c, PASSIVE_TREE, neighbor)
        if (c.allocatedNodes.length > before) {
          allocated.add(neighbor)
          queue.push(neighbor)
          points--
          if (points <= 0) break
        }
      }
    }
  }
  return c
}

function createDefaultCharacter(classId: ClassId): Character {
  const gameClass = CLASSES[classId]
  return {
    id: 'player_1',
    name: 'Exile',
    classId,
    level: 1,
    experience: 0,
    experienceToNext: 100,
    life: gameClass.baseLife,
    maxLife: gameClass.baseLife,
    energyShield: gameClass.baseEnergyShield,
    maxEnergyShield: gameClass.baseEnergyShield,
    attributes: { ...gameClass.baseAttributes },
    resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
    accuracy: gameClass.baseAccuracy,
    evasion: gameClass.baseEvasion,
    armour: gameClass.baseAttributes.strength * 2,
    attackRate: 1.0,
    movementSpeed: 0,
    basePhysicalDamageMin: 2,
    basePhysicalDamageMax: 4,
    criticalChance: 0.05,
    criticalMultiplier: 1.5,
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    special: {},
    isAlive: true,
    respawnTimer: 0,
    allocatedNodes: [`root_${CLASS_ROOT_MAP[classId]}`],
    passivePoints: 0,
    equippedSkills: [{ skillId: 'strike', supportIds: [], cooldownRemaining: 0, hitCounter: 0 }],
    ascendancyId: null,
    allocatedAscendancyNodes: [],
    keystoneChoices: {},
    ascendancyPoints: 0,
    trial1Completed: false,
    trial2Completed: false,
    trial3Completed: false,
    trial4Completed: false,
    devOverrides: {},
    ownedGems: [],
    supportSlotCount: 2,
    increasedPhysicalDamage: 0,
    morePhysicalDamage: 1,
    increasedSpellDamage: 0,
    moreSpellDamage: 1,
    increasedAttackSpeed: 0,
    moreAttackSpeed: 1,
    increasedAccuracy: 0,
    lifeRegen: 0,
    esRecharge: 0,
    summons: [],
  }
}

/**
 * Build a real level-`level` character through the game's actual systems
 * (equipment, passives, ascendancy). Shared by the player-power estimate and
 * the minion DPS-share report (minion spec §8.3).
 */
export function buildValidatorCharacter(level: number, gearRarity: ItemRarity = 'rare'): Character {
  let character = createDefaultCharacter('warlord')
  character.level = level
  character.passivePoints = level - 1
  character.allocatedNodes = ['root_warlord']

  const equipment = buildEquipment(level, gearRarity)

  character = allocatePassivesBFS(character, level - 1)
  character = recalculateCharacterFromEquipment(character, equipment)
  character = applyPassiveStats(character, PASSIVE_TREE)
  character = applyAscendancyStats(character)
  return character
}

/**
 * Full 4-member army fixture (spec §8.1 cap): 1 Sentinel + 2 Wretches + 1
 * Wisp, resolved at the given level. Used by the minion DPS-share report.
 */
export function buildMinionArmy(level: number): PartyMember[] {
  const roster = ['bone_sentinel', 'plague_wretch', 'plague_wretch', 'rift_wisp']
  const counts = new Map<string, number>()
  return roster.map(defId => {
    const instanceIndex = (counts.get(defId) ?? 0) + 1
    counts.set(defId, instanceIndex)
    return resolveMinionMember(
      { minionDefId: defId, level, xp: 0, alive: true, respawnTicksRemaining: 0 },
      MINIONS[defId],
      instanceIndex,
    )
  })
}
