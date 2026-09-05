import { MINIONS } from '../data/minions.ts'
import { resolveMinionMember } from './minions.ts'
import type {
  Character,
  GameState,
  HeraldAuraId,
  PartyMember,
  PartyMemberEffects,
} from '../types/game.ts'

/**
 * Resolve the current Herald auras / Marshal army from the character's
 * ascendancy state. Single source of truth shared by all party members.
 *
 * M0 behavior-preserving rule: with zero minions, the player member must
 * receive exactly what character.special provides today — so the effects are
 * read from the same keystones the combat hooks read, unchanged.
 */
export function resolvePartyEffects(character: Character): PartyMemberEffects {
  const herald: string[] = []
  if (character.special.twinHeralds) {
    // Twin Heralds: both auras come from herald_k3 (comma-separated), exactly
    // mirroring combat's getHeraldActive read site. Twin takes precedence over
    // proclaimHerald, same as combat.
    const choice = character.keystoneChoices['herald_k3'] ?? 'light'
    const selected = choice.split(',').filter(Boolean)
    const first = (selected[0] as HeraldAuraId) ?? 'light'
    const second = (selected[1] as HeraldAuraId) ?? 'gold'
    herald.push(first, second)
  } else if (character.special.proclaimHerald) {
    herald.push(character.special.proclaimHerald)
  }

  return {
    herald,
    army: character.special.bannermansResolve ?? null,
    momentumStacks: 0,
  }
}

/**
 * Build the player PartyMember from an already-resolved Character (the same
 * recalculateCharacterFromEquipment + applyPassiveStats output the combat sim
 * uses). Pure: no mutation, no RNG.
 */
export function buildPlayerMember(character: Character): PartyMember {
  return {
    id: 'player_1',
    role: 'player',
    name: character.name,
    level: character.level,
    maxLife: character.maxLife,
    life: character.life,
    maxEnergyShield: character.maxEnergyShield,
    energyShield: character.energyShield,
    armour: character.armour,
    evasion: character.evasion,
    accuracy: character.accuracy,
    resistances: { ...character.resistances },
    attack: {
      skillId: '',
      attackRate: character.attackRate,
      damageEffectiveness: 1,
      flatDamage: {
        min: character.basePhysicalDamageMin,
        max: character.basePhysicalDamageMax,
        type: 'physical',
      },
    },
    source: { type: 'skill', id: 'player' },
    alive: character.isAlive,
    respawnTicksRemaining: character.respawnTimer,
    activeEffects: resolvePartyEffects(character),
  }
}

/**
 * Build the party set: the player plus one live member per alive persisted
 * summon (minion spec §2.3). Each member receives the set-wide Herald/Marshal
 * effects from resolvePartyEffects, so auras cover minions automatically
 * (spec §2.4 / §7). Pure: no mutation, no RNG.
 */
export function resolveParty(character: Character): PartyMember[] {
  const player = buildPlayerMember(character)
  const effects = resolvePartyEffects(character)
  const members: PartyMember[] = [player]
  const instancesPerDef = new Map<string, number>()
  for (const summon of character.summons ?? []) {
    if (!summon.alive) continue
    const def = MINIONS[summon.minionDefId]
    if (!def) continue
    const instanceIndex = (instancesPerDef.get(summon.minionDefId) ?? 0) + 1
    instancesPerDef.set(summon.minionDefId, instanceIndex)
    const member = resolveMinionMember(summon, def, instanceIndex)
    // Stamp the set-wide effects resolved above (applyPartyEffects re-stamps
    // with live momentum stacks at the end of every tick).
    member.activeEffects = { ...effects, momentumStacks: player.activeEffects.momentumStacks }
    members.push(member)
  }
  return members
}

/**
 * M1 (minion spec §2.4): stamp the set-wide Herald aura / Marshal army effects
 * onto every party member's activeEffects. With zero minions this is exactly
 * the player member, and the stamp equals what combat's own hooks compute from
 * character.special (getHeraldActive + momentum stacks) — so refactoring the
 * combat hooks to read from the set is behavior-preserving by construction.
 *
 * Pure: returns the state with an updated combat.party only.
 */
export function applyPartyEffects(state: GameState): GameState {
  const character = state.character
  const effects = resolvePartyEffects(character)
  // Momentum is the set's shared ramp resource; members mirror the live stacks
  // (per-member consumption only begins when minions exist in M2+).
  const memberEffects: PartyMemberEffects = {
    ...effects,
    momentumStacks: state.combat.momentum.stacks,
  }
  const members = state.combat.party.members.map(member => ({
    ...member,
    activeEffects: memberEffects,
  }))
  return {
    ...state,
    combat: {
      ...state.combat,
      party: {
        ...state.combat.party,
        members,
      },
    },
  }
}

export function emptyPartyState(): {
  members: PartyMember[]
  ticksSinceAnyMemberHit: number
} {
  return { members: [], ticksSinceAnyMemberHit: 0 }
}

/**
 * End-of-tick party mirror. Rebuilds combat.party from the (already resolved)
 * character exactly once per tick. Applied at the simulateTick call sites so
 * every return path — including early death/respawn exits — leaves a fresh
 * mirror. With zero minions this holds only the player and contains no combat
 * logic: purely reactive data for the UI party column (minion spec §2.5).
 */
export function syncPartyState(state: GameState): GameState {
  const previousParty = state.combat.party
  const rebuilt: GameState = {
    ...state,
    combat: {
      ...state.combat,
      party: {
        members: resolveParty(state.character),
        ticksSinceAnyMemberHit: previousParty?.ticksSinceAnyMemberHit ?? 0,
      },
    },
  }
  // Rebuild resolves fresh members (whose defaults carry no live set data), so
  // finish by stamping the set-wide effects — otherwise the momentum mirror
  // would reset to 0 on every rebuild.
  return applyPartyEffects(rebuilt)
}
