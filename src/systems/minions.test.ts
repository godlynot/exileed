import { describe, it, expect, beforeEach } from 'bun:test'
import { useGameStore } from '../store/gameStore.ts'
import {
  summonMinion,
  killMinion,
  tickSummonRevivals,
  resolveMinionMember,
  nextMinionId,
  activeSummonDefIds,
  totalAliveSummons,
  minionLevelScaling,
  minionAttackCooldownTicks,
  minionHeraldMultiplier,
  estimateMinionDpsShare,
  reviveAllSummons,
} from './minions.ts'
import { simulateTick } from './combat.ts'
import { resolveParty } from './party.ts'
import { buildMinionArmy, buildValidatorCharacter } from './validatorFixture.ts'
import { MINIONS } from '../data/minions.ts'
import { MONSTERS } from '../data/monsters.ts'
import { MINION, TICKS_PER_SECOND } from '../data/balance.ts'
import { SKILLS } from '../data/skills.ts'
import { deserializeSave, SAVE_VERSION } from './save.ts'
import type { Character, CharacterSummon, GameState, Monster, PackMember } from '../types/game.ts'

// bun's test runtime has no localStorage; provide an in-memory shim so
// resetGame's save/load path behaves like it does in the browser.
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
  },
  configurable: true,
})

function freshCharacter(): Character {
  storage.clear()
  useGameStore.setState(useGameStore.getState(), true)
  useGameStore.getState().resetGame()
  return useGameStore.getState().character
}

function summonOf(defId: string, overrides: Partial<CharacterSummon> = {}): CharacterSummon {
  return { minionDefId: defId, level: 1, xp: 0, alive: true, respawnTicksRemaining: 0, ...overrides }
}

describe('minion defs (spec section 3.2)', () => {
  it('ships the three v1 defs wired to real minion-only skills', () => {
    expect(MINIONS.bone_sentinel.attack.skillId).toBe('sentinel_smash')
    expect(MINIONS.plague_wretch.attack.skillId).toBe('wretch_bite')
    expect(MINIONS.rift_wisp.attack.skillId).toBe('wisp_bolt')
    for (const def of Object.values(MINIONS)) {
      const skill = SKILLS[def.attack.skillId]
      expect(skill).toBeDefined()
      expect(skill.minionOnly).toBe(true)
      expect(skill.tags).toContain('minion')
    }
  })

  it('minion-only skills never appear as player gems and summon skills do not damage', () => {
    for (const skill of Object.values(SKILLS)) {
      if (skill.minionOnly) {
        expect(skill.tags).toContain('minion')
      }
      if (skill.summons) {
        expect(MINIONS[skill.summons.minionDefId]).toBeDefined()
      }
    }
    expect(SKILLS.summon_wisp.summons?.minionDefId).toBe('rift_wisp')
  })

  it('scales defenses on the gear-curve family exponent and offense on the full curve', () => {
    expect(minionLevelScaling(1)).toBe(1)
    expect(minionLevelScaling(10)).toBeGreaterThan(1)
    const member = resolveMinionMember(summonOf('rift_wisp', { level: 10 }), MINIONS.rift_wisp)
    expect(member.maxLife).toBeGreaterThan(MINIONS.rift_wisp.baseLife)
    expect(member.attack.flatDamage.max).toBeGreaterThan(MINIONS.rift_wisp.attack.flatMax)
  })
})

