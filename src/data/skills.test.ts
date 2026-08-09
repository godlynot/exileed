import { describe, expect, it } from 'bun:test'
import { SKILLS } from './skills.ts'

describe('skill data wave', () => {
  it('exposes Ember Lance through the existing projectile skill schema', () => {
    const skill = SKILLS.ember_lance
    expect(skill).toBeDefined()
    expect(skill.name).toBe('Ember Lance')
    expect(skill.tags).toEqual(['spell', 'fire', 'projectile', 'farRange'])
    expect(skill.targeting).toBe('single')
    expect(skill.baseDamageMin).toBeLessThan(skill.baseDamageMax)
  })

  it('adds a lightning spell option without introducing a new combat mechanic', () => {
    const skill = SKILLS.storm_arc
    expect(skill).toBeDefined()
    expect(skill.name).toBe('Storm Arc')
    expect(skill.tags).toEqual(['spell', 'lightning', 'projectile', 'farRange'])
    expect(skill.damageType).toBe('lightning')
    expect(skill.targeting).toBe('single')
    expect(skill.baseDamageMin).toBeLessThan(skill.baseDamageMax)
  })

  it('adds physical, elemental, and ailment archetypes across the existing range bands', () => {
    expect(SKILLS.ground_slam.tags).toContain('allRange')
    expect(SKILLS.shield_bash.tags).toContain('melee')
    expect(SKILLS.frostbolt.tags).toContain('farRange')
    expect(SKILLS.wildfire.tags).toContain('dot')
    expect(SKILLS.plague_burst.targeting).toBe('pack')
    expect(SKILLS.puncture.appliesAilment?.type).toBe('bleed')
    expect(SKILLS.wildfire.appliesAilment?.type).toBe('burn')
    expect(SKILLS.soul_rend.appliesAilment?.type).toBe('poison')
  })

  it('covers additional physical, elemental, and chaos archetypes', () => {
    expect(SKILLS.rending_arc.targeting).toBe('pack')
    expect(SKILLS.thunder_lash.damageType).toBe('lightning')
    expect(SKILLS.blood_lance.appliesAilment?.type).toBe('bleed')
    expect(SKILLS.emberfall.tags).toContain('allRange')
    expect(SKILLS.venomous_wave.appliesAilment?.type).toBe('poison')
    expect(SKILLS.frostquake.damageType).toBe('cold')
  })

  it('keeps every skill numerically valid for the combat calculator', () => {
    const ids = Object.keys(SKILLS)
    expect(new Set(ids).size).toBe(ids.length)
    for (const skill of Object.values(SKILLS)) {
      expect(skill.id.length).toBeGreaterThan(0)
      expect(skill.tags.length).toBeGreaterThan(0)
      expect(skill.baseDamageMin).toBeGreaterThan(0)
      expect(skill.baseDamageMax).toBeGreaterThan(skill.baseDamageMin)
      expect(skill.cooldownTicks).toBeGreaterThan(0)
      expect(skill.damageEffectiveness).toBeGreaterThan(0)
      if (skill.appliesAilment) {
        expect(skill.appliesAilment.damagePerSecond).toBeGreaterThan(0)
        expect(skill.appliesAilment.durationSeconds).toBeGreaterThan(0)
      }
    }
  })
})
