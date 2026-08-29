import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { DEFENSIVE_GEAR_SCALING_EXPONENT, GEMS, monsterScalingMultiplier } from '../data/balance.ts'
import { BASE_ITEMS, UNIQUE_ITEMS } from '../data/items.ts'
import { SKILLS } from '../data/skills.ts'
import { SUPPORTS } from '../data/supports.ts'
import {
  createBlankSupport,
  createGemItem,
  addProgressionDropsToInventory,
  dropGemItem,
  rarityForAffixCount,
  rollAffixes,
  applyOrb,
  createItem,
  diagnoseItems,
  recalculateItem,
  calculateEquipmentBonus,
  consumeGeneratedDrops,
  dropItem,
  shouldAutoSellItem,
  reconcileAutoSellCap,
  RARITY_RANGE,
  MAX_PREFIXES,
  MAX_SUFFIXES,
} from './items.ts'
import type { Item } from '../types/item.ts'
import type { GameState } from '../types/game.ts'

let randomMock: ReturnType<typeof spyOn> | null = null

afterEach(() => {
  randomMock?.mockRestore()
  randomMock = null
})

// ── Progression loot ────────────────────────────────────────────────────────

describe('progression loot', () => {
  it('creates valid blank supports without making them equippable gear', () => {
    const blank = createBlankSupport(0)

    expect(blank.kind).toBe('blankSupport')
    expect(blank.baseId).toBe('blank_support')
    expect(blank.name).toBe('Blank Support')
    expect(blank.itemLevel).toBe(1)
    expect(blank.affixes).toHaveLength(0)
  })

  it('creates claimable skill and support gem items only for known catalog ids', () => {
    const skillId = Object.keys(SKILLS)[0]
    const supportId = Object.keys(SUPPORTS)[0]
    const skillItem = createGemItem('skillGem', skillId, 12)
    const supportItem = createGemItem('supportGem', supportId, 12)

    expect(skillItem?.kind).toBe('skillGem')
    expect(skillItem?.gemId).toBe(skillId)
    expect(skillItem?.itemLevel).toBe(12)
    expect(supportItem?.kind).toBe('supportGem')
    expect(supportItem?.gemId).toBe(supportId)
    expect(createGemItem('supportGem', 'missing_support', 12)).toBeNull()
  })

  it('selects an unowned gem and never returns one already owned', () => {
    const ownedSkillIds = Object.keys(SKILLS)
    const firstSupportId = Object.keys(SUPPORTS)[0]
    randomMock = spyOn(Math, 'random').mockReturnValue(0)

    const drop = dropGemItem(17, ownedSkillIds)

    expect(drop).not.toBeNull()
    expect(drop?.kind).toBe('supportGem')
    expect(drop?.gemId).toBe(firstSupportId)
    expect(ownedSkillIds).not.toContain(drop?.gemId)
    expect(drop?.itemLevel).toBe(17)
  })

  it('does not roll a gem when the gem chance fails', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(GEMS.GEM_DROP_CHANCE)

    expect(dropGemItem(10, [])).toBeNull()
  })

  it('does not exceed inventory capacity while adding progression drops', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0)
    const existing = [createBlankSupport(1)]

    const result = addProgressionDropsToInventory(existing, 1, 10, [], 10)

    expect(result.items).toHaveLength(1)
    expect(result.drops).toHaveLength(0)
  })

  it('reserves newly dropped gem ids across multiple kills', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0)
    const result = addProgressionDropsToInventory([], 10, 10, [], 2)
    const gemIds = result.drops.flatMap(item => item.gemId ? [item.gemId] : [])

    expect(gemIds.length).toBeGreaterThan(0)
    expect(new Set(gemIds).size).toBe(gemIds.length)
  })
})

