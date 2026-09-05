import { describe, it, expect, spyOn } from "bun:test";
import {
  NEXUS_BASE_LEVEL,
  NEXUS_BASE_PACKS,
  NEXUS_LEVEL_STEP,
  NEXUS_MAX_TIER,
  NEXUS_MONSTER_POOL,
  NEXUS_TIER_REWARD_MILESTONES,
  SOVEREIGN_MONSTER_ID,
  SOVEREIGN_RIFT_CRYSTAL_REWARD,
  SOVEREIGN_ZONE_ID,
  grantSovereignUnlock,
  nexusTierCompletionRewardForTier,
  clampNexusTier,
  createNexusMap,
  isNexusZoneId,
  nexusMapChargesForTier,
  nexusMapCrystalCost,
  nexusMapPacksForTier,
  nexusTierLevel,
  nexusZoneForMap,
  nexusZoneIdForMap,
  recordNexusPackClear,
  riftCrystalRewardForBoss,
} from "./nexus.ts";
import { aggregateMapAffixEffects, mapAffixCountForTier, mapAffixDescription, rollMapAffixes } from "../data/mapAffixes.ts";
import { createCombatState, spawnMonster } from "./combat.ts";
import type { Monster, NexusMap, NexusState, Zone } from "../types/game.ts";
import { MONSTERS } from "../data/monsters.ts";
import { ZONES } from "../data/zones.ts";
import { MONSTERS as MONSTER_DATA } from "../data/monsters.ts";

// --- Fixtures ---

function makeMap(overrides: Partial<NexusMap> = {}): NexusMap {
  return {
    id: "map_test_1",
    tier: 1,
    monsterLevel: NEXUS_BASE_LEVEL,
    affixes: [],
    maxCharges: 1,
    currentCharges: 1,
    createdAt: 1234,
    ...overrides,
  };
}

function makeNexus(overrides: Partial<NexusState> = {}): NexusState {
  return {
    maps: [],
    activeMapId: null,
    packsCleared: 0,
    completedTierRewards: [],
    sovereignUnlocked: false,
    ...overrides,
  };
}

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "m1",
    name: "Test Monster",
    level: 1,
    life: 100,
    maxLife: 100,
    damage: [{ type: "physical", min: 1, max: 2 }],
    attackRate: 1,
    accuracy: 100,
    evasion: 0,
    experienceReward: 10,
    goldReward: 10,
    rarity: "normal",
    ...overrides,
  };
}

// --- clampNexusTier ---

describe("clampNexusTier", () => {
  it("returns valid tiers unchanged", () => {
    expect(clampNexusTier(1)).toBe(1);
    expect(clampNexusTier(8)).toBe(8);
    expect(clampNexusTier(NEXUS_MAX_TIER)).toBe(NEXUS_MAX_TIER);
  });

  it("clamps below-tier values to 1", () => {
    expect(clampNexusTier(0)).toBe(1);
    expect(clampNexusTier(-5)).toBe(1);
  });

  it("clamps above-tier values to NEXUS_MAX_TIER", () => {
    expect(clampNexusTier(99)).toBe(NEXUS_MAX_TIER);
    expect(clampNexusTier(Number.POSITIVE_INFINITY)).toBe(NEXUS_MAX_TIER);
  });

  it("floors fractional tiers", () => {
    expect(clampNexusTier(4.9)).toBe(4);
    expect(clampNexusTier(1.5)).toBe(1);
  });

  it("returns 1 for NaN and non-numeric input", () => {
    expect(clampNexusTier(Number.NaN)).toBe(1);
    expect(clampNexusTier(undefined as unknown as number)).toBe(1);
  });
});

// --- Tier helpers ---