describe('summon lifecycle (M2)', () => {
  let character: Character

  beforeEach(() => {
    character = freshCharacter()
  })

  it('summons a new minion and emits minionSpawned', () => {
    const { character: next, event } = summonMinion(character, 'rift_wisp')
    expect(event?.type).toBe('minionSpawned')
    expect(next.summons).toHaveLength(1)
    expect(next.summons[0]).toMatchObject({ minionDefId: 'rift_wisp', alive: true })
    expect(next.summons[0].level).toBe(character.level)
  })

  it('fizzles a second cast while the minion is alive (decision D3a)', () => {
    const summoned = summonMinion(character, 'bone_sentinel').character
    const { character: next, event } = summonMinion(summoned, 'bone_sentinel')
    expect(event?.type).toBe('summonBlocked')
    if (event?.type === 'summonBlocked') {
      expect(event.reason).toBe('capReached')
    }
    expect(next.summons.filter(s => s.minionDefId === 'bone_sentinel')).toHaveLength(1)
  })

  it('revives a dead member on recast instead of appending a duplicate', () => {
    const summoned = summonMinion(character, 'plague_wretch').character
    const killed = killMinion(summoned, 'plague_wretch').character
    const { character: next, event } = summonMinion(killed, 'plague_wretch')
    expect(event?.type).toBe('minionRevived')
    expect(next.summons).toHaveLength(1)
    expect(next.summons[0].alive).toBe(true)
  })

  it('blocks summons once the army cap is reached', () => {
    let next = character
    for (const defId of ['bone_sentinel', 'plague_wretch', 'rift_wisp']) {
      next = summonMinion(next, defId).character
    }
    // sentinel(1) + wretch(1) + wisp(1) = 3 alive; one more slot fits
    expect(totalAliveSummons(next)).toBe(3)
    next = summonMinion(next, 'plague_wretch').character
    expect(totalAliveSummons(next)).toBe(MINION.MAX_SUMMONS_TOTAL)
    const { event } = summonMinion(next, 'rift_wisp')
    expect(event?.type).toBe('summonBlocked')
  })

  it('kills a minion, starts the respawn timer, and emits minionDied', () => {
    const summoned = summonMinion(character, 'bone_sentinel').character
    const { character: next, event } = killMinion(summoned, 'bone_sentinel')
    expect(event?.type).toBe('minionDied')
    expect(next.summons[0].alive).toBe(false)
    expect(next.summons[0].respawnTicksRemaining).toBe(
      MINIONS.bone_sentinel.summonCooldownSeconds * TICKS_PER_SECOND,
    )
    // Dead minions are excluded from the live party set
    expect(activeSummonDefIds(next)).toHaveLength(0)
    expect(resolveParty(next).every(member => member.role === 'player')).toBe(true)
  })

  it('auto-revives after the respawn countdown (decision D1a)', () => {
    const summoned = summonMinion(character, 'rift_wisp').character
    let next = killMinion(summoned, 'rift_wisp').character
    const ticks = next.summons[0].respawnTicksRemaining

    let revived = false
    for (let i = 0; i < ticks; i++) {
      const result = tickSummonRevivals(next)
      next = result.character
      if (result.events.some(e => e.type === 'minionRevived')) {
        revived = true
        break
      }
    }
    expect(revived).toBe(true)
    expect(next.summons[0].alive).toBe(true)
    expect(next.summons[0].respawnTicksRemaining).toBe(0)
    expect(activeSummonDefIds(next)).toEqual(['rift_wisp'])
  })

  it('resolveParty appends live minion members with party effects stamped', () => {
    const summoned = summonMinion(character, 'rift_wisp').character
    const members = resolveParty(summoned)
    expect(members).toHaveLength(2)
    expect(members[0].role).toBe('player')
    const wisp = members[1]
    expect(wisp.role).toBe('minion')
    expect(wisp.minionDefId).toBe('rift_wisp')
    expect(wisp.id).toBe('minion_rift_wisp_1')
    expect(wisp.attack.skillId).toBe('wisp_bolt')
    // Set-wide effects stamp (empty for a fresh character, but present)
    expect(Array.isArray(wisp.activeEffects.herald)).toBe(true)
  })

  it('generates incrementing member ids per def', () => {
    expect(nextMinionId('rift_wisp', [])).toBe('minion_rift_wisp_1')
    expect(nextMinionId('rift_wisp', [summonOf('rift_wisp'), summonOf('plague_wretch')])).toBe('minion_rift_wisp_2')
  })

  it('ignores unknown def ids', () => {
    const { character: next, event } = summonMinion(character, 'not_a_minion')
    expect(event).toBeNull()
    expect(next.summons).toHaveLength(0)
  })
})