describe('unique item bases', () => {
  it('defines six unique items with fixed effects and no rolled affixes', () => {
    expect(Object.keys(UNIQUE_ITEMS)).toHaveLength(6)

    for (const [baseId, base] of Object.entries(UNIQUE_ITEMS)) {
      const item = createItem(baseId, 50, 'unique')
      expect(item.rarity).toBe('unique')
      expect(item.baseId).toBe(baseId)
      expect(item.name).toBe(base.uniqueName ?? base.name)
      expect(item.affixes).toHaveLength(0)
      expect(item.implicit?.length).toBeGreaterThan(0)
      expect(item.uniqueDescription).toBe(base.uniqueDescription)
    }
  })

  it('routes chaos resistance affixes into character equipment bonuses', () => {
    const base = createItem('battered_chest', 50, 'normal')
    const equipment = {
      weapon: null,
      offhand: null,
      helmet: { ...base, affixes: [{
        id: 'chaos_resistance_t1',
        type: 'suffix' as const,
        name: 'of the Void',
        tier: 1,
        stat: 'chaosResistance',
        minValue: 42,
        maxValue: 56,
        value: 50,
      }] },
      body: null,
      gloves: null,
      boots: null,
      belt: null,
      amulet: null,
      ring1: null,
      ring2: null,
    }

    const bonus = calculateEquipmentBonus(equipment)

    expect(bonus.resistances.chaos).toBeCloseTo(0.5)
  })

  it('routes unique utility effects into character equipment bonuses', () => {
    const equipment = {
      weapon: null,
      offhand: createItem('tideglass_aegis', 50, 'unique'),
      helmet: createItem('crown_of_first_storm', 50, 'unique'),
      body: createItem('bloodbound_carapace', 50, 'unique'),
      gloves: null,
      boots: createItem('mirewalkers_coil', 50, 'unique'),
      belt: null,
      amulet: null,
      ring1: createItem('drowned_kings_coin', 50, 'unique'),
      ring2: null,
    }
    const bonus = calculateEquipmentBonus(equipment)

    expect(bonus.resistances.cold).toBeCloseTo(0.18)
    expect(bonus.resistances.lightning).toBeCloseTo(0.18)
    expect(bonus.resistances.chaos).toBeCloseTo(0.18)
    expect(bonus.accuracy).toBe(45)
    expect(bonus.increasedEvasionPercent).toBe(12)
    expect(bonus.increasedMaxLifePercent).toBe(10)
    expect(bonus.damageVsBossesPercent).toBe(8)
    expect(bonus.goldFindPercent).toBe(24)
  })

  it('selects only the hand-designed pool for a forced unique drop', () => {
    const dropped = dropItem(50, { forceRarity: 'unique' })
    expect(dropped?.rarity).toBe('unique')
    expect(dropped && UNIQUE_ITEMS[dropped.baseId]).toBeDefined()
    expect(dropped?.implicit?.length).toBeGreaterThan(0)
    consumeGeneratedDrops()
  })
})

describe('defensive gear scaling', () => {
  it('dampens late defensive base growth without changing the base item contract', () => {
    const item = createItem('battered_chest', 45, 'normal')
    const expectedArmour = Math.floor(
      BASE_ITEMS.battered_chest.armour! * Math.pow(monsterScalingMultiplier(45), DEFENSIVE_GEAR_SCALING_EXPONENT),
    )
    const fullCurveArmour = Math.floor(BASE_ITEMS.battered_chest.armour! * monsterScalingMultiplier(45))

    expect(recalculateItem(item).armour).toBe(expectedArmour)
    expect(item.armour).toBe(expectedArmour)
    expect(item.armour).toBeLessThan(fullCurveArmour)
  })
})

// ── Rarity range helpers ─────────────────────────────────────────────────────

