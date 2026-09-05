import { describe, it, expect, beforeEach } from 'bun:test'
import { useGameStore } from '../store/gameStore.ts'
import {
  resolveParty,
  resolvePartyEffects,
  buildPlayerMember,
  emptyPartyState,
  syncPartyState,
  applyPartyEffects,
} from './party.ts'
import { simulateTick } from './combat.ts'
import type { Character, GameState, PartyMember } from '../types/game.ts'

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

function freshState(): GameState {
  storage.clear()
  useGameStore.setState(useGameStore.getState(), true)
  useGameStore.getState().resetGame()
  return useGameStore.getState()
}

describe('party set M0 foundation', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('resolveParty returns exactly the player member, mirroring the character', () => {
    const state = freshState()
    const character: Character = state.character
    const members = resolveParty(character)

    expect(members).toHaveLength(1)
    const [player] = members
    expect(player.role).toBe('player')
    expect(player.id).toBe('player_1')
    expect(player.name).toBe(character.name)
    expect(player.level).toBe(character.level)
    expect(player.maxLife).toBe(character.maxLife)
    expect(player.life).toBe(character.life)
    expect(player.maxEnergyShield).toBe(character.maxEnergyShield)
    expect(player.energyShield).toBe(character.energyShield)
    expect(player.armour).toBe(character.armour)
    expect(player.evasion).toBe(character.evasion)
    expect(player.resistances).toEqual(character.resistances)
    expect(player.alive).toBe(character.isAlive)
    expect(player.respawnTicksRemaining).toBe(character.respawnTimer)
  })

  it('a live character snapshot resolves to a live party member (no respawn state leakage)', () => {
    const state = freshState()
    const character: Character = { ...state.character, isAlive: false, respawnTimer: 42, life: 0 }
    const [player] = resolveParty(character)

    expect(player.alive).toBe(false)
    expect(player.respawnTicksRemaining).toBe(42)
    expect(player.life).toBe(0)
  })

  it('resolvePartyEffects reads herald and army from the same keystones the combat hooks use', () => {
    const state = freshState()
    const heralded: Character = {
      ...state.character,
      special: { ...state.character.special, proclaimHerald: 'light', bannermansResolve: 'zealots' },
    }
    const effects = resolvePartyEffects(heralded)
    expect(effects.herald).toEqual(['light'])
    expect(effects.army).toBe('zealots')
    expect(effects.momentumStacks).toBe(0)

    // With no proclamation, no auras are active — same as combat's getHeraldActive.
    const plain = resolvePartyEffects(state.character)
    expect(plain.herald).toEqual([])
    expect(plain.army).toBeNull()
  })

  it('twin heralds reads both aura ids from herald_k3 exactly like combat getHeraldActive', () => {
    const state = freshState()
    const twin: Character = {
      ...state.character,
      special: { ...state.character.special, twinHeralds: true, proclaimHerald: 'silence' },
      keystoneChoices: { ...state.character.keystoneChoices, herald_k3: 'light,tide' },
    }
    const effects = resolvePartyEffects(twin)
    // Twin takes precedence over the proclamation, and a single-aura pick yields
    // the combat default for the second slot.
    expect(effects.herald).toEqual(['light', 'tide'])

    const single: Character = {
      ...twin,
      keystoneChoices: { ...twin.keystoneChoices, herald_k3: 'storms' },
    }
    expect(resolvePartyEffects(single).herald).toEqual(['storms', 'gold'])
  })

  it('emptyPartyState is the default used at every construction site', () => {
    const state = freshState()
    expect(emptyPartyState()).toEqual({ members: [], ticksSinceAnyMemberHit: 0 })
    // Construction defaults added alongside the party field (before the first tick).
    expect(state.combat.party).toEqual({ members: [], ticksSinceAnyMemberHit: 0 })
  })

  it('syncPartyState rebuilds members from the resolved character after a tick', () => {
    const state = freshState()
    // Simulate one full combat tick, then apply the end-of-tick mirror exactly
    // as the store does. Party must contain the (possibly changed) player.
    const { state: ticked } = simulateTick(state)
    const synced = syncPartyState(ticked)

    expect(synced.combat.party.members).toHaveLength(1)
    const [player] = synced.combat.party.members
    expect(player.role).toBe('player')
    expect(player.life).toBe(synced.character.life)
    expect(player.maxLife).toBe(synced.character.maxLife)
    // Behavior preservation: the mirror must not touch any other combat field.
    expect(synced.combat.monsterLife).toBe(ticked.combat.monsterLife)
    expect(synced.combat.lastDamageDealt).toBe(ticked.combat.lastDamageDealt)
    expect(synced.combat.currentPack).toBe(ticked.combat.currentPack)
    expect(synced.tickCounter).toBe(ticked.tickCounter)
  })

  it('syncPartyState preserves the incoming hit timer', () => {
    const state = freshState()
    const withTimer = {
      ...state,
      combat: { ...state.combat, party: { members: [], ticksSinceAnyMemberHit: 7 } },
    } as GameState
    const synced = syncPartyState(withTimer)
    expect(synced.combat.party.ticksSinceAnyMemberHit).toBe(7)
  })

  it('buildPlayerMember carries the character through unchanged and stays pure', () => {
    const state = freshState()
    const original: Character = { ...state.character }
    const member = buildPlayerMember(original)
    // Building a member must not mutate the source character.
    expect(state.character).toEqual(original)
    expect(member.name).toBe(original.name)
    expect(member.attack.flatDamage).toEqual({
      min: original.basePhysicalDamageMin,
      max: original.basePhysicalDamageMax,
      type: 'physical',
    })
  })
})