describe("nexus tier curves", () => {
  it("nexusTierLevel derives monster level from tier", () => {
    expect(nexusTierLevel(1)).toBe(NEXUS_BASE_LEVEL);
    expect(nexusTierLevel(2)).toBe(NEXUS_BASE_LEVEL + NEXUS_LEVEL_STEP);
    expect(nexusTierLevel(NEXUS_MAX_TIER)).toBe(NEXUS_BASE_LEVEL + (NEXUS_MAX_TIER - 1) * NEXUS_LEVEL_STEP);
  });

  it("nexusMapChargesForTier gives one charge per tier", () => {
    expect(nexusMapChargesForTier(1)).toBe(1);
    expect(nexusMapChargesForTier(5)).toBe(5);
  });

  it("nexusMapPacksForTier scales with tier", () => {
    expect(nexusMapPacksForTier(1)).toBe(NEXUS_BASE_PACKS + 1);
    expect(nexusMapPacksForTier(3)).toBe(NEXUS_BASE_PACKS + 3);
  });

  it("nexusMapCrystalCost matches the tier", () => {
    expect(nexusMapCrystalCost(1)).toBe(1);
    expect(nexusMapCrystalCost(7)).toBe(7);
  });
});

// --- createNexusMap ---

describe("createNexusMap", () => {
  it("creates a valid map with tier-derived level and charges", () => {
    const map = createNexusMap(3);
    expect(map.tier).toBe(3);
    expect(map.monsterLevel).toBe(nexusTierLevel(3));
    expect(map.maxCharges).toBe(3);
    expect(map.currentCharges).toBe(map.maxCharges);
    expect(map.createdAt).toBeGreaterThan(0);
  });

  it("rolls Stage 2 affixes when a map is created", () => {
    const map = createNexusMap(2);
    expect(map.affixes).toHaveLength(mapAffixCountForTier(2));
    expect(map.affixes.every(affix => affix.value > 0)).toBe(true);
  });

  it("clamps requested tiers into the valid range", () => {
    expect(createNexusMap(0).tier).toBe(1);
    expect(createNexusMap(0).monsterLevel).toBe(NEXUS_BASE_LEVEL);
    expect(createNexusMap(99).tier).toBe(NEXUS_MAX_TIER);
    expect(createNexusMap(99).monsterLevel).toBe(nexusTierLevel(NEXUS_MAX_TIER));
  });

  it("generates unique ids across creations", () => {
    const a = createNexusMap(1).id;
    const b = createNexusMap(1).id;
    expect(a).not.toBe(b);
  });
});

// --- Stage 2 map affixes ---

describe("Nexus map affixes", () => {
  it("rolls the correct number of affixes by map tier without duplicate groups", () => {
    expect(rollMapAffixes(1, () => 0)).toHaveLength(1);
    const highTier = rollMapAffixes(16, () => 0);
    expect(highTier).toHaveLength(4);
    expect(new Set(highTier.map(affix => affix.id)).size).toBe(highTier.length);
  });

  it("aggregates map effects as multiplicative monster modifiers and additive rewards", () => {
    const effects = aggregateMapAffixEffects([
      { id: "fortified", tier: 1, value: 20 },
      { id: "bloodied", tier: 1, value: 10 },
      { id: "overflowing", tier: 1, value: 25 },
      { id: "resonant", tier: 1, value: 30 },
    ]);
    expect(effects.monsterLifeMultiplier).toBe(1.2);
    expect(effects.monsterDamageMultiplier).toBe(1.1);
    expect(effects.extraDropChance).toBe(0.25);
    expect(effects.riftCrystalChance).toBe(0.3);
  });

  it("renders a useful description for rolled affixes", () => {
    expect(mapAffixDescription({ id: "quickened", tier: 1, value: 15 })).toBe("Monsters have 15% increased Attack Speed.");
  });

  it("applies map life modifiers when Nexus monsters spawn", () => {
    const template = MONSTER_DATA["tidecaller"];
    if (!template) throw new Error("Expected tidecaller fixture");
    const plainZone = {
      id: "plain_map",
      name: "The Nexus",
      act: 9,
      level: 66,
      monsterIds: ["tidecaller"],
      eliteChance: 0,
      killProgress: 0,
      killsRequired: 1,
      unlocked: true,
    } satisfies Zone;
    const fortifiedZone = {
      ...plainZone,
      id: "fortified_map",
      mapAffixes: [{ id: "fortified", tier: 1, value: 20 }],
    } satisfies Zone;
    const randomMock = spyOn(Math, "random").mockReturnValue(0.99);
    const plain = spawnMonster(plainZone, createCombatState(template)).monster;
    const fortified = spawnMonster(fortifiedZone, createCombatState(template)).monster;
    randomMock.mockRestore();
    expect(fortified.maxLife).toBe(Math.floor(plain.maxLife * 1.2));
  });
});

