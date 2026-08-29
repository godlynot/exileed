# Minion & Party System Spec

> **Status:** Approved for planning. Build in phases — Phase 0 (party set) is the load-bearing
> refactor and must land first with full test coverage. Values marked **(tune)** are yours to
> balance; mechanics marked with a ⚠ decision are listed in §11 and need a sign-off before that
> phase starts.
>
> **Companion docs:** `skill-system-spec.md` (skills/supports), `range-band-system-spec.md`
> (pack bands), `ascendancy-and-skills-handoff.md` (wheels), `CONTEXT.md` (naming rules),
> `BALANCE.md` (tuning constants).

---

## 1. Vision & Goals

The game already ships a party-shaped mechanic that only buffs the player:

- `combat.ts` — *"Herald auras and Marshal armies are designed as party-set effects. In v1 there
  is no party/minion system, so they are applied to the player character as self-buffs. When a
  party framework is added, these hooks should be moved to target the whole party set."*
- `passives.ts` — *"Marshal army choice: party-set buffs (currently the party is just the player)."*

This spec delivers that framework plus the first real minion content, so auras/armies become
**set-wide effects** and minions are first-class combatants.

### Goals

1. **Party set as the foundation.** Introduce a `party` abstraction (player + minions) and move
   every Herald aura and Marshal army hook off `character.special` self-buffs onto the set.
2. **Real minions.** Summonable, persistent (saved), combat-capable allies that attack the pack,
   die, and are re-summoned — not cosmetic followers.
3. **Minions are build enablers, not the main character.** Target: a capped minion army deals
   roughly **20–40% of the player's DPS** (see §9), so summoning is a build direction, not a
   replacement for the character's own skills.
4. **Zero rework later.** The party set is designed so future sources (new skills, uniques,
   ascendancy nodes, temporary summons) join with one data entry + one summon call.

### Non-goals (v1)

- No minion positioning, movement, pathfinding, or manual targeting (§10).
- No minion gear, sockets, or gem sockets on minions.
- No permanent pets that act as a second character (minions are expendable units with caps).
- No party of *human* players (multiplayer is out of scope entirely).

---

## 2. Phase 0 — The Party Set (foundation)

**Why first:** every other phase reads/writes the party. Landing this as its own phase with
behavior-preserving refactors means the existing 184 tests stay green while the framework exists.

### 2.1 Core type

Add to `src/types/game.ts`:

```ts
export type PartyRole = 'player' | 'minion'

export interface PartyMember {
  id: string            // 'player_1' for the player, `minion_<defId>_<n>` for minions
  role: PartyRole
  name: string
  level: number
  // Combat stats (resolved once per tick, see 2.3)
  maxLife: number
  life: number
  maxEnergyShield: number
  energyShield: number
  armour: number
  evasion: number
  accuracy: number
  resistances: Resistances
  // Offense (minions use the existing skill pipeline, §5)
  attack: {
    skillId: string            // a real SKILLS entry; minions reuse band tags + ailments
    attackRate: number         // attacks per second
    damageEffectiveness: number
    flatDamage: { min: number; max: number; type: DamageType }
  }
  // Source bookkeeping
  source: { type: 'skill' | 'unique' | 'ascendancy'; id: string }
  minionDefId?: string         // set for role === 'minion'
  alive: boolean
  // Death/resummon (minions only)
  respawnTicksRemaining: number
  // Per-member effects resolved from the party set (auras/armies), mirrored from
  // character.special each tick — see 2.4
  activeEffects: { herald: string[]; army: string | null; momentumStacks: number }
}
```

`CombatState` gains a live mirror (same pattern as `currentPack`):

```ts
// in CombatState
party: {
  members: PartyMember[]        // player is members[0]
  ticksSinceAnyMemberHit: number // shared ES-recharge/aggro bookkeeping
}
```

### 2.2 Persisted state

Minions persist on the character (survive save/load and zone changes), **not** in CombatState:

```ts
// on Character
summons: {
  minionDefId: string
  level: number       // levels with use like gems (optional in v1: fixed at summon-caster level)
  xp: number
  alive: boolean      // false until re-summoned
}[]
```

`summons` is the *loadout*; live party members are rebuilt from it every tick by the resolver.
A dead minion stays in `summons` with `alive: false` and the player re-summons by recasting the
skill (or automatically after its cooldown — decision D1, §11).

### 2.3 Pure resolver (mirror the character calculator)

Add `resolveParty(character, summons, equipment)` in a new `src/systems/party.ts`, modeled on
`recalculateCharacterFromEquipment` + `applyPassiveStats`:

1. Player member: derived from the already-resolved `Character` (life/ES/armour/etc.).
2. Each alive minion: `baseStats(minionDef) × levelScaling(level)` (tables in §8) plus
   **inherited party bonuses** (auras/armies, §2.4).
3. Returns `PartyMember[]` — a pure function, deterministic, reused by `simulateTick`,
   offline progress, and the UI (no duplicated stat logic).

### 2.4 Move aura/army hooks onto the set

Refactor **only the application point**, not the numbers:

- Keep `character.special` as the *source of truth* for what the player has unlocked.
- Add one function, `applyPartyEffects(character, members, combat)` in `party.ts`, that walks the
  current Herald auras and Marshal army and stamps the derived bonuses onto every party member's
  `activeEffects` (and into `character` as today, so existing player math is unchanged).
- Rewrite the combat hooks to read from the set instead of `character.special` directly:

| Hook (currently reads `character.special`) | Moves to |
|---|---|
| `heraldDamageMultiplier` (light/tide/judgment) | per-member multiplier applied to that member's skill hits |
| `heraldDamageReduction` (silence) | per-member damage-taken reduction |
| Herald of Gold item drops | stays player-only (gold/items are player resources) |
| Herald Storms bolt | player-only (minions don't cast player auras) |
| `bannermansResolve === 'iron_legion'` flat DR | per-member |
| `rallying_presence` momentum DR | per-member |
| `wardens` party DR share | now genuinely applies to the whole set |
| `bulwarksWrath` counter | player-only (stores damage taken by the player) |
| `warOfAttrition` / Reapers DOT | stays an *aura effect* — now applied to the pack from the set |

**Behavior-preserving rule:** with zero minions summoned, the refactored math must produce
identical numbers to today (player member receives the same bonuses it gets now). The existing
combat suite is the regression gate for this.

### 2.5 Validation gate for Phase 0

- `bun test` — all 184 existing tests pass unchanged (no number drift).
- New `party.test.ts` — aura/army bonuses reach the player identically with 0 / 1 / 3 minions;
  a minion with a Herald active receives the bonus; Wardens DR applies to the whole set.
- `bun tsc -b --noEmit`, `bun run build`.

---

## 3. Phase 1 — Minion entity model

### 3.1 `MinionDef` data (new `src/data/minions.ts`)

```ts
export interface MinionDef {
  id: string
  name: string
  description: string
  // Base stats at level 1 (scaled by the same monster/player curve family, §8)
  baseLife: number
  baseEnergyShield: number
  baseArmour: number
  baseEvasion: number
  baseAccuracy: number
  baseResistances: Partial<Resistances>
  attack: {
    skillId: string        // real SKILLS entry; carries tags/band/ailment
    damageEffectiveness: number
    flatMin: number
    flatMax: number
    damageType: DamageType
    attackRate: number     // per second
  }
  // Summon rules
  minionCap: number        // how many of this def may exist at once (typically 1-3)
  summonCooldownSeconds: number
  // Behavior flags (v1: 'melee-attacker' is the only implemented one)
  behavior: 'melee-attacker' | 'ranged-attacker' | 'guardian'
  // Party-set interactions
  taunts?: boolean         // ⚠ D2 — see §11
}
```

**Naming:** follow `CONTEXT.md` rules — original names, no PoE terms.

### 3.2 v1 minion catalog (3 defs + 1 unique)

| Def | Archetype | Skill (band) | Notes |
|---|---|---|---|
| **Bone Sentinel** | Guardian / melee | `sentinel_smash` (`melee`) | Thick, slow, modest damage. The defensive option. `guardian` behavior. |
| **Plague Wretch** | Melee DoT | `wretch_bite` (`melee`, `dot` poison) | Feeds Plaguebringer's Virulent organ-rot stacks and Contagion spreads (§7.3). |
| **Rift Wisp** | Ranged caster | `wisp_bolt` (`farRange`, spell) | Fragile, highest damage; the payoff for Herald auras applying to the party (§7.1). |
| **Echo of the First** (unique body) | Unique-granted | `echo_strike` (`melee`) | 1 unique base grants this minion; summons a tanky echo of the wearer (§7.4). |

Skills referenced above are new entries in `SKILLS` that **only minions cast** (never appear in the
player's skill picker — gate by a new `minionOnly?: true` field on the skill).

---

## 4. Phase 2 — Summon skills (how the player gets minions)

### 4.1 Skill model

Add a `summons?: { minionDefId: string }` field to `Skill`. A summon skill is like any other
skill (tag-compatible with supports for **cooldown/duration** supports only, §10) but its cast
spawns/renews the minion instead of dealing damage:

```ts
summon_wretch: {
  id: 'summon_wretch',
  name: 'Summon Plague Wretch',
  description: 'Raise a plague wretch that bites enemies and spreads rot.',
  tags: ['spell', 'chaos', 'minion'],
  baseDamageMin: 0, baseDamageMax: 0,
  damageType: 'chaos',
  cooldownTicks: 40,                 // ~16s base summon cooldown (tune)
  damageEffectiveness: 0,
  targeting: 'single',
  summons: { minionDefId: 'plague_wretch' },
}
```

New tag: `'minion'` added to the `SkillTag` union. Summon skills are **not** compatible with
damage supports (they deal no damage); a `minion` tag gates summon-specific supports later.

### 4.2 Summon lifecycle (in `simulateTick`)

1. **Cast:** when a summon skill's cooldown elapses, call `summonMinion(defId, character)`:
   - If the def is already at `minionCap`, **revive** the dead one first (if any), else no-op
     (cap reached — the cast fizzles with a `summonBlocked` event, ⚠ D3 §11).
   - Appends a member to `combat.party.members` and sets `summons[].alive = true`.
   - Emits `minionSpawned`.
2. **Per tick:** alive minions attack (§5), take damage if targeted (§6).
3. **Death:** on `life <= 0`, mark `alive: false`, remove from `combat.party.members`, start
   `respawnTicksRemaining = summonCooldown × TICKS_PER_SECOND`, emit `minionDied`. The persisted
   `summons[].alive` flips on the next save.
4. **Auto-revival (⚠ D1):** if approved, when the counter hits 0 the minion re-enters the party
   automatically (idle-friendly); otherwise the player recasts.

---

## 5. Phase 2b — Minion attacks

Minions reuse the **existing skill damage pipeline** — no new damage math:

1. Each alive minion has `attackRate` attacks/sec. Per tick, `party.ts` or a new
   `src/systems/minions.ts` fires the minion's `skillId` through the same damage path the player
   uses (flat → increased → more → crit → ailments), with:
   - **Band targeting:** minion skills carry band tags and hit the pack front-to-back exactly like
     player skills (`rangeBandHitCount`), so a `farRange` wisp hits the front 3, a `melee`
     sentinel hits the front 1.
   - **Ailments:** a `dot` minion skill applies its ailment to every target in its band
     (same rules as player multi-hit skills) — this is what feeds Virulent/Contagion (§7.3).
2. Minion damage scales off the **minion's own level and stats**, not the player's weapon —
   but it *does* inherit party-set multipliers (Herald of Light, Vanguard momentum bonuses if
   set-wide, Marshal buffs). No player gear scaling for minions in v1.
3. Events: reuse `hitLanded` with `source: 'player'` → extend the union:
   `source: 'player' | 'monster' | 'minion'` (backwards-compatible) and add `sourceId` for the
   minion id. Add `minionSpawned`, `minionDied`, `minionRevived` event types.
4. **Minions do not grant** XP, gold, loot, gem XP, or Herald-of-Gold bonuses on kill — those
   stay player-only (prevents idling-to-infinite-rewards with a full army).

---

## 6. Phase 2c — Minions taking damage

**v1 rule (default): monsters attack the player.** The pack's damage pipeline at `combat.ts:1226`
is untouched. Minions are offensive/support units; their health only matters against incidental
damage sources that target the party set (Phase 3 auras/armies, ⚠ D4 §11).

**Designed-but-deferred:** `guardian`/`taunts` — a flagged minion (Bone Sentinel, unique echo)
redirects monster attacks to itself while alive. This is a *small* change once the party set
exists (the monster-attack block picks its target from `party.members` instead of always the
player), but it changes player survivability meaningfully, so it ships only after Phase 0-2
balance is verified (⚠ D2 §11).

**Minion recovery:** no regen/recharge in v1 — minions are expendable and re-summoned. This keeps
the ES-recharge/ailment machinery player-only and avoids a second recovery simulation.

---

## 7. Phase 3 — Party-set payoff (the point of the whole system)

### 7.1 Herald auras × minions

Once Phase 0 lands, auras automatically cover minions. Intent per aura:

| Aura | Minion effect |
|---|---|
| Light | +damage to minion hits (same % as player) |
| Silence | DR applies to minion damage-taken (meaningful once guardians exist) |
| Tide | ramp applies to the set while the *player* is untouched (player still owns the ramp) |
| Judgment | finisher bonus applies to minion hits on low-life targets |
| Storms | stays player-cast; the bolt is the player's ability |
| Gold | stays player-only (loot is the player's) |

**Payoff:** Herald becomes a "pet build" ascension — the Rift Wisp trio under Herald of Light +
Judgment is the headline build this system enables.

### 7.2 Marshal armies × minions

- Iron Legion flat DR, Rallying Presence DR, and Wardens DR share apply to the whole set.
- Vanguard momentum *damage* bonuses apply to minion hits once Momentum is a set-wide resource
  (⚠ D5 §11 — this changes Vanguard's player-only identity, so it needs a sign-off).
- War of Attrition / Reapers stay aura DOTs from the set.

### 7.3 Plaguebringer synergy (virulent/contagion)

- **Virulent (single-target organ-rot):** minion poison hits from the Plague Wretch add to the
  same stack target, so a Virulent build uses the wretch to ramp organ-rot faster. Minion
  ailment *magnitude* scales from minion level, not player DOT stats (keeps the player's DOT
  investment meaningful).
- **Contagion (pack-spread):** a minion kill spreads DOTs exactly like a player kill (the
  Plaguewind rule operates on "every DOT on the dying enemy" — source-agnostic, already
  compatible).

### 7.4 Unique: Echo of the First

One new unique body base with a fixed implicit: *summons an Echo of the First guardian* (a copy
of your max life / 2, melee, taunts if ⚠ D2 is approved). Drop through the existing named-elite
unique pool.

---

## 8. Phase 4 — Stats & level scaling

### 8.1 Curves (new `src/data/balance.ts` block: `MINION`)

```ts
export const MINION = {
  // Percent of the player's own stat at the same level (player = 100%)
  LIFE_PERCENT: 0.8,          // sentinel 1.4, wisp 0.4, echo 1.6 — per-def multiplier (tune)
  ES_PERCENT: 0.5,
  ARMOUR_PERCENT: 0.6,
  EVASION_PERCENT: 0.5,
  ACCURACY_PERCENT: 1.0,
  // Damage share: a full army should add ~20-40% player DPS (see BALANCE.md band)
  DPS_SHARE_TARGET_MIN: 0.2,
  DPS_SHARE_TARGET_MAX: 0.4,
  LEVEL_SCALING_EXPONENT: 0.75,  // same defensive curve family as gear (BALANCE.md)
  MAX_SUMMONS_TOTAL: 4,
} as const
```

Minion stats are `minionBase × monsterScalingMultiplier(level)^LEVEL_SCALING_EXPONENT`
(defensive) and `× monsterScalingMultiplier(level)` (offensive flat), mirroring item scaling so
minions stay relevant without outscaling the player.

### 8.2 Leveling

v1 keeps it simple: minions are summoned at the **caster's current level** and do not level
independently (no gem-style XP for minions). `summons[].level` is stored for future expansion
(skill-gem-leveled minions) but is fixed at cast time now.

### 8.3 Validator

Extend `scripts/validateBalance.ts` with a minion profile: a capped army's DPS as % of the
validator's player DPS per zone, asserted inside the 20–40% band; minion hits-to-die vs the zone
threat reported (not warned — minions are expendable). This keeps the DPS-share promise
checkable instead of vibes.

---

## 9. Phase 5 — UI

1. **Minion bar** (new `src/components/MinionBar.tsx`, rendered inside `CombatScene`): one card
   per party minion — name, level, HP/ES bar, death/respawn countdown. Click = tooltip with
   stats + source.
2. **Skills panel:** summon skills appear in the 4 slots like any skill; their tooltip shows the
   minion's stat preview at your level.
3. **Combat log:** `minionSpawned` / `minionDied` / `hitLanded(source: 'minion')` entries render
   with a distinct color (reuse the event-render switch, no new layout).
4. **Character stats:** a "Minions" section listing the army, DPS contribution estimate
   (optional, cheap to compute from the same resolver).

---

## 10. Phase 6 — Save, offline, and integration points

### 10.1 Save schema

- `SAVE_VERSION` 5 → **6** in `src/systems/save.ts`.
- Add `character.summons: []` (normalized) and `combat.party` is **not persisted** (rebuilt from
  summons + resolver, same as `currentPack`).
- `migrateSave`: version 5 → 6 adds `summons: []` and normalizes the new fields; older versions
  chain through the existing migration. `normalizeCharacterData` clamps unknown def ids, caps
  `MAX_SUMMONS_TOTAL`, and drops invalid entries.
- New `save.test.ts` regressions: v5 save loads with an empty army; a save with summons
  round-trips.

### 10.2 Offline progress

**Free.** `simulateOfflineProgress` runs the same `simulateTick`; once minions live in the tick,
they fight through offline chunks automatically. Re-summon dead minions at the end of the
offline sim (they were "away" too — auto-revive on claim if ⚠ D1 is approved). The cap must not
change offline loot (minion kills grant nothing, §5.4) — already guaranteed by design.

### 10.3 Touch points checklist

- `src/types/game.ts` — `PartyMember`, `CombatState.party`, `Skill.summons`, `SkillTag 'minion'`,
  `CombatEvent` additions.
- `src/systems/party.ts` (new), `src/systems/minions.ts` (new), `src/data/minions.ts` (new).
- `src/data/skills.ts`, `src/data/balance.ts`, `src/data/items.ts` (unique), `src/data/ascendancies.ts` (if any node grants minions — none in v1; synergies are hooks only).
- `src/systems/combat.ts` — summon/lifecycle, minion attack turns, party-set hook reads.
- `src/systems/save.ts` — v6 + migration.
- `src/components/MinionBar.tsx` (new), `src/components/SkillsPanel.tsx`, `src/components/CombatLog.tsx`, `src/components/CombatScene.tsx`.
- `src/systems/offlineProgress.ts` — revive-on-claim (if approved).
- `scripts/validateBalance.ts` — minion DPS-share report.

---

## 11. Open design decisions (need sign-off per phase)

| # | Decision | Options | Blocks |
|---|---|---|---|
| D1 | Dead-minion revival | (a) auto-revive after cooldown — idle-friendly; (b) player recasts the summon skill | Phase 2 |
| D2 | Guardian taunt/redirect | (a) ship Bone Sentinel + unique echo as tanks (redirect monster attacks); (b) defer, minions never tank in v1 | Phase 2c |
| D3 | Summon cap behavior | (a) cast fizzles with `summonBlocked` event; (b) oldest minion is replaced | Phase 2 |
| D4 | Party damage sources | What can hurt minions in v1 if monsters only hit the player? (a) nothing — health bar is flavor until taunts; (b) Herald/Marshal auras that damage the set (e.g. Foreseen-Doom-like); (c) build taunts into Phase 2 | Phase 2c |
| D5 | Vanguard momentum on minions | (a) momentum is set-wide — minions benefit (buff); (b) stays player-only, minions only get Herald/Marshal | Phase 3 |

**Recommended defaults:** D1(a), D2(b) defer taunts, D3(a) fizzle, D4(a) health is flavor until
taunts (keeps Phase 2 minimal), D5(b) momentum stays player-only in v1. These keep the first
shipment small and testable; taunts + set-wide momentum are the natural v1.5 extension and are
already designed for.

---

## 12. Milestones & validation gates

Each milestone ends with: `bun test`, `bun tsc -b --noEmit`, `bun run build`,
`bun run validate:tree && bun run validate:ascendancies && bun run validate:balance`, preview
check.

| M | Deliverable | Exit test (beyond the suite) |
|---|---|---|
| **M0** | `PartyMember` + `CombatState.party` + resolver skeleton; party contains only the player | All 184 existing tests pass **unchanged** (pure additive) |
| **M1** | Aura/army hooks move to the set (2.4); player math byte-identical | Existing combat suite green + `party.test.ts` (bonuses reach player identically with 0 minions) |
| **M2** | `MinionDef` data + 3 defs + summon skills + lifecycle (cast/revive/death/resummon) | `minions.test.ts`: spawn, cap, death, revive, event emission |
| **M3** | Minion attack turns (band targeting, ailments, no rewards on kill) | `minions.test.ts`: band hit counts, ailment application, no gold/XP from minion kills |
| **M4** | Party-set payoff (Herald × minions, Marshal × minions, Virulent feed, Contagion spread) | Fixtures: Herald-of-Light wisp army DPS share in 20–40%; Virulent stacks from wretch bites |
| **M5** | UI (minion bar, skills panel, log, stats) | Manual preview QA of summon/revive/death loop |
| **M6** | Save v6 + migration + offline integration | `save.test.ts` regressions; offline sim with army produces same kill rate as online |
| **M7** | Balance validator minion report + tuning pass | `validate:balance` reports minion DPS share per zone inside band |

**Total new tests target:** ~25–35 across `party.test.ts`, `minions.test.ts`, `save.test.ts`,
plus the existing suites staying green.

---

## 13. Scope discipline

**Do NOT build in v1:** minion positioning/movement/coordinates, pathfinding, manual minion
targeting, minion gear or sockets, minion skill gems, player-controlled minion abilities,
multiplayer, pet AI states beyond `attack`/`dead`, minion XP/leveling (stored but fixed),
minions that grant loot/XP/gold, or a second recovery simulation.

**Do keep:** the party set as the single abstraction every aura/army reads from; the pure
resolver; the existing damage/band/ailment pipeline reused for minion hits; save versioning;
offline parity via the shared tick.

---

*Draft: 2026-08-20 — plan only, nothing implemented. Phase 0 (M0–M1) is the entry point and is
behavior-preserving by design.*
