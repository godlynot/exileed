# Range-Band System Spec (Pack Lanes, M5 pre-work)

Schedule this as part of the pack-lane combat work (after M4.5 skills/ascendancies exist). It is deliberately the **simplest mechanically-real** version of range in the pack lane — no continuous distances, no movement physics, no targeting UI. If implementing this ever requires monster coordinates or collision, that means scope has drifted into the spatial engine we explicitly cut; stop and go back to slot indices.

This is the complete, approved design. The mechanic shapes are fixed; values marked **(tune)** are yours to balance. Ask before any structural deviation.

---

## 1. Core model

Range is **one more tag dimension on skills** — not a new system. Skills already carry tags like `attack`, `spell`, `physical`, `aoe`, `projectile`. We add a **band tag** to each skill:

| Band tag | Meaning | Front-to-back targets hit |
|---|---|---|
| `melee` | Close combat; strikes the enemy directly in front of you | 1 (front only) |
| `nearRange` | Short reach; catches the front line and one behind | 2 |
| `farRange` | Long reach; arcs over the front to reach deeper into the pack | 3 |
| `allRange` | Area effect; blankets the entire pack | whole pack |

The band tag lives alongside the existing tags in `Skill.tags` and participates in the **exact same support tag-compatibility pattern** as every other tag (`allowedTags` intersection). No new lookup system, no per-skill numeric range field, no coordinates.

`melee` already existed as a tag before this spec; `nearRange` / `farRange` / `allRange` were added to the `SkillTag` union in `src/types/game.ts`.

---

## 2. Rules

### 2.1 Hit counts are slot indices, not positions

- Band membership is a **static slot index** in the pack: slot 0 is the front/melee band, slot 1 is near, slots 2+ are far.
- A skill hits the **first N alive pack members, front-to-back, never skipping the front monster**. There is no back-line sniping.
- `N` is derived by `rangeBandHitCount(skill, packSize)` in `src/systems/combat.ts`:
  - `melee` → `1`
  - `nearRange` → `min(2, packSize)`
  - `farRange` → `min(3, packSize)`
  - `allRange` → `max(1, packSize)`
  - default (no band tag) → `1` (single-target, preserves legacy behavior)
- **Monsters do not move or close distance.** When the frontmost member dies, the next slot's monster becomes "frontmost" as a discrete state change (`advancePack`), exactly as before. The lane's visual drift stays purely decorative and is never used for band logic.

### 2.2 Damage application

