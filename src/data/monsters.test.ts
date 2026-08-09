import { describe, expect, it } from 'bun:test'
import { MONSTERS } from './monsters.ts'
import { ZONES } from './zones.ts'

describe('monster data wave', () => {
  it('defines Carrion Moth as a valid Act 7 chaos threat', () => {
    const monster = MONSTERS.carrion_moth

    expect(monster).toBeDefined()
    expect(monster.name).toBe('Carrion Moth')
    expect(monster.level).toBe(51)
    expect(monster.rarity).toBe('normal')
    expect(monster.damage).toEqual([{ type: 'chaos', min: 260, max: 520 }])
    expect(monster.life).toBe(monster.maxLife)
    expect(monster.attackRate).toBeGreaterThan(2)
    expect(monster.evasion).toBeGreaterThan(600)
  })

  it('makes Carrion Moth reachable in both Rotting Deep combat pools', () => {
    const actSevenZones = ZONES.filter(zone => zone.act === 7 && zone.monsterIds.length > 1)

    expect(actSevenZones).toHaveLength(2)
    for (const zone of actSevenZones) {
      expect(zone.monsterIds).toContain('carrion_moth')
    }
  })
})
