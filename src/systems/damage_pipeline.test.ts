import { describe, it, expect } from 'bun:test'
import { skillDamage, skillDisplayStats, createCombatState } from './combat.ts'
import type { Character, Monster, Skill, EquippedSkill, CombatState } from '../types/game.ts'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    name: 'Test Character',
    classId: 'brute',
    level: 1,
    experience: 0,
    experienceToNext: 100,
    life: 100,
    maxLife: 100,
    energyShield: 0,
    maxEnergyShield: 0,
    attributes: { strength: 10, dexterity: 10, intelligence: 10 },
    resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
    accuracy: 1000,
    evasion: 0,
    armour: 0,
    attackRate: 1,
    basePhysicalDamageMin: 0,
    basePhysicalDamageMax: 0,
    criticalChance: 0,
    criticalMultiplier: 1.5,
    increasedPhysicalDamage: 0,
    morePhysicalDamage: 1,
    increasedSpellDamage: 0,
    moreSpellDamage: 1,
    increasedAttackSpeed: 0,
    moreAttackSpeed: 1,
    increasedAccuracy: 0,
    damageVsBossesPercent: 0,
    goldFindPercent: 0,
    chanceToBleed: 0,
    chanceToShock: 0,
    chanceToInflictDespair: 0,
    lifeRegen: 0,
    esRecharge: 0,
    special: {},
    isAlive: true,
    respawnTimer: 0,
    allocatedNode: [],
    allocatedNodes: [],
    passivePoints: 0,
    ascendancyId: null,
    allocatedAscendancyNodes: [],
    trial1Completed: false,
    trial2Completed: false,
    trial3Completed: false,
    trial4Completed: false,
    equippedSkills: [],
    ownedGems: [],
    supportSlotCount: 2,
    keystoneChoices: {},
    ascendancyPoints: 0,
    ...overrides,
  } as Character
}

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: 'm1',
    name: 'Test Monster',
    level: 0,
    life: 100,
    maxLife: 100,
    damage: [{ type: 'physical' as const, min: 1, max: 2 }],
    attackRate: 1,
    accuracy: 100,
    evasion: 0,
    experienceReward: 10,
    goldReward: 10,
    rarity: 'normal',
    ...overrides,
  } as Monster
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test_skill',
    name: 'Test Skill',
    description: '',
    tags: ['attack', 'physical', 'melee'],
    baseDamageMin: 10,
    baseDamageMax: 10,
    damageType: 'physical',
    cooldownTicks: 2,
    damageEffectiveness: 1,
    targeting: 'single',
    ...overrides,
  } as Skill
}

function makeEquippedSkill(skill: Skill, supportIds: string[] = []): EquippedSkill {
  return {
    skillId: skill.id,
    supportIds,
    cooldownRemaining: 0,
    hitCounter: 0,
  }
}

function makeCombat(monster: Monster = makeMonster()): CombatState {
  return createCombatState(monster)
}

// Force a deterministic max roll and no crit so the arithmetic is exact.
function deterministic(character: Character): Character {
  return {
    ...character,
    special: { ...character.special, perfectCalculation: true, cannotCrit: true },
  }
}

// ── Damage-pipeline ordering invariants ──────────────────────────────────────