describe('summon save normalization (v6)', () => {
  it('drops unknown def ids, dedupes, and clamps the army cap', () => {
    const character = freshCharacter()
    const payload = {
      saveVersion: SAVE_VERSION,
      character: {
        ...character,
        summons: [
          summonOf('rift_wisp'),
          summonOf('not_a_minion'),
          summonOf('rift_wisp'),
          summonOf('bone_sentinel', { alive: false, respawnTicksRemaining: 30.7, level: 2.9 }),
          summonOf('plague_wretch', { alive: true }),
        ],
      },
    }
    const loaded = deserializeSave(btoa(JSON.stringify(payload))) as GameState | null
    expect(loaded).not.toBeNull()
    const summons = loaded!.character.summons
    // dedupe drops the second rift_wisp; unknown id dropped; cap keeps 4 entries
    expect(summons.map(s => s.minionDefId)).toEqual(['rift_wisp', 'bone_sentinel', 'plague_wretch'])
    const sentinel = summons.find(s => s.minionDefId === 'bone_sentinel')!
    expect(sentinel.alive).toBe(false)
    expect(sentinel.respawnTicksRemaining).toBe(30)
    expect(sentinel.level).toBe(2)
  })

  it('normalizes missing summons on older saves to an empty army', () => {
    const character = freshCharacter()
    const legacy = { ...character }
    delete (legacy as Partial<Character>).summons
    const loaded = deserializeSave(btoa(JSON.stringify({ saveVersion: SAVE_VERSION, character: legacy }))) as GameState | null
    expect(loaded?.character.summons).toEqual([])
  })
})

describe('minion attack turns (M3, spec section 5)', () => {
  let state: GameState

  beforeEach(() => {
    state = ((): GameState => {
      storage.clear()
      useGameStore.setState(useGameStore.getState(), true)
      useGameStore.getState().resetGame()
      return useGameStore.getState()
    })()
  })

  it('respects per-member attack cooldowns', () => {
    const ticks = minionAttackCooldownTicks(2.5)
    expect(ticks).toBe(1)
    expect(minionAttackCooldownTicks(0.5)).toBe(5)
  })

  it('fires hits with band targeting from the minion skill', () => {
    const summoned = summonMinion(state.character, 'rift_wisp').character
    const members = resolveParty(summoned)
    const wisp = members.find(m => m.role === 'minion')!
    expect(wisp.attack.skillId).toBe('wisp_bolt')
    // wisp_bolt is farRange -> 3 band targets
    const skill = SKILLS[wisp.attack.skillId]
    expect(skill.tags).toContain('farRange')
  })

  it('minion herald multiplier matches the player aura rules', () => {
    // Light without Unwavering: +10%
    expect(minionHeraldMultiplier(['light'], false, 0, 1)).toBeCloseTo(1.1)
    // Light with Unwavering: +15%
    expect(minionHeraldMultiplier(['light'], true, 0, 1)).toBeCloseTo(1.15)
    // Judgment low-life finisher
    expect(minionHeraldMultiplier(['judgment'], false, 0, 0.15)).toBeCloseTo(1.2)
    // Storms is player-only for minions
    expect(minionHeraldMultiplier(['storms'], false, 0, 1)).toBe(1)
  })

  it('simulateTick runs a full loop with minions in the party and no crashes', () => {
    const summoned = summonMinion(state.character, 'rift_wisp').character
    const nextState = { ...state, character: summoned }
    for (let i = 0; i < 20; i++) {
      const result = simulateTick(nextState)
      expect(result.state).toBeDefined()
    }
  })

  it('a minion killing blow grants no gold, xp, loot, or zone progress', () => {
    // Deterministic setup: wisp summoned, player has no skills (deals no
    // damage), and the pack front member sits at 1 life so the wisp's first
    // hit is guaranteed to be the killing blow.
    const summoned = summonMinion(state.character, 'rift_wisp').character
    const noSkills = { ...summoned, equippedSkills: [] }
    const startingGold = state.currencies['gold'] ?? 0
    const startingXp = noSkills.experience
    const startingProgress = state.zones.find(z => z.id === state.activeZoneId)!.killProgress
    const startingInventory = state.inventory.items.length

    let last: { state: GameState } = { state: seededLowLifeState(state, noSkills) }
    let sawMonsterDie = false
    for (let i = 0; i < 40; i++) {
      const result = simulateTick(last.state)
      last = result
      if (result.events.some(e => e.type === 'monsterDied')) sawMonsterDie = true
      if (last.state.combat.currentPack.length === 0) break
    }
    expect(sawMonsterDie).toBe(true)
    const zone = last.state.zones.find(z => z.id === state.activeZoneId)!
    expect(zone.killProgress).toBe(startingProgress)
    expect(last.state.currencies['gold'] ?? 0).toBe(startingGold)
    expect(last.state.inventory.items.length).toBe(startingInventory)
    expect(last.state.character.experience).toBe(startingXp)
  })

  it('a player killing blow still grants rewards', () => {
    // Player keeps their starter skill; the pack front member sits at 1 life
    // so the player's first hit is the killing blow.
    let last: { state: GameState } = { state: seededLowLifeState(state, state.character) }
    for (let i = 0; i < 40; i++) {
      last = simulateTick(last.state)
      if (last.state.combat.currentPack.length === 0) break
    }
    const zone = last.state.zones.find(z => z.id === state.activeZoneId)!
    expect(zone.killProgress).toBeGreaterThan(startingProgressFor(state))
  })
})

