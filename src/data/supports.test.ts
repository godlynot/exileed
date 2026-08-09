import { describe, expect, it } from 'bun:test'
import { SKILLS } from './skills.ts'
import { SUPPORTS } from './supports.ts'
import { STAT_KEYS } from '../types/game.ts'

describe('support data wave', () => {
  it('adds a buildable set of offensive and cadence supports', () => {
    const expectedIds = [
      'vicious_strikes',
      'elemental_attunement',
      'arcane_intensity',
      'swift_assault',
      'rapid_channeling',
      'added_fire_damage_plus',
      'added_cold_damage_plus',
      'added_lightning_damage_plus',
      'added_physical_damage_plus',
      'lingering_ailments',
    ]

    for (const id of expectedIds) {
      expect(SUPPORTS[id]).toBeDefined()
      expect(SUPPORTS[id].name.length).toBeGreaterThan(0)
      expect(SUPPORTS[id].allowedTags.length).toBeGreaterThan(0)
    }
  })

  it('adds a second build layer for physical, elemental, and chaos archetypes', () => {
    expect(SUPPORTS.brutal_focus.modifiers[0].stat).toBe('inc_phys_damage_percent')
    expect(SUPPORTS.elemental_pulse.allowedTags).toContain('lightning')
    expect(SUPPORTS.deepening_curse.allowedTags).toContain('chaos')
    expect(SUPPORTS.ember_core.modifiers[0].stat).toBe('flat_fire_damage')
    expect(SUPPORTS.rime_core.modifiers[0].stat).toBe('flat_cold_damage')
    expect(SUPPORTS.storm_core.modifiers[0].stat).toBe('flat_lightning_damage')
  })

  it('keeps every support modifier inside the existing stat pipeline', () => {
    for (const support of Object.values(SUPPORTS)) {
      for (const modifier of support.modifiers) {
        expect(STAT_KEYS).toContain(modifier.stat)
        expect(['flat', 'increased', 'more', 'special']).toContain(modifier.mode)
        expect(Number.isFinite(modifier.value)).toBe(true)
      }
    }
  })

  it('gives every support at least one compatible skill', () => {
    for (const support of Object.values(SUPPORTS)) {
      const compatible = Object.values(SKILLS).some(skill =>
        support.allowedTags.some(tag => skill.tags.includes(tag)),
      )
      expect(compatible).toBe(true)
    }
  })
})