// --- recordNexusPackClear ---

describe("Nexus Stage 3 tier rewards", () => {
  it("defines the approved milestone curve", () => {
    expect(NEXUS_TIER_REWARD_MILESTONES).toEqual([
      { tier: 5, amount: 5 },
      { tier: 10, amount: 10 },
      { tier: 15, amount: 15 },
      { tier: 16, amount: 16 },
    ])
    expect(nexusTierCompletionRewardForTier(4)).toBe(0)
    expect(nexusTierCompletionRewardForTier(5)).toBe(5)
    expect(nexusTierCompletionRewardForTier(16)).toBe(16)
  })

  it("awards a milestone only once across repeated map clears", () => {
    const tier = 5
    const requiredPacks = nexusMapPacksForTier(tier)
    const map = makeMap({ id: "milestone_map", tier, maxCharges: 2, currentCharges: 2 })
    const first = recordNexusPackClear(makeNexus({
      maps: [map],
      activeMapId: map.id,
      packsCleared: requiredPacks - 1,
    }))

    expect(first.riftCrystalReward).toBe(5)
    expect(first.completedTier).toBe(5)
    expect(first.nexus.completedTierRewards).toEqual([5])

    const second = recordNexusPackClear(makeNexus({
      maps: first.nexus.maps,
      activeMapId: map.id,
      packsCleared: requiredPacks - 1,
      completedTierRewards: first.nexus.completedTierRewards,
    }))
    expect(second.riftCrystalReward).toBe(0)
    expect(second.completedTier).toBeNull()
    expect(second.nexus.completedTierRewards).toEqual([5])
  })
})

// --- Stage 4: the Primeval Sovereign (pinnacle boss arena) ---

describe("Nexus Stage 4 Primeval Sovereign", () => {
  it("defines the approved pinnacle constants and data", () => {
    expect(SOVEREIGN_MONSTER_ID).toBe("primeval_sovereign");
    expect(SOVEREIGN_ZONE_ID).toBe("primeval_sanctum");
    expect(SOVEREIGN_RIFT_CRYSTAL_REWARD).toBe(25);

    const sanctum = ZONES.find(zone => zone.id === SOVEREIGN_ZONE_ID);
    expect(sanctum).toBeDefined();
    expect(sanctum!.unlocked).toBe(false); // locked until the first T16 clear
    expect(sanctum!.monsterIds).toEqual([SOVEREIGN_MONSTER_ID]);
    expect(sanctum!.killsRequired).toBe(1);

    const boss = MONSTERS[SOVEREIGN_MONSTER_ID];
    expect(boss?.rarity).toBe("boss");
    // Approved design: two phase thresholds at 50% and 25% life.
    expect(boss?.phases?.map(phase => phase.healthPercent)).toEqual([0.5, 0.25]);
  });

  it("grants the pinnacle arena permanently on the first T16 clear", () => {
    const zones = ZONES.map(zone => ({ ...zone }));
    const result = grantSovereignUnlock(makeNexus(), zones);

    expect(result.unlocked).toBe(true);
    expect(result.nexus.sovereignUnlocked).toBe(true);
    const sanctum = result.zones.find(zone => zone.id === SOVEREIGN_ZONE_ID);
    expect(sanctum?.unlocked).toBe(true);
    // Other zones are untouched.
    expect(result.zones.filter(zone => zone.id !== SOVEREIGN_ZONE_ID && zone.unlocked))
      .toEqual(zones.filter(zone => zone.id !== SOVEREIGN_ZONE_ID && zone.unlocked));
  });

  it("is idempotent — repeat T16 clears do not re-grant", () => {
    const nexus = makeNexus({ sovereignUnlocked: true });
    const result = grantSovereignUnlock(nexus, ZONES);
    expect(result.unlocked).toBe(false);
    expect(result.nexus).toBe(nexus);
    expect(result.zones).toBe(ZONES);
  });

  it("completing a T16 map reports tier 16 for the unlock hook and keeps the milestone payout", () => {
    const tier = NEXUS_MAX_TIER;
    const requiredPacks = nexusMapPacksForTier(tier);
    const map = makeMap({ id: "pinnacle_map", tier, maxCharges: 1, currentCharges: 1 });
    const result = recordNexusPackClear(makeNexus({
      maps: [map],
      activeMapId: map.id,
      packsCleared: requiredPacks - 1,
    }));

    expect(result.mapCompleted).toBe(true);
    expect(result.completedTier).toBe(NEXUS_MAX_TIER);
    expect(result.riftCrystalReward).toBe(16); // Stage 3 T16 milestone unchanged
  });
})

