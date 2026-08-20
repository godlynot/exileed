import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { skillDamage, armourMitigation, applyResistance, hitChance, createCombatState, processSkillHits, aggregateSupportModifiers, simulateTick, spawnMonster, rangeBandHitCount } from "./combat.ts";
import type { Character, Monster, Skill, EquippedSkill, CombatState, GameState, Zone, PackMember } from "../types/game.ts";
import { MONSTERS } from "../data/monsters.ts";

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

function makeGameState(character: Character, combat: CombatState): GameState {
  return {
    character,
    zones: [],
    activeZoneId: "",
    previousZoneId: null,
    inventory: { items: [], maxSize: 60, autoSellNormal: false, autoSellMagic: false } as any,
    equipment: {} as any,
    currencies: {},
    nexus: { maps: [], activeMapId: null, packsCleared: 0, completedTierRewards: [] },
    combat,
    lastSaveTime: 0,
    saveVersion: 4,
    passiveTree: { nodes: [], edges: [], roots: [], allocatedNodes: new Set() } as any,
    gamePhase: "combat" as any,
    activeTrial: null,
    tickCounter: 0,
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

  it("armour mitigation applies to scaled physical damage, not raw base", () => {
    // High increased/more means the unmitigated hit is large; armour should be evaluated against that.
    const char = makeCharacter({
      level: 10,
      basePhysicalDamageMin: 20,
      basePhysicalDamageMax: 20,
      increasedPhysicalDamage: 1.0,
      morePhysicalDamage: 2,
    });
    const monster = makeMonster({ level: 0, armour: 500, life: 10000, maxLife: 10000 });
    const combat = makeCombat(monster);
    const skill = makeSkill({ id: "heavy_strike", tags: ["attack", "physical", "melee"], baseDamageMin: 50, baseDamageMax: 50 });

    const result = skillDamage(char, makeEquippedSkill(skill), skill, monster, 0, combat);

    expect(result.damage).toBeGreaterThan(0);
    expect(Number.isNaN(result.damage)).toBe(false);
    // rawBase  50 * 1.45 = 72; with weapon flat 20 -> physicalPart = 92.
    // unmitigatedPhys = 92 * (1+1) * 2 = 368, so mitigation is evaluated against ~368.
    // Old code evaluated mitigation against rawBase ~72, so damage should be higher now.
    expect(result.damage).toBeGreaterThan(200);
  });

  it("faster_casting support reduces the returned cooldown", () => {
    const char = makeCharacter();
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);
    const skill = makeSkill({ id: "spell", tags: ["spell", "fire"], damageType: "fire", baseDamageMin: 10, baseDamageMax: 10, cooldownTicks: 10 });

    const without = skillDamage(char, makeEquippedSkill(skill), skill, monster, 0, combat);
    const withSupport = skillDamage(char, makeEquippedSkill(skill, ["faster_casting"]), skill, monster, 0, combat);

    expect(without.nextEquipped.cooldownRemaining).toBe(10);
    expect(withSupport.nextEquipped.cooldownRemaining).toBeLessThan(10);
  });

  it("uses physical modifiers for elemental attacks and spell modifiers for elemental spells", () => {
    const attackChar = makeCharacter({ increasedPhysicalDamage: 1.0, increasedSpellDamage: 0 });
    const spellChar = makeCharacter({ increasedPhysicalDamage: 0, increasedSpellDamage: 1.0 });
    const monster = makeCleanMonster();
    const combat = makeCombat(monster);
    const attackSkill = makeSkill({ id: "fire_attack", tags: ["attack", "fire", "melee"], damageType: "fire", baseDamageMin: 100, baseDamageMax: 100 });
    const spellSkill = makeSkill({ id: "fire_spell", tags: ["spell", "fire"], damageType: "fire", baseDamageMin: 100, baseDamageMax: 100 });

    // Attack should scale with increasedPhysicalDamage
    expect(skillDamage(attackChar, makeEquippedSkill(attackSkill), attackSkill, monster, 0, combat).damage).toBe(200);
    // Spell should scale with increasedSpellDamage
    expect(skillDamage(spellChar, makeEquippedSkill(spellSkill), spellSkill, monster, 0, combat).damage).toBe(200);
    // Attack should ignore spell damage
    expect(skillDamage(spellChar, makeEquippedSkill(attackSkill), attackSkill, monster, 0, combat).damage).toBe(100);
    // Spell should ignore physical damage
    expect(skillDamage(attackChar, makeEquippedSkill(spellSkill), spellSkill, monster, 0, combat).damage).toBe(100);
  });

  it("combines multiple support 'more' modifiers multiplicatively", () => {
    const mockSupports = [
      { id: "more_1", name: "", description: "", allowedTags: ["attack" as const], modifiers: [{ stat: "inc_phys_damage_percent" as const, mode: "more" as const, value: 20 }] },
      { id: "more_2", name: "", description: "", allowedTags: ["attack" as const], modifiers: [{ stat: "inc_phys_damage_percent" as const, mode: "more" as const, value: 20 }] },
    ];
    const result = aggregateSupportModifiers(mockSupports, ["more_1", "more_2"], makeCharacter());
    expect(result.more["inc_phys_damage_percent"]).toBeCloseTo(1.44);
  });

  it("gains Momentum on hit when the character has momentum unlocked", () => {
    const skill = makeSkill({ id: "strike", tags: ["attack", "physical", "melee"], baseDamageMin: 10, baseDamageMax: 10 });
    const char = makeCharacter({ special: { momentum: true }, equippedSkills: [makeEquippedSkill(skill)] });
    const monster = makeMonster({ life: 1000, maxLife: 1000 });
    const combat = makeCombat(monster);

    const result = processSkillHits(char, monster, combat);

    expect(result.combat.momentum.stacks).toBeGreaterThan(0);
  });
});