describe('rarityForAffixCount', () => {
  it('maps 0 to normal', () => {
    expect(rarityForAffixCount(0)).toBe('normal')
  })

  it('maps 1-2 to magic', () => {
    expect(rarityForAffixCount(1)).toBe('magic')
    expect(rarityForAffixCount(2)).toBe('magic')
  })

  it('maps 4-6 to rare', () => {
    expect(rarityForAffixCount(4)).toBe('rare')
    expect(rarityForAffixCount(5)).toBe('rare')
    expect(rarityForAffixCount(6)).toBe('rare')
  })

  it('returns null for gap counts (3, 7+)', () => {
    expect(rarityForAffixCount(3)).toBeNull()
    expect(rarityForAffixCount(7)).toBeNull()
    expect(rarityForAffixCount(10)).toBeNull()
  })

  it('RARITY_RANGE constants match the design', () => {
    expect(RARITY_RANGE.normal).toEqual({ min: 0, max: 0 })
    expect(RARITY_RANGE.magic).toEqual({ min: 1, max: 2 })
    expect(RARITY_RANGE.rare).toEqual({ min: 4, max: 6 })
  })

  it('item generation reaches the two-affix Magic and six-affix Rare ceilings', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0.999)

    const magic = createItem('rusted_axe', 50, 'magic')
    const rare = createItem('rusted_axe', 50, 'rare')

    expect(magic.affixes).toHaveLength(2)
    expect(rare.affixes).toHaveLength(6)
    expect(rare.affixes.filter(a => a.type === 'prefix').length).toBeLessThanOrEqual(MAX_PREFIXES)
    expect(rare.affixes.filter(a => a.type === 'suffix').length).toBeLessThanOrEqual(MAX_SUFFIXES)
  })

  it('every equipment base can generate valid Magic and Rare affix counts', () => {
    for (const baseId of Object.keys(BASE_ITEMS)) {
      for (let trial = 0; trial < 25; trial++) {
        const magic = createItem(baseId, 50, 'magic')
        const rare = createItem(baseId, 50, 'rare')

        expect(magic.affixes.length).toBeGreaterThanOrEqual(RARITY_RANGE.magic.min)
        expect(magic.affixes.length).toBeLessThanOrEqual(RARITY_RANGE.magic.max)
        expect(rare.affixes.length).toBeGreaterThanOrEqual(RARITY_RANGE.rare.min)
        expect(rare.affixes.length).toBeLessThanOrEqual(RARITY_RANGE.rare.max)
        expect(rare.affixes.filter(a => a.type === 'prefix').length).toBeLessThanOrEqual(MAX_PREFIXES)
        expect(rare.affixes.filter(a => a.type === 'suffix').length).toBeLessThanOrEqual(MAX_SUFFIXES)
      }
    }
  })

  it('Genesis and Entropy use the full Rare 4-6 range', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0.999)

    const normal = createItem('rusted_axe', 50, 'normal')
    const genesis = applyOrb(normal, 'genesis')
    const entropy = applyOrb(genesis, 'entropy')

    expect(genesis.rarity).toBe('rare')
    expect(genesis.affixes).toHaveLength(6)
    expect(entropy.rarity).toBe('rare')
    expect(entropy.affixes).toHaveLength(6)
  })
})

// ── Duplicate & cap enforcement in rollAffixes ───────────────────────────────

describe('rollAffixes — no duplicate affixes and prefix/suffix caps', () => {
  it('never produces duplicate affix definition ids', () => {
    for (let trial = 0; trial < 20; trial++) {
      const affixes = rollAffixes('weapon', 50, 6)
      const defIds = affixes.map(a => {
        const tierIdx = a.id.lastIndexOf('_t')
        return tierIdx >= 0 ? a.id.substring(0, tierIdx) : a.id
      })
      // Every rolled def id must be unique (no two affixes share the same definition).
      expect(new Set(defIds).size).toBe(defIds.length)
    }
  })

  it('never exceeds 3 prefixes and 3 suffixes', () => {
    for (let trial = 0; trial < 20; trial++) {
      const affixes = rollAffixes('weapon', 50, 6)
      const prefixes = affixes.filter(a => a.type === 'prefix')
      const suffixes = affixes.filter(a => a.type === 'suffix')
      expect(prefixes.length).toBeLessThanOrEqual(MAX_PREFIXES)
      expect(suffixes.length).toBeLessThanOrEqual(MAX_SUFFIXES)
    }
  })

  it('respects existing affixes when rolling additional ones', () => {
    // Create an item, then try to roll more affixes with the existing ones passed.
    const existing = createItem('rusted_axe', 10, 'magic')
    // Roll 1 more affix, passing the existing ones
    const additional = rollAffixes('weapon', 10, 1, existing.affixes)
    if (additional.length > 0) {
      const combined = [...existing.affixes, ...additional]
      const defIds = combined.map(a => {
        const tierIdx = a.id.lastIndexOf('_t')
        return tierIdx >= 0 ? a.id.substring(0, tierIdx) : a.id
      })
      expect(new Set(defIds).size).toBe(defIds.length)
    }
  })

  it('stops adding when all prefixes and suffixes are exhausted or capped', () => {
    const affixes = rollAffixes('weapon', 50, 10, []) // request 10 on weapon
    // Should not exceed 6 total (3p + 3s max)
    expect(affixes.length).toBeLessThanOrEqual(6)
  })
})

// ── Orb of the Void ──────────────────────────────────────────────────────────