describe("recordNexusPackClear", () => {
  it("returns unchanged when no map is active", () => {
    const nexus = makeNexus({ maps: [makeMap()], packsCleared: 2 });
    const result = recordNexusPackClear(nexus);
    expect(result.mapCompleted).toBe(false);
    expect(result.nexus).toEqual(nexus);
  });

  it("clears the active map when it is missing from the stash", () => {
    const nexus = makeNexus({ maps: [], activeMapId: "ghost_map", packsCleared: 1 });
    const result = recordNexusPackClear(nexus);
    expect(result.mapCompleted).toBe(false);
    expect(result.nexus.activeMapId).toBeNull();
    expect(result.nexus.packsCleared).toBe(0);
  });

  it("clears the active map when it has no charges left", () => {
    const map = makeMap({ id: "used_up", currentCharges: 0, maxCharges: 2 });
    const nexus = makeNexus({ maps: [map], activeMapId: "used_up", packsCleared: 0 });
    const result = recordNexusPackClear(nexus);
    expect(result.mapCompleted).toBe(false);
    expect(result.nexus.activeMapId).toBeNull();
    expect(result.nexus.packsCleared).toBe(0);
  });

  it("increments packsCleared without spending a charge on partial progress", () => {
    const map = makeMap({ id: "m1", tier: 3, maxCharges: 3, currentCharges: 3 });
    const nexus = makeNexus({ maps: [map], activeMapId: "m1", packsCleared: 0 });
    const result = recordNexusPackClear(nexus);
    expect(result.mapCompleted).toBe(false);
    expect(result.nexus.packsCleared).toBe(1);
    // Charge untouched until the full pack count is cleared.
    expect(result.nexus.maps[0].currentCharges).toBe(3);
  });

  it("completes a map and spends one charge after the required pack count", () => {
    const tier = 3;
    const requiredPacks = nexusMapPacksForTier(tier);
    const map = makeMap({ id: "m1", tier, maxCharges: 3, currentCharges: 3 });
    let nexus = makeNexus({ maps: [map], activeMapId: "m1", packsCleared: requiredPacks - 1 });

    const result = recordNexusPackClear(nexus);
    expect(result.mapCompleted).toBe(true);
    expect(result.nexus.activeMapId).toBeNull();
    expect(result.nexus.packsCleared).toBe(0);
    // Charge consumed, map remains in the stash while charges remain.
    expect(result.nexus.maps[0].currentCharges).toBe(2);
    expect(result.nexus.maps[0].maxCharges).toBe(3);
  });

  it("removes the map from the stash when the last charge is spent", () => {
    const map = makeMap({ id: "m1", tier: 1, maxCharges: 1, currentCharges: 1 });
    const nexus = makeNexus({ maps: [map], activeMapId: "m1", packsCleared: nexusMapPacksForTier(1) - 1 });

    const result = recordNexusPackClear(nexus);
    expect(result.mapCompleted).toBe(true);
    expect(result.nexus.maps).toEqual([]);
  });

  it("supports consecutive full clears across charges", () => {
    const tier = 2;
    const requiredPacks = nexusMapPacksForTier(tier);
    const map = makeMap({ id: "m1", tier, maxCharges: 2, currentCharges: 2 });
    let nexus = makeNexus({ maps: [map], activeMapId: "m1", packsCleared: requiredPacks - 1 });

    // First clear: charge 2 -> 1, map stays.
    const first = recordNexusPackClear(nexus);
    expect(first.mapCompleted).toBe(true);
    expect(first.nexus.maps[0].currentCharges).toBe(1);

    // Re-enter and clear again: last charge spent, map removed.
    nexus = makeNexus({
      maps: first.nexus.maps,
      activeMapId: "m1",
      packsCleared: requiredPacks - 1,
    });
    const second = recordNexusPackClear(nexus);
    expect(second.mapCompleted).toBe(true);
    expect(second.nexus.maps).toEqual([]);
  });
});