describe("combat simulation regressions", () => {
  it("alwaysHit only affects player attacks, not monster attacks", () => {
    // High player evasion means monster hit chance is at the 5% floor.
    // With alwaysHit bug, monster would still hit. With the fix, a miss roll evades.
    const char = makeCharacter({ special: { alwaysHit: true }, evasion: 10000 });
    const monster = makeMonster({ accuracy: 100 });
    const combat = makeCombat(monster);
    const state = makeGameState(char, combat);

    // Mock random so the monster hit roll is above the 5% floor (miss).
    const randomMock = spyOn(Math, "random").mockReturnValue(0.99);
    const { state: nextState, events } = simulateTick(state);
    randomMock.mockRestore();

    // Monster should have missed, so no damage taken by player from monster hit
    const hitLanded = events.filter(e => e.type === "hitLanded" && e.source === "monster");
    expect(hitLanded.length).toBe(0);
    expect(nextState.character.life).toBe(char.life);
  });

  it("Foreseen Doom delayed ticks reset ES recharge delay", () => {
    // Queue 3 ticks of delayed damage; ES should not recharge while ticks are applied.
    // High evasion prevents the monster from landing hits and resetting the timer itself.
    const char = makeCharacter({
      special: { foreseenDoom: true },
      life: 1000,
      maxLife: 1000,
      evasion: 10000,
      energyShield: 0,
      maxEnergyShield: 100,
      esRecharge: 10,
    });
    const monster = makeMonster({ life: 1000, maxLife: 1000, damage: [{ type: "physical", min: 0, max: 0 }] });
    let combat = makeCombat(monster);
    combat.delayedDamageQueue = [10, 10, 10];
    combat.ticksSinceDamageTaken = 100; // would otherwise allow ES recharge
    const state = makeGameState(char, combat);

    const randomMock = spyOn(Math, "random").mockReturnValue(0.99);

    let current = state;
    for (let i = 0; i < 3; i++) {
      current = simulateTick(current).state;
      // Timer is refreshed by the delayed tick; it should not advance past the first post-damage tick.
      expect(current.combat.ticksSinceDamageTaken).toBeLessThanOrEqual(1);
      expect(current.character.energyShield).toBe(0);
    }

    // After the delayed damage window ends, ES still should not recharge until the configured delay elapses (7.5 ticks at 2.5 tps).
    for (let i = 0; i < 6; i++) {
      current = simulateTick(current).state;
      expect(current.character.energyShield).toBe(0);
    }

    // On the 7th tick after the last delayed damage, ES should start recharging.
    current = simulateTick(current).state;
    expect(current.character.energyShield).toBeGreaterThan(0);

    randomMock.mockRestore();
  });
});