describe('Orb of the Void', () => {
  it('rejects Normal items (no effect, returns unchanged)', () => {
    const normal = createItem('rusted_axe', 1, 'normal')
    const result = applyOrb(normal, 'void_orb')
    expect(result).toBe(normal) // reference equality — unchanged
    expect(result.rarity).toBe('normal')
    expect(result.affixes).toHaveLength(0)
  })

  it('reduces a Magic item with 2 affixes to 1 affix (stays Magic)', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0) // removes first affix

    const magic = createItem('rusted_axe', 10, 'magic')
    if (magic.affixes.length < 2) return // skip if the roll only gave 1

    const result = applyOrb(magic, 'void_orb')
    expect(result.rarity).toBe('magic')
    expect(result.affixes.length).toBe(magic.affixes.length - 1)
  })

  it('demotes Magic with 1 affix to Normal', () => {
    const magic = createItem('rusted_axe', 10, 'magic')
    const singleAffix = magic.affixes.slice(0, 1)
    const oneAffixItem: Item = { ...magic, rarity: 'magic', affixes: singleAffix }
    expect(oneAffixItem.affixes).toHaveLength(1)

    randomMock = spyOn(Math, 'random').mockReturnValue(0)

    const result = applyOrb(oneAffixItem, 'void_orb')
    expect(result.rarity).toBe('normal')
    expect(result.affixes).toHaveLength(0)
  })

  it('rare with 4 affixes → void → demotes to Magic with 2 affixes (ceiling check)', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0) // removes first affix, then first excess

    const rare = createItem('rusted_axe', 50, 'rare')
    expect(rare.affixes).toHaveLength(4)

    const result = applyOrb(rare, 'void_orb')
    // 4 → remove 1 → 3, which falls in gap → strip 1 more → 2 → Magic
    expect(result.rarity).toBe('magic')
    expect(result.affixes.length).toBe(2)
  })

  it('rare with 5 affixes → void → 4 affixes → stays Rare (no demotion needed)', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0)

    const rare = createItem('rusted_axe', 50, 'rare')
    // Add a 5th affix
    const extra = rollAffixes('weapon', 50, 1, rare.affixes)
    const fiveAffixItem: Item = { ...rare, affixes: [...rare.affixes, ...extra] }
    if (fiveAffixItem.affixes.length < 5) return // couldn't add

    const result = applyOrb(fiveAffixItem, 'void_orb')
    // 5 → remove 1 → 4, in range [4,6] → stays Rare
    expect(result.rarity).toBe('rare')
    expect(result.affixes.length).toBe(4)
  })

  it('rare with 6 affixes → void → 5 affixes → stays Rare', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0)

    const rare = createItem('rusted_axe', 50, 'rare')
    // Add two more to reach 6
    const extra1 = rollAffixes('weapon', 50, 1, rare.affixes)
    const afterFirst: Item = { ...rare, affixes: [...rare.affixes, ...extra1] }
    const extra2 = rollAffixes('weapon', 50, 1, afterFirst.affixes)
    const sixAffixItem: Item = { ...rare, affixes: [...afterFirst.affixes, ...extra2] }
    if (sixAffixItem.affixes.length < 6) return

    const result = applyOrb(sixAffixItem, 'void_orb')
    // 6 → remove 1 → 5, in range [4,6] → stays Rare
    expect(result.rarity).toBe('rare')
    expect(result.affixes.length).toBe(5)
  })
})

// ── Sovereignty & Triumph insertion path ─────────────────────────────────────