// --- nexusZoneForMap ---

describe("nexusZoneForMap", () => {
  it("constructs a zone from the map's monster level and tier", () => {
    const map = makeMap({ id: "m1", tier: 4, monsterLevel: 81 });
    const zone = nexusZoneForMap(map);

    expect(zone.id).toBe(nexusZoneIdForMap(map));
    expect(zone.name).toBe("The Nexus");
    expect(zone.act).toBe(9);
    expect(zone.level).toBe(81);
    expect(zone.killProgress).toBe(0);
    expect(zone.unlocked).toBe(true);
    expect(zone.killsRequired).toBe(nexusMapPacksForTier(4));
  });

  it("uses the non-boss campaign monster pool", () => {
    const map = makeMap();
    const zone = nexusZoneForMap(map);
    expect(zone.monsterIds).toEqual(NEXUS_MONSTER_POOL);
    expect(zone.monsterIds.length).toBeGreaterThan(0);
  });

  it("never includes bosses in the nexus monster pool", () => {
    for (const id of NEXUS_MONSTER_POOL) {
      expect(MONSTERS[id]?.rarity).not.toBe("boss");
    }
  });

  it("only draws pool monsters from campaign zone pools", () => {
    const campaignIds = new Set(ZONES.flatMap(z => z.monsterIds));
    for (const id of NEXUS_MONSTER_POOL) {
      expect(campaignIds.has(id)).toBe(true);
    }
  });
});

// --- Zone id helpers ---

describe("nexus zone id helpers", () => {
  it("round-trips map ids through zone ids", () => {
    const map = makeMap({ id: "abc" });
    const zoneId = nexusZoneIdForMap(map);
    expect(zoneId).toBe("nexus_map_abc");
    expect(isNexusZoneId(zoneId)).toBe(true);
    expect(isNexusZoneId("shattered_coast")).toBe(false);
    expect(isNexusZoneId("blighted_nexus")).toBe(false);
  });

  it("identifies campaign zones that merely contain the word nexus as non-map zones", () => {
    // The Act 7 campaign zone 'blighted_nexus' is not a generated map zone.
    expect(isNexusZoneId("blighted_nexus")).toBe(false);
  });
});

// --- riftCrystalRewardForBoss ---

describe("riftCrystalRewardForBoss", () => {
  function makeAct8BossZone(): Zone {
    return {
      id: "final_verdict",
      name: "Aurelius, the Arbiter",
      act: 8,
      level: 65,
      monsterIds: ["aurelius_arbiter"],
      eliteChance: 0,
      killProgress: 0,
      killsRequired: 1,
      unlocked: true,
    };
  }

  it("awards one crystal for the Act 8 boss", () => {
    const zone = makeAct8BossZone();
    const boss = makeMonster({ rarity: "boss" });
    expect(riftCrystalRewardForBoss(zone, boss)).toBe(1);
  });

  it("awards nothing for Act 8 non-boss kills", () => {
    const zone = makeAct8BossZone();
    expect(riftCrystalRewardForBoss(zone, makeMonster({ rarity: "normal" }))).toBe(0);
    expect(riftCrystalRewardForBoss(zone, makeMonster({ rarity: "rare" }))).toBe(0);
  });

  it("awards nothing for bosses outside Act 8", () => {
    const act1Zone = { ...makeAct8BossZone(), act: 1, id: "ruined_bastion" };
    expect(riftCrystalRewardForBoss(act1Zone, makeMonster({ rarity: "boss" }))).toBe(0);
  });

  it("awards nothing when the zone is a nexus map or missing", () => {
    const map = makeMap();
    const mapZone = nexusZoneForMap(map);
    expect(riftCrystalRewardForBoss(mapZone, makeMonster({ rarity: "boss" }))).toBe(0);
    expect(riftCrystalRewardForBoss(undefined, makeMonster({ rarity: "boss" }))).toBe(0);
  });
});