describe("late campaign survivability fixtures", () => {
  function runIncomingDamage(monsterId: string, overrides: Partial<Character>): number {
    const template = MONSTERS[monsterId]
    if (!template) throw new Error(`Missing late-campaign fixture: ${monsterId}`)

    const character = makeCharacter({
      level: template.level,
      life: 100_000,
      maxLife: 100_000,
      evasion: 0,
      equippedSkills: [],
      ...overrides,
    })
    const fixtureMonster = { ...template, life: 1_000_000, maxLife: 1_000_000 }
    const fixtureMember: PackMember = {
      id: `fixture_${monsterId}`,
      monster: fixtureMonster,
      currentLife: fixtureMonster.life,
      maxLife: fixtureMonster.maxLife,
      slot: 0,
    }
    const fixtureCombat: CombatState = {
      ...makeCombat(fixtureMonster),
      currentPack: [fixtureMember],
      monster: fixtureMonster,
      monsterLife: fixtureMonster.life,
    }
    let current = makeGameState(character, fixtureCombat)
    const randomMock = spyOn(Math, "random").mockReturnValue(0)
    try {
      // Ten real simulation ticks smooth out attack cadence while keeping the
      // fixture deterministic and far from player death.
      for (let tick = 0; tick < 10; tick++) {
        current = simulateTick(current).state
      }
      return character.life - current.character.life
    } finally {
      randomMock.mockRestore()
    }
  }

  it("resistance coverage reduces damage from a real Bloodmire elemental threat", () => {
    const uncappedDamage = runIncomingDamage("bloodmire_oracle", {
      resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
    })
    const cappedDamage = runIncomingDamage("bloodmire_oracle", {
      resistances: { fire: 0.75, cold: 0, lightning: 0.75, chaos: 0 },
    })

    expect(uncappedDamage).toBeGreaterThan(cappedDamage)
    expect(uncappedDamage / cappedDamage).toBeGreaterThan(2)
  })

  it("armour reduces damage from the real Shatter Beast outlier", () => {
    const unarmouredDamage = runIncomingDamage("shatter_beast", { armour: 0 })
    const armouredDamage = runIncomingDamage("shatter_beast", { armour: 2_000 })

    expect(unarmouredDamage).toBeGreaterThan(armouredDamage)
    expect(armouredDamage).toBeGreaterThan(0)
  })
})

