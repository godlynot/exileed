import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { skillDamage, armourMitigation, applyResistance, hitChance, createCombatState } from "./combat.ts";
import type { Character, Monster, Skill, EquippedSkill, CombatState } from "../types/game.ts";

// --- Fixtures ---

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    name: "Test Character",
    classId: "brute",
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
  } as Character;
}

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "m1",
    name: "Test Monster",
    level: 1,
    life: 100,
    maxLife: 100,
    damage: [{ type: "physical" as const, min: 1, max: 2 }],
    attackRate: 1,
    accuracy: 100,
    evasion: 0,
    experienceReward: 10,
    goldReward: 10,
    rarity: "normal",
    ...overrides,
  } as Monster;
}

function makeCombat(monster: Monster = makeMonster()): CombatState {
  return createCombatState(monster);
}

// Zero-level monster avoids armour mitigation from monster.level * 2 so tests hit clean numbers.
function makeCleanMonster(): Monster {
  return makeMonster({ level: 0, armour: 0 });
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "test_skill",
    name: "Test Skill",
    description: "",
    tags: ["attack", "physical", "melee"],
    baseDamageMin: 10,
    baseDamageMax: 10,
    damageType: "physical",
    cooldownTicks: 2,
    damageEffectiveness: 1,
    targeting: "single",
    ...overrides,
  } as Skill;
}

function makeEquippedSkill(skill: Skill, supportIds: string[] = []): EquippedSkill {
  return {
    skillId: skill.id,
    supportIds,
    cooldownRemaining: 0,
    hitCounter: 0,
  };
}

// --- Tests ---

describe("combat pure helpers", () => {
  it("armourMitigation returns a value between 0 and 1", () => {
    expect(armourMitigation(100, 50)).toBeGreaterThan(0);
    expect(armourMitigation(100, 50)).toBeLessThan(1);
  });

  it("applyResistance clamps resistance and scales damage", () => {
    expect(applyResistance(0.5, 100)).toBe(50);
    expect(applyResistance(0.75, 100, 0.75)).toBe(25);
    expect(applyResistance(-0.2, 100)).toBe(120);
  });

  it("hitChance is bounded", () => {
    expect(hitChance(1000, 0)).toBe(1);
    expect(hitChance(0, 1000)).toBeGreaterThanOrEqual(0.05);
  });
});

describe("skillDamage regressions", () => {
  let randomMock: ReturnType<typeof spyOn>;

  beforeEach(() => {
    randomMock = spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    randomMock.mockRestore();
  });

  it("adds weapon flat damage to attacks but not spells", () => {
    const char = makeCharacter({ basePhysicalDamageMin: 10, basePhysicalDamageMax: 10 });
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);

    const attackSkill = makeSkill({ id: "attack", tags: ["attack", "physical", "melee"], damageType: "physical" });
    const spellSkill = makeSkill({ id: "firebolt", tags: ["spell", "fire", "projectile"], damageType: "fire" });

    const attackRes = skillDamage(char, makeEquippedSkill(attackSkill), attackSkill, monster, 0, combat);
    const spellRes = skillDamage(char, makeEquippedSkill(spellSkill), spellSkill, monster, 0, combat);

    // Attack: 10 base + 10 weapon flat = 20; spell: 10 base only
    expect(attackRes.damage).toBe(20);
    expect(spellRes.damage).toBe(10);
  });

  it("caps phys-to-lightning conversion at 100%", () => {
    const char = makeCharacter({ special: { physToLightning: 150 } });
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);
    const skill = makeSkill({ id: "smite", tags: ["attack", "physical", "melee"], baseDamageMin: 100, baseDamageMax: 100 });

    const result = skillDamage(char, makeEquippedSkill(skill), skill, monster, 0, combat);

    expect(result.damage).toBe(100);
  });

  it("does not apply physical modifiers to elemental spells", () => {
    const char = makeCharacter({ increasedPhysicalDamage: 1.0 });
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);
    const skill = makeSkill({ id: "firebolt", tags: ["spell", "fire", "projectile"], damageType: "fire" });

    const result = skillDamage(char, makeEquippedSkill(skill), skill, monster, 0, combat);

    expect(result.damage).toBe(10);
  });

  it("extraProjectile support gives +25% more damage to projectile skills", () => {
    const char = makeCharacter();
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);
    const skill = makeSkill({ id: "proj", tags: ["attack", "physical", "projectile"], baseDamageMin: 100, baseDamageMax: 100 });

    const withoutSupport = skillDamage(char, makeEquippedSkill(skill), skill, monster, 0, combat);
    const withSupport = skillDamage(char, makeEquippedSkill(skill, ["extra_projectile"]), skill, monster, 0, combat);

    expect(withoutSupport.damage).toBe(100);
    expect(withSupport.damage).toBe(125);
  });

  it("convertPhysicalToChaos support converts 50% of physical damage", () => {
    const char = makeCharacter();
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);
    const skill = makeSkill({ id: "phys", tags: ["attack", "physical", "melee"], baseDamageMin: 100, baseDamageMax: 100 });

    const result = skillDamage(char, makeEquippedSkill(skill, ["convert_chaos"]), skill, monster, 0, combat);

    expect(result.damage).toBe(100);
  });
});