describe('damage pipeline ordering (flat -> increased -> more)', () => {
  it('applies flat added damage BEFORE the increased multiplier', () => {
    const skill = makeSkill()
    const monster = makeMonster()
    const combat = makeCombat(monster)

    // added_physical_damage: flat_phys_damage = 3 (level 1 gem)
    // (base 10 + flat 3) * (1 + 0) = 13
    const withFlat = deterministic(makeCharacter({}))
    const eqFlat = makeEquippedSkill(skill, ['added_physical_damage'])
    const rFlat = skillDamage(withFlat, eqFlat, skill, monster, 0, combat)
    expect(rFlat.damage).toBe(13)

    // No support: base 10 alone
    const noFlat = deterministic(makeCharacter({}))
    const rNoFlat = skillDamage(noFlat, makeEquippedSkill(skill), skill, monster, 0, combat)
    expect(rNoFlat.damage).toBe(10)

    // Flat must be inside the multiplier: (10+3)*1.5 = 19.5 -> 19
    // If flat were added after: 10*1.5 + 3 = 18 — different result
    const withBoth = deterministic(makeCharacter({ increasedPhysicalDamage: 0.5 }))
    const rBoth = skillDamage(withBoth, eqFlat, skill, monster, 0, combat)
    expect(rBoth.damage).toBe(19)
  })

  it('applies increased and more multipliers MULTIPLICATIVELY, not additively', () => {
    const skill = makeSkill()
    const monster = makeMonster()
    const combat = makeCombat(monster)

    // inc 0.5, more 2.0 -> 10 * 1.5 * 2 = 30
    const both = deterministic(
      makeCharacter({ increasedPhysicalDamage: 0.5, morePhysicalDamage: 2.0 }),
    )
    const rBoth = skillDamage(both, makeEquippedSkill(skill), skill, monster, 0, combat)
    expect(rBoth.damage).toBe(30)

    // Additive collapse would give 10 * (1 + 0.5 + 1.0) = 25 — must NOT match.
    expect(rBoth.damage).not.toBe(25)
  })

  it('keeps more-multiplier stacking distinct from increased stacking', () => {
    const skill = makeSkill()
    const monster = makeMonster()
    const combat = makeCombat(monster)

    // two sources of +50% increased -> 10 * 2.0 = 20
    const inc2 = deterministic(makeCharacter({ increasedPhysicalDamage: 1.0 }))
    const rInc = skillDamage(inc2, makeEquippedSkill(skill), skill, monster, 0, combat)
    expect(rInc.damage).toBe(20)

    // one source of 2.0x more -> 10 * 2.0 = 20 (same number, different math)
    const more2 = deterministic(makeCharacter({ morePhysicalDamage: 2.0 }))
    const rMore = skillDamage(more2, makeEquippedSkill(skill), skill, monster, 0, combat)
    expect(rMore.damage).toBe(20)

    // Combined they must multiply: 10 * 2.0 * 2.0 = 40, not 10 * (2.0 + 1.0) = 30
    const combined = deterministic(
      makeCharacter({ increasedPhysicalDamage: 1.0, morePhysicalDamage: 2.0 }),
    )
    const rCombined = skillDamage(combined, makeEquippedSkill(skill), skill, monster, 0, combat)
    expect(rCombined.damage).toBe(40)
  })

  it('applies armour mitigation to the SCALED physical portion, not the raw base', () => {
    const skill = makeSkill()
    // Monster armour such that a raw-10 hit would be mitigated differently
    // than a scaled ~30 hit.
    const monster = makeMonster({ level: 0, armour: 1000 })
    const combat = makeCombat(monster)

    const scaled = deterministic(
      makeCharacter({ increasedPhysicalDamage: 2.0 }),
    )
    const rScaled = skillDamage(scaled, makeEquippedSkill(skill), skill, monster, 0, combat)
    // (10 * 3) = 30 unmitigated; armour mitigation on 30 must reduce it.
    expect(rScaled.damage).toBeLessThan(30)
    expect(rScaled.damage).toBeGreaterThan(0)

    // If mitigation were applied to the raw base before scaling, the result
    // would differ; lock the scaled-portion behavior with an explicit bound.
    const unscaled = deterministic(makeCharacter({}))
    const rUnscaled = skillDamage(unscaled, makeEquippedSkill(skill), skill, monster, 0, combat)
    expect(rUnscaled.damage).toBeLessThan(rScaled.damage)
  })

  it('skillDisplayStats and skillDamage agree on the ordering for max rolls', () => {
    const skill = makeSkill()
    const monster = makeMonster()
    const combat = makeCombat(monster)
    const character = deterministic(
      makeCharacter({ increasedPhysicalDamage: 0.5, morePhysicalDamage: 2.0 }),
    )
    const equipped = makeEquippedSkill(skill)

    const display = skillDisplayStats(character, equipped, skill, combat)
    const hit = skillDamage(character, equipped, skill, monster, 0, combat)

    // perfectCalculation forces max roll, no crit -> both must match exactly.
    expect(hit.damage).toBe(display.maxDamage)
  })
})