describe("pack and named-elite system", () => {
  function makeZone(overrides: Partial<Zone> = {}): Zone {
    return {
      id: "test_zone",
      name: "Test Zone",
      act: 1,
      level: 2,
      monsterIds: ["drowned_corsair", "brinewretch"],
      eliteTemplateIds: ["salt_crowned_revenant"],
      eliteChance: 0.08,
      killProgress: 0,
      killsRequired: 10,
      unlocked: true,
      ...overrides,
    } as Zone;
  }

  it("rolls a pack size between 1 and 4 when a new pack starts", () => {
    const zone = makeZone({ eliteChance: 0 });
    const combat = makeCombat();
    for (let i = 0; i < 50; i++) {
      const { combat: nextCombat } = spawnMonster(zone, { ...combat, packSizeRemaining: 0 });
      expect(nextCombat.packSizeRemaining).toBeGreaterThanOrEqual(1);
      expect(nextCombat.packSizeRemaining).toBeLessThanOrEqual(4);
    }
  });

  it("caps named elites at 1 per pack for acts 1-7 and 2 for act 8+", () => {
    const lowActZone = makeZone({ act: 3, level: 20, eliteChance: 1 });
    const highActZone = makeZone({ act: 8, level: 60, eliteChance: 1 });
    const randomMock = spyOn(Math, "random").mockReturnValue(0);

    // Low act: at most 1 named elite per pack.
    const lowResult = spawnMonster(lowActZone, makeCombat());
    const lowElites = lowResult.combat.currentPack.filter(m => m.monster.isNamedElite).length;
    expect(lowElites).toBeLessThanOrEqual(1);

    // High act: at most 2 named elites per pack.
    const highResult = spawnMonster(highActZone, makeCombat());
    const highElites = highResult.combat.currentPack.filter(m => m.monster.isNamedElite).length;
    expect(highElites).toBeLessThanOrEqual(2);

    randomMock.mockRestore();
  });

  it("named elites are drawn from the zone's eliteTemplateIds and are at least magic rarity", () => {
    const zone = makeZone({ eliteTemplateIds: ["salt_crowned_revenant"], eliteChance: 1 });
    const randomMock = spyOn(Math, "random").mockReturnValue(0);
    const combat = makeCombat();
    const result = spawnMonster(zone, { ...combat, packSizeRemaining: 0 });

    expect(result.monster.isNamedElite).toBe(true);
    expect(result.monster.id).toBe("salt_crowned_revenant");
    expect(result.monster.rarity).toMatch(/^(magic|rare)$/);

    randomMock.mockRestore();
  });

  it("does not spawn a named elite when the elite chance roll fails", () => {
    const zone = makeZone({ eliteChance: 0 });
    const combat = makeCombat();
    const result = spawnMonster(zone, { ...combat, packSizeRemaining: 0 });

    expect(result.monster.isNamedElite).toBeFalsy();
    expect(result.monster.rarity).toBe("normal");
  });

  describe("pack advancement", () => {
    function makePackMember(overrides: { id: string; slot: number; monster?: Partial<Monster> }): PackMember {
      const monster = makeMonster({
        id: `mob_${overrides.id}`,
        name: `Mob ${overrides.id}`,
        life: 100,
        maxLife: 100,
        damage: [{ type: "physical" as const, min: 0, max: 0 }],
        ...overrides.monster,
      });
      return {
        id: `member_${overrides.id}`,
        monster,
        currentLife: monster.life,
        maxLife: monster.maxLife,
        slot: overrides.slot,
      };
    }

    it("currentPack shrinks when the active pack member dies", () => {
      const member1 = makePackMember({ id: "a", slot: 0 });
      const member2 = makePackMember({ id: "b", slot: 1 });
      const member3 = makePackMember({ id: "c", slot: 2 });
      const combat: CombatState = {
        ...createCombatState(member1.monster),
        currentPack: [member1, member2, member3],
        monster: member1.monster,
        monsterLife: 0,
      };
      const zone = makeZone({ eliteChance: 0 });
      const state = makeGameState(makeCharacter(), combat);

      const { state: nextState } = simulateTick({ ...state, zones: [zone], activeZoneId: zone.id });

      expect(nextState.combat.currentPack.length).toBe(2);
      expect(nextState.combat.currentPack[0].monster.id).toBe(member2.monster.id);
      expect(nextState.combat.currentPack[0].currentLife).toBe(member2.maxLife);
    });

    it("packCleared fires when the last pack member dies", () => {
      const member = makePackMember({ id: "only", slot: 0 });
      const combat: CombatState = {
        ...createCombatState(member.monster),
        currentPack: [member],
        monster: member.monster,
        monsterLife: 0,
      };
      const zone = makeZone({ eliteChance: 0 });
      const state = makeGameState(makeCharacter(), combat);

      const { events } = simulateTick({ ...state, zones: [zone], activeZoneId: zone.id });

      const clearedEvent = events.find(e => e.type === "packCleared");
      expect(clearedEvent).toBeDefined();
      expect(clearedEvent?.size).toBe(1);
    });

    it("carryover damage applies to the next pack member", () => {
      const member1 = makePackMember({ id: "a", slot: 0 });
      const member2 = makePackMember({ id: "b", slot: 1 });
      const combat: CombatState = {
        ...createCombatState(member1.monster),
        currentPack: [member1, member2],
        monster: member1.monster,
        monsterLife: 0,
        packDamageCarryover: 50,
      };
      const zone = makeZone({ eliteChance: 0 });
      const state = makeGameState(makeCharacter(), combat);

      const { state: nextState } = simulateTick({ ...state, zones: [zone], activeZoneId: zone.id });

      expect(nextState.combat.currentPack.length).toBe(1);
      expect(nextState.combat.currentPack[0].monster.id).toBe(member2.monster.id);
      expect(nextState.combat.currentPack[0].currentLife).toBe(member2.maxLife - 50);
    });
  });
});