- Each skill's damage is computed **once, against the front monster** (existing `skillDamage` pipeline — gems, supports, crit, momentum, heralds, conversion all unchanged), then applied **at full value to every target in the skill's band**.
- `processSkillHits` now returns per-skill `hitsBySkill` outcomes (`{ skillId, damage, isHit, crit, ailments, targetCount }`) in addition to the existing aggregate totals, so the sim can distribute per-skill damage across the pack.
- `simulateTick` applies each hit to `currentPack[0..N-1]`, decrementing `currentLife`, then syncs the front member's life into `monsterLife` so the existing death pipeline (`advancePack`, `packCleared`, carryover) is untouched.
- **Ailments** from a multi-hit skill are applied to every target in the band (plain copies on back members; the front member's ailment path — Patient Zero, Cirrhosis, Pandemic, Virulent stacks — is unchanged).
- The existing `targeting: 'pack'` 1.5× damage multiplier is orthogonal and still applies (it rewards dedicated pack skills on top of their band).

### 2.3 Interaction with supports

- Supports can gate on band tags exactly like any other tag (`allowedTags: ['farRange']` etc.). No new support code is required — the `supportsForSkill` intersection check just sees the new tag.
- This is an extension point, not a v1 requirement. No band-gating supports ship with this spec.

---

## 3. Skill assignments (v1, all 12 skills)

| Skill | Tags | Band | Targets |
|---|---|---|---|
| Heavy Strike | attack, physical, melee | `melee` | 1 |
| Venom Strike | attack, chaos, melee, dot | `melee` | 1 |
| Smite | attack, physical, lightning, melee | `melee` | 1 |
| Essence Drain | spell, chaos, dot | `nearRange` | 2 |
| Wither Touch | spell, chaos, dot | `nearRange` | 2 |
| Firebolt | spell, fire, projectile | `farRange` | 3 |
| Spark Arrow | attack, lightning, projectile | `farRange` | 3 |
| Cleave | attack, physical, melee, aoe | `allRange` | pack |
| Ice Nova | spell, cold, aoe | `allRange` | pack |
| Blade Burst | spell, physical, aoe | `allRange` | pack |
| Molten Strike | attack, fire, melee, aoe | `allRange` | pack |
| Frost Blade | attack, cold, melee, aoe | `allRange` | pack |

Distribution: 3 melee, 2 near, 2 far, 5 all. That's a reasonable v1 spread — single-target heavy hitters (melee), a mid band for DOT spells, a long band for projectiles, and AoE as the pack-clearing tools.

---

## 4. UI (Pack Lane)

The lane in `src/components/PackLane.tsx` renders band groupings decoratively:

- **Band stripes** across the lane: Melee (red) nearest the player → Near (amber) → Far (blue), with `Melee · 1 / Near · 2 / Far · 3` labels.
- **Per-monster band chip** under each monster card (`MELEE` / `NEAR` / `FAR`) derived from `member.slot`.
- A **legend row** beneath the lane explaining band hit counts and that AoE hits the whole pack.

The stripes are purely visual. Band logic lives in the combat tags; the UI never computes reach.

---

## 5. Planned balance

Values below are intent, not shipped numbers.

- **Full damage per target** is the current implementation — a `farRange` skill deals its full hit to all 3 targets. This is a deliberate v1 choice (simplest real version) but is the **first thing to revisit in tuning** if pack skills overperform:
  - Option A: keep full damage per target (current) and rely on cooldown/damage-effectiveness to balance.
  - Option B: **(tune)** reduce per-target damage with each additional target (e.g. ×1.0, ×0.85, ×0.7 across the band) so single-target skills keep a clear ST niche.
- **Boss fights**: bosses are single-target by nature (a 1-member pack), so every band collapses to 1 target. Band choice matters mostly for pack clearing — expected.
- **Band identity goals** (tune): melee = highest single-target damage per tick; near = DOT/channeling midline; far = safe reach at moderate damage; all = lowest per-target damage but full-pack coverage. Skill damage-effectiveness and cooldowns should be tuned so each band has a reason to exist and no band strictly dominates at all pack sizes.
- **Future support ideas** (NOT v1): a support that extends a band one slot (near → far), a support that converts a skill to `allRange` at reduced damage, ailment-spread supports that require a band tag.

---

## 6. Scope discipline

Do **NOT** build in v1:

- Continuous distance values, per-skill numeric range fields
- Monster movement / closing distance during combat
- Back-line targeting (skipping the front monster to snipe a back-liner)
- Collision, pathfinding, or any spatial engine
- Per-target targeting UI (clicking a specific pack member)

Band membership is a static slot index. Anything that starts requiring coordinates is the M5 spatial engine we deliberately cut — stop and flag it.

---

## 7. Validation

- `bun tsc -b --noEmit` — no type errors
- `bun test` — the range-band suite in `src/systems/combat.test.ts` ("skill range bands (pack multi-hit)"):
  - `rangeBandHitCount` maps bands to correct front-to-back counts (and caps at live pack size)
  - melee (Heavy Strike) damages only the front member
  - nearRange (Essence Drain) damages the front two
  - farRange (Firebolt) damages the front three
  - allRange (Ice Nova) damages the whole 4-member pack
- Tests drive **real skill IDs** (band tags live on the data in `src/data/skills.ts`), so a tag accidentally removed from data fails the suite.