describe('party set M1: effects stamped on the set', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('applyPartyEffects stamps herald, army and momentum onto the player member', () => {
    const state = freshState()
    const heralded: GameState = {
      ...state,
      character: {
        ...state.character,
        special: {
          ...state.character.special,
          proclaimHerald: 'light',
          bannermansResolve: 'iron_legion',
        },
      },
      combat: { ...state.combat, momentum: { ...state.combat.momentum, stacks: 6 } },
    }
    // The store rebuilds the mirror after every tick, then applyPartyEffects
    // stamps the set — replicate that exact pipeline in the test.
    const stamped = applyPartyEffects(syncPartyState(heralded))

    expect(stamped.combat.party.members).toHaveLength(1)
    const [player] = stamped.combat.party.members
    expect(player.activeEffects.herald).toEqual(['light'])
    expect(player.activeEffects.army).toBe('iron_legion')
    expect(player.activeEffects.momentumStacks).toBe(6)

    // Purity: nothing outside combat.party changes.
    expect(stamped.combat.momentum.stacks).toBe(6)
    expect(stamped.combat.monsterLife).toBe(heralded.combat.monsterLife)
    expect(stamped.character).toBe(heralded.character)
  })

  it('applyPartyEffects covers every member, not just the player', () => {
    const state = freshState()
    const playerMember = buildPlayerMember(state.character)
    const minion: PartyMember = {
      ...playerMember,
      id: 'minion_test_1',
      role: 'minion',
      minionDefId: 'test_def',
    }
    const withMinion: GameState = {
      ...state,
      combat: {
        ...state.combat,
        party: { members: [playerMember, minion], ticksSinceAnyMemberHit: 0 },
      },
    }
    const stamped = applyPartyEffects(withMinion)

    const [p, m] = stamped.combat.party.members
    expect(p.id).toBe('player_1')
    expect(m.id).toBe('minion_test_1')
    // Every member receives the identical set-wide effect block.
    expect(p.activeEffects).toEqual(m.activeEffects)
  })

  it('after a tick, the member stamp matches combat.herald.active exactly (single source of truth)', () => {
    const state = freshState()
    const twin: GameState = {
      ...state,
      character: {
        ...state.character,
        special: { ...state.character.special, twinHeralds: true },
        keystoneChoices: { ...state.character.keystoneChoices, herald_k3: 'light,judgment' },
      },
    }
    const { state: ticked } = simulateTick(twin)
    const synced = syncPartyState(ticked)

    expect(synced.combat.herald.active).toEqual(['light', 'judgment'])
    expect(synced.combat.party.members[0].activeEffects.herald).toEqual(
      synced.combat.herald.active
    )
  })

  it('with no herald or army, members carry empty effects even after a tick', () => {
    const state = freshState()
    const { state: ticked } = simulateTick(state)
    const synced = syncPartyState(ticked)
    const [player] = synced.combat.party.members
    expect(player.activeEffects.herald).toEqual([])
    expect(player.activeEffects.army).toBeNull()
    expect(player.activeEffects.momentumStacks).toBe(synced.combat.momentum.stacks)
  })
})