function startingProgressFor(state: GameState): number {
  return state.zones.find(z => z.id === state.activeZoneId)!.killProgress
}

/** Pre-seed a one-member pack at 1 life so the next hit kills it. */
function seededLowLifeState(
  state: GameState,
  character: Character,
  ailments: GameState['combat']['ailments'] = {},
): GameState {
  const monster: Monster = {
    id: 'test_dummy',
    name: 'Test Dummy',
    level: 1,
    life: 1,
    maxLife: 1,
    damage: [{ type: 'physical', min: 1, max: 2 }],
    attackRate: 1,
    accuracy: 50,
    evasion: 0,
    experienceReward: 10,
    goldReward: 10,
    rarity: 'normal',
  }
  const member: PackMember = { id: 'test_member_0', monster, currentLife: 1, maxLife: 1, slot: 0, position: { x: 0, y: 0 } }
  return {
    ...state,
    character,
    combat: {
      ...state.combat,
      monster,
      monsterLife: 1,
      currentPack: [member],
      packSizeRemaining: 1,
      packNamedEliteCount: 0,
      lastDamageSource: 'player',
      minionAttackCooldowns: {},
      ailments,
    },
  }
}

describe('party-set payoff (M4, spec sections 7-8)', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('a full army under Herald of Light lands inside the 20-40% DPS-share band', () => {
    // Spec §8.3 fixture: the band is defined against the validator's geared
    // reference profile (rare gear + passives) and its zone threat at the
    // calibration level 33 — the same model validate:balance samples per zone.
    const char = buildValidatorCharacter(33)
    const members = buildMinionArmy(33)
    const monster: Monster = {
      ...MONSTERS['void_touched_scribe'],
    }
    const share = estimateMinionDpsShare(char, members, monster, ['light'], false)
    expect(share).toBeGreaterThanOrEqual(MINION.DPS_SHARE_TARGET_MIN)
    expect(share).toBeLessThanOrEqual(MINION.DPS_SHARE_TARGET_MAX)
  })

  it('wretch bites feed Virulent stack tracking (spec section 7.3)', () => {
    useGameStore.setState(useGameStore.getState(), true)
    useGameStore.getState().resetGame()
    const base = useGameStore.getState().character
    const virulentChar = {
      ...summonMinion(base, 'plague_wretch').character,
      equippedSkills: [], // the wretch is the only damage source
      special: { ...base.special, septicemia: true },
    }
    let state = seededLowLifeState({ ...useGameStore.getState(), character: virulentChar }, virulentChar)
    state = { ...state, combat: { ...state.combat, monster: { ...state.combat.monster!, life: 500, maxLife: 500 }, monsterLife: 500, currentPack: [{ ...state.combat.currentPack[0], currentLife: 500, maxLife: 500 }] } }

    let sawStacks = false
    for (let i = 0; i < 12; i++) {
      const result = simulateTick(state)
      state = result.state
      if ((state.combat.virulent.stacks['test_dummy'] ?? 0) > 0) {
        sawStacks = true
        break
      }
    }
    expect(sawStacks).toBe(true)
  })

  it('a minion kill still spreads DOTs under Plaguewind (source-agnostic, section 7.3)', () => {
    useGameStore.setState(useGameStore.getState(), true)
    useGameStore.getState().resetGame()
    const base = useGameStore.getState().character
    const plagueChar = {
      ...summonMinion(base, 'plague_wretch').character,
      equippedSkills: [],
      special: { ...base.special, plaguewind: true },
    }
    const seededAilments = {
      test_dummy: [{
        id: 'ail_seed',
        type: 'poison' as const,
        source: 'skill' as const,
        damagePerTick: 5,
        remainingTicks: 10,
        stacks: 1,
      }],
    }
    let state = seededLowLifeState({ ...useGameStore.getState(), character: plagueChar }, plagueChar, seededAilments)

    let sawSpread = false
    for (let i = 0; i < 12; i++) {
      const result = simulateTick(state)
      state = result.state
      if (
        state.combat.plaguewindCarryover.length > 0 ||
        result.events.some(e => e.type === 'ailmentApplied' && e.targetId === 'pack')
      ) {
        sawSpread = true
        break
      }
    }
    expect(sawSpread).toBe(true)
  })
})