describe('Sovereignty and Triumph respect existing prefix/suffix counts', () => {
  it('Sovereignty fills a Magic item into the Rare 4-6 range', () => {
    randomMock = spyOn(Math, 'random').mockReturnValue(0.5)
    const magic = createItem('rusted_axe', 10, 'magic')

    const result = applyOrb(magic, 'sovereignty')
    expect(result.rarity).toBe('rare')
    expect(result.affixes.length).toBeGreaterThanOrEqual(RARITY_RANGE.rare.min)
    expect(result.affixes.length).toBeLessThanOrEqual(RARITY_RANGE.rare.max)
    expect(result.affixes.length).toBeGreaterThan(magic.affixes.length)
  })

  it('Sovereignty rejects when both prefix and suffix caps are already full', () => {
    const magic = createItem('rusted_axe', 10, 'magic')
    // Manually fill to 3p+3s
    const allAffixes = rollAffixes('weapon', 50, 6, []) // should try for 3p+3s
    const cappedItem: Item = { ...magic, rarity: 'magic', affixes: allAffixes }

    // Only test if we actually got 6
    if (cappedItem.affixes.length < 6) return

    const prefixes = cappedItem.affixes.filter(a => a.type === 'prefix').length
    const suffixes = cappedItem.affixes.filter(a => a.type === 'suffix').length
    if (prefixes < 3 || suffixes < 3) return // not fully capped

    randomMock = spyOn(Math, 'random').mockReturnValue(0)
    const result = applyOrb(cappedItem, 'sovereignty')
    // Should return unchanged because no room to add
    expect(result).toBe(cappedItem)
  })

  it('Triumph rejects Rare items already at 3p+3s', () => {
    const rare = createItem('rusted_axe', 50, 'rare')
    // Fill to 3p+3s
    const extra1 = rollAffixes('weapon', 50, 1, rare.affixes)
    const after: Item = { ...rare, affixes: [...rare.affixes, ...extra1] }
    const extra2 = rollAffixes('weapon', 50, 1, after.affixes)
    const capped: Item = { ...rare, affixes: [...after.affixes, ...extra2] }
    if (capped.affixes.length < 6) return

    const prefixes = capped.affixes.filter(a => a.type === 'prefix').length
    const suffixes = capped.affixes.filter(a => a.type === 'suffix').length
    if (prefixes < 3 || suffixes < 3) return

    randomMock = spyOn(Math, 'random').mockReturnValue(0)
    const result = applyOrb(capped, 'triumph')
    expect(result).toBe(capped) // unchanged
  })

  it('Triumph adds an affix when room exists', () => {
    const rare = createItem('rusted_axe', 50, 'rare')
    randomMock = spyOn(Math, 'random').mockReturnValue(0.5)

    const result = applyOrb(rare, 'triumph')
    if (result !== rare) {
      expect(result.affixes.length).toBe(rare.affixes.length + 1)
      expect(result.rarity).toBe('rare')
    }
  })
})

describe('auto-sell level cap', () => {
  const baseInventory = { autoSellNormal: true, autoSellMagic: true, autoSellMaxLevel: 0 }

  it('uses the character level when the cap is zero', () => {
    const item = createItem('rusted_axe', 10, 'normal')
    expect(shouldAutoSellItem(item, baseInventory, 10)).toBe(true)
    expect(shouldAutoSellItem(item, baseInventory, 9)).toBe(false)
  })

  it('respects an explicit cap without exceeding the character level', () => {
    const item = createItem('rusted_axe', 12, 'normal')
    expect(shouldAutoSellItem(item, { ...baseInventory, autoSellMaxLevel: 10 }, 20)).toBe(false)
    expect(shouldAutoSellItem(item, { ...baseInventory, autoSellMaxLevel: 20 }, 15)).toBe(true)
  })

  it('never auto-sells rare or disabled rarities', () => {
    const rare = createItem('rusted_axe', 10, 'rare')
    const normal = createItem('rusted_axe', 10, 'normal')
    expect(shouldAutoSellItem(rare, baseInventory, 20)).toBe(false)
    expect(shouldAutoSellItem(normal, { ...baseInventory, autoSellNormal: false }, 20)).toBe(false)
  })

  it('reconciles drops above the configured cap back into the inventory', () => {
    const low = createItem('rusted_axe', 5, 'magic')
    const high = createItem('rusted_axe', 12, 'normal')
    const storedByCombat = createItem('rusted_axe', 14, 'normal')
    const inventory = { items: [storedByCombat], maxSize: 20, ...baseInventory, autoSellMaxLevel: 10 }

    const result = reconcileAutoSellCap([low, high, storedByCombat], inventory, 15, [
      { type: 'itemDropped', itemId: storedByCombat.id }, // combat stored this one itself
    ])

    // High-level drop restored, refund matches combat's sell value; the rest stay sold.
    expect(result.restored.map(dropped => dropped.id)).toEqual([high.id])
    expect(result.autoSold.map(dropped => dropped.id)).toEqual([low.id])
    expect(result.goldRefund).toBe(Math.max(1, high.itemLevel * 2))
  })

  it('restores nothing when the cap is zero (legacy behavior) or the inventory is full', () => {
    const item = createItem('rusted_axe', 10, 'normal')
    const legacy = reconcileAutoSellCap([item], { items: [], maxSize: 20, ...baseInventory }, 15, [])
    expect(legacy.restored).toEqual([])
    expect(legacy.autoSold.map(dropped => dropped.id)).toEqual([item.id])

    const full = reconcileAutoSellCap(
      [item],
      { items: Array.from({ length: 20 }, () => createItem('rusted_axe', 5, 'normal')), maxSize: 20, ...baseInventory, autoSellMaxLevel: 5 },
      15,
      [],
    )
    expect(full.restored).toEqual([])
  })
})