describe("skill range bands (pack multi-hit)", () => {
  function makeZone(overrides: Partial<Zone> = {}): Zone {
    return {
      id: "test_zone",
      name: "Test Zone",
      act: 1,
      level: 2,
      monsterIds: ["drowned_corsair"],
      eliteTemplateIds: [],
      eliteChance: 0,
      killProgress: 0,
      killsRequired: 10,
      unlocked: true,
      ...overrides,
    } as Zone;
  }

  function makePackMember(overrides: { id: string; slot: number; monster?: Partial<Monster> }): PackMember {
    const monster = makeMonster({
      id: `mob_${overrides.id}`,
      name: `Mob ${overrides.id}`,
      level: 0,
      life: 1000,
      maxLife: 1000,
      armour: 0,
      damage: [{ type: "physical" as const, min: 0, max: 0 }],
      ...overrides.monster,
    });
    return {
      id: `member_${overrides.id}`,
      monster,
      currentLife: monster.life,
      maxLife: monster.maxLife,
      slot: overrides.slot,
    };
  }

  // Equips a real skill id (band tags live on the actual data in src/data/skills.ts).
  function makeBandState(skillId: string) {
    const members = [0, 1, 2, 3].map(i => makePackMember({ id: `m${i}`, slot: i }));
    const char = makeCharacter({
      special: { alwaysHit: true },
      criticalChance: 0,
      evasion: 10000,
      equippedSkills: [{ skillId, supportIds: [], cooldownRemaining: 0, hitCounter: 0 }],
    });
    const combat: CombatState = {
      ...createCombatState(members[0].monster),
      currentPack: members,
      monster: members[0].monster,
      monsterLife: members[0].maxLife,
    };
    const zone = makeZone({ eliteChance: 0 });
    return { state: makeGameState(char, combat), zone };
  }

  function tickBand(skillId: string): PackMember[] {
    const { state, zone } = makeBandState(skillId);
    const randomMock = spyOn(Math, "random").mockReturnValue(0.5);
    const { state: nextState } = simulateTick({ ...state, zones: [zone], activeZoneId: zone.id });
    randomMock.mockRestore();
    return nextState.combat.currentPack;
  }

  it("rangeBandHitCount maps bands to front-to-back target counts", () => {
    const packSize = 4;
    expect(rangeBandHitCount(makeSkill({ tags: ["melee"] }), packSize)).toBe(1);
    expect(rangeBandHitCount(makeSkill({ tags: ["nearRange"] }), packSize)).toBe(2);
    expect(rangeBandHitCount(makeSkill({ tags: ["farRange"] }), packSize)).toBe(3);
    expect(rangeBandHitCount(makeSkill({ tags: ["allRange"] }), packSize)).toBe(packSize);
    // AoE is capped at the live pack size
    expect(rangeBandHitCount(makeSkill({ tags: ["allRange"] }), 2)).toBe(2);
  });

  it("melee band (Heavy Strike) damages only the front pack member", () => {
    const pack = tickBand("strike");
    expect(pack[0].currentLife).toBeLessThan(pack[0].maxLife);
    expect(pack[1].currentLife).toBe(pack[1].maxLife);
    expect(pack[2].currentLife).toBe(pack[2].maxLife);
    expect(pack[3].currentLife).toBe(pack[3].maxLife);
  });

  it("nearRange band (Essence Drain) damages the front two pack members", () => {
    const pack = tickBand("essence_drain");
    expect(pack[0].currentLife).toBeLessThan(pack[0].maxLife);
    expect(pack[1].currentLife).toBeLessThan(pack[1].maxLife);
    expect(pack[2].currentLife).toBe(pack[2].maxLife);
    expect(pack[3].currentLife).toBe(pack[3].maxLife);
  });

  it("farRange band (Firebolt) damages the front three pack members", () => {
    const pack = tickBand("firebolt");
    expect(pack[0].currentLife).toBeLessThan(pack[0].maxLife);
    expect(pack[1].currentLife).toBeLessThan(pack[1].maxLife);
    expect(pack[2].currentLife).toBeLessThan(pack[2].maxLife);
    expect(pack[3].currentLife).toBe(pack[3].maxLife);
  });

  it("allRange band (Ice Nova) damages the whole pack", () => {
    const pack = tickBand("ice_nova");
    expect(pack.every(m => m.currentLife < m.maxLife)).toBe(true);
  });

  it("emits a bandHit log event when a skill hits multiple pack members", () => {
    const { state, zone } = makeBandState("firebolt");
    const randomMock = spyOn(Math, "random").mockReturnValue(0.5);
    const { events } = simulateTick({ ...state, zones: [zone], activeZoneId: zone.id });
    randomMock.mockRestore();

    const bandHits = events.filter(e => e.type === "bandHit");
    expect(bandHits.length).toBe(1);
    expect(bandHits[0]).toMatchObject({ type: "bandHit", skillName: "Firebolt", targetCount: 3 });
  });

  it("does not emit a bandHit event for a single-target skill", () => {
    const { state, zone } = makeBandState("strike");
    const randomMock = spyOn(Math, "random").mockReturnValue(0.5);
    const { events } = simulateTick({ ...state, zones: [zone], activeZoneId: zone.id });
    randomMock.mockRestore();

    expect(events.filter(e => e.type === "bandHit").length).toBe(0);
  });
});