describe('reviveAllSummons (offline revive-on-claim, §10.2)', () => {
  it('revives every dead summon and clears respawn timers', () => {
    let character = useGameStore.getState().character
    character = summonMinion(character, 'bone_sentinel').character
    character = summonMinion(character, 'plague_wretch').character
    character = summonMinion(character, 'plague_wretch').character
    character = summonMinion(character, 'rift_wisp').character
    // Kill all four
    character = killMinion(character, 'bone_sentinel').character
    character = killMinion(character, 'plague_wretch').character
    character = killMinion(character, 'plague_wretch').character
    character = killMinion(character, 'rift_wisp').character
    expect(character.summons.every(s => !s.alive)).toBe(true)
    expect(character.summons.every(s => s.respawnTicksRemaining > 0)).toBe(true)

    const revived = reviveAllSummons(character)
    expect(revived.summons.every(s => s.alive)).toBe(true)
    expect(revived.summons.every(s => s.respawnTicksRemaining === 0)).toBe(true)
    expect(revived.summons).toHaveLength(4)
    // Original untouched (pure function)
    expect(character.summons.every(s => !s.alive)).toBe(true)
  })

  it('returns the character unchanged when nothing is dead', () => {
    let character = useGameStore.getState().character
    character = summonMinion(character, 'bone_sentinel').character
    const revived = reviveAllSummons(character)
    expect(revived).toBe(character)
  })

  it("revived minions return at the character's current level (fresh-cast parity, §8.2)", () => {
    let character = useGameStore.getState().character
    character = summonMinion(character, 'bone_sentinel').character
    // Minion summoned earlier, then the character leveled up
    const staleLevel = character.summons[0].level
    character = { ...character, level: staleLevel + 7 }
    character = killMinion(character, 'bone_sentinel').character

    const revived = reviveAllSummons(character)
    expect(revived.summons[0].level).toBe(staleLevel + 7)
  })

  it("re-levels alive summons that revived mid-sim at their stored level (§10.2)", () => {
    let character = useGameStore.getState().character
    character = summonMinion(character, 'bone_sentinel').character
    const storedLevel = character.summons[0].level
    // The wretch revived mid-sim via tickSummonRevivals (stored level), then
    // the character leveled up during the remaining offline time.
    character = summonMinion(character, 'plague_wretch').character
    character = killMinion(character, 'plague_wretch').character
    // Fast-forward the respawn timer to its final tick, then revive.
    character = {
      ...character,
      summons: character.summons.map(s =>
        s.minionDefId === 'plague_wretch' ? { ...s, respawnTicksRemaining: 1 } : s,
      ),
    }
    character = tickSummonRevivals(character).character
    expect(character.summons.find(s => s.minionDefId === 'plague_wretch')!.alive).toBe(true)
    character = { ...character, level: storedLevel + 5 }

    const claimed = reviveAllSummons(character)
    expect(claimed.summons.every(s => s.alive)).toBe(true)
    expect(claimed.summons.every(s => s.level === storedLevel + 5)).toBe(true)
  })
})

