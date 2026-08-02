import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { GEMS } from '../data/balance.ts'
import { SKILLS } from '../data/skills.ts'
import { SUPPORTS } from '../data/supports.ts'
import { createBlankSupport, createGemItem, addProgressionDropsToInventory, dropGemItem } from './items.ts'

let randomMock: ReturnType<typeof spyOn> | null = null

afterEach(() => {
  randomMock?.mockRestore()
  randomMock = null
})

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