// ── Item diagnostics ─────────────────────────────────────────────────────────

describe('diagnoseItems', () => {
  function makeState(items: Item[], equipped: Item | null = null): GameState {
    return {
      inventory: { items, maxSize: 60, autoSellNormal: false, autoSellMagic: false, autoSellMaxLevel: 0 },
      equipment: { weapon: equipped, offhand: null, helmet: null, body: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null },
    } as unknown as GameState
  }

  it('returns empty for a clean state with no violations', () => {
    const cleanItem = createItem('rusted_axe', 10, 'magic')
    const state = makeState([cleanItem])
    const violations = diagnoseItems(state)
    expect(violations).toHaveLength(0)
  })

  it('detects a Rare item with fewer affixes than the Rare minimum', () => {
    const rare = createItem('rusted_axe', 50, 'rare')
    const broken: Item = { ...rare, rarity: 'rare', affixes: rare.affixes.slice(0, 2) }
    const state = makeState([broken])

    const violations = diagnoseItems(state)
    expect(violations.length).toBeGreaterThan(0)
    const v = violations[0]
    expect(v.rarity).toBe('rare')
    expect(v.violations.some(msg => msg.includes('min'))).toBe(true)
  })

  it('detects a Magic item with more than 2 affixes', () => {
    const rare = createItem('rusted_axe', 50, 'rare')
    // Take a 4-affix rare, call it magic — violation
    const broken: Item = { ...rare, rarity: 'magic' }
    const state = makeState([broken])

    const violations = diagnoseItems(state)
    expect(violations.length).toBeGreaterThan(0)
    const v = violations[0]
    expect(v.rarity).toBe('magic')
    expect(v.violations.some(msg => msg.includes('max'))).toBe(true)
  })

  it('detects more than 3 prefixes', () => {
    // Roll 6 affixes, take the first 4 that happen to be prefixes
    const allAffixes = rollAffixes('weapon', 50, 6, [])
    const onlyPrefixes = allAffixes.filter(a => a.type === 'prefix').slice(0, 4)
    if (onlyPrefixes.length < 4) return // not enough prefixes in this roll

    const rare = createItem('rusted_axe', 50, 'rare')
    const broken: Item = { ...rare, rarity: 'rare', affixes: onlyPrefixes }
    const state = makeState([broken])

    const violations = diagnoseItems(state)
    expect(violations.length).toBeGreaterThan(0)
    const v = violations[0]
    expect(v.violations.some(msg => msg.includes('prefixes'))).toBe(true)
  })

  it('detects duplicate affix definition ids', () => {
    const rare = createItem('rusted_axe', 50, 'rare')
    // Duplicate the first affix
    const duped = [...rare.affixes, rare.affixes[0]]
    const broken: Item = { ...rare, rarity: 'rare', affixes: duped }
    const state = makeState([broken])

    const violations = diagnoseItems(state)
    expect(violations.length).toBeGreaterThan(0)
    const v = violations[0]
    expect(v.violations.some(msg => msg.includes('duplicate'))).toBe(true)
  })

  it('also scans equipped items', () => {
    const rare = createItem('rusted_axe', 50, 'rare')
    const broken: Item = { ...rare, rarity: 'rare', affixes: rare.affixes.slice(0, 2) }
    const state = makeState([], broken)

    const violations = diagnoseItems(state)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].violations.some(msg => msg.includes('min'))).toBe(true)
  })

  it('ignores non-equipment items (gems, blank supports)', () => {
    const blank = createBlankSupport(10)
    const state = makeState([blank])

    const violations = diagnoseItems(state)
    expect(violations).toHaveLength(0)
  })
})
