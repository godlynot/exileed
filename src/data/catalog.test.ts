import { describe, expect, it } from 'bun:test'
import { BASE_ITEMS, STARTER_ITEMS, UNIQUE_ITEMS } from './items.ts'
import { MONSTERS } from './monsters.ts'
import { SKILLS } from './skills.ts'
import { SUPPORTS } from './supports.ts'
import { ZONES } from './zones.ts'

describe('content catalog integrity', () => {
  it('keeps zone monster pools and named elite templates resolvable', () => {
    const zoneIds = ZONES.map(zone => zone.id)
    expect(new Set(zoneIds).size).toBe(zoneIds.length)

    for (const zone of ZONES) {
      expect(zone.monsterIds.length).toBeGreaterThan(0)
      for (const monsterId of zone.monsterIds) {
        expect(MONSTERS[monsterId]).toBeDefined()
      }
      for (const eliteId of zone.eliteTemplateIds ?? []) {
        expect(MONSTERS[eliteId]).toBeDefined()
        expect(MONSTERS[eliteId].rarity).not.toBe('boss')
      }
      expect(zone.eliteChance).toBeGreaterThanOrEqual(0)
      expect(zone.eliteChance).toBeLessThanOrEqual(1)
    }
  })

  it('keeps starter loadouts complete and pointed at ordinary bases', () => {
    for (const starterIds of Object.values(STARTER_ITEMS)) {
      expect(starterIds).toHaveLength(9)
      expect(new Set(starterIds).size).toBe(starterIds.length)
      for (const baseId of starterIds) {
        expect(BASE_ITEMS[baseId]).toBeDefined()
        expect(BASE_ITEMS[baseId].isUniqueBase).not.toBe(true)
      }
    }
  })

  it('keeps unique bases isolated from normal rolls and gives each one a fixed identity', () => {
    const uniqueIds = Object.keys(UNIQUE_ITEMS)
    expect(uniqueIds.length).toBeGreaterThan(0)
    expect(new Set(uniqueIds).size).toBe(uniqueIds.length)

    for (const item of Object.values(UNIQUE_ITEMS)) {
      expect(item.isUniqueBase).toBe(true)
      expect(item.uniqueName).toBeTruthy()
      expect(item.uniqueDescription).toBeTruthy()
      expect(item.implicit?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('keeps all combat content addressable by the loot catalogs', () => {
    for (const skill of Object.values(SKILLS)) {
      expect(skill.id).toBeTruthy()
      expect(SKILLS[skill.id]).toBe(skill)
    }
    for (const support of Object.values(SUPPORTS)) {
      expect(support.id).toBeTruthy()
      expect(SUPPORTS[support.id]).toBe(support)
    }
  })
})
