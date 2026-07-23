# Skill System Spec (Milestone M4.5)

Schedule this AFTER M4 (campaign exists) and BEFORE M5 (endgame). Do not build it in a vacuum — it needs campaign monsters and zones to test against, and M5's endgame will assume skills exist.

This is the staged-hybrid model: skill slots + per-skill support slots, with NO gear sockets in v1. Gear sockets are an explicit post-v1 extension. Build the support model as "supports are linked to a skill," so gear sockets can later be added as an extension rather than a rewrite.

## 1. Core model

- The character has a small number of **active skill slots** — start with **4**. Slot count can grow later via passives/campaign rewards.
- Each equipped skill has its own **support slots**. Support-slot count is **global across all skills** (every skill always has the same number) and grows at fixed **campaign milestones**, NOT from trials. Trials grant ascendancy points only. Progression:
  - **Start:** 2 support slots per skill
  - **Act 3 complete:** 3 per skill
  - **Act 6 complete:** 4 per skill
  - **Act 9 complete:** 5 per skill (cap)

  Rationale: milestone-based growth guarantees every player reaches the same loadout depth regardless of which skills they level, needs no per-skill allocation UI, and paces loadout depth evenly across the campaign so the character enters the endgame at full support depth. A fully-progressed character has 5 supports on each of 4 skills = 20 support effects total — comparable to a well-linked PoE character but spread across the loadout rather than concentrated on one carry skill. Store the current per-skill slot count as a single game-state value driven by campaign progress; do not track it per-skill.
- **Skills** grant an automatic active ability. **Supports** modify the specific skill they're slotted into and do nothing on their own.
- Both skills and supports **drop as loot** and **level with use** (see §5).
- There are **no sockets, colours, or link groups on gear** in v1. All linking happens inside a skill's own support panel.

## 2. The character acts through skills — no separate basic attack

There is no vestigial auto-attack. The character automatically cycles its equipped skills on their triggers/cooldowns. A level-1 character simply has one basic skill equipped (e.g. "Strike" or "Bolt") occupying one slot.

This removes the ambiguity of "does this "on hit" effect count the basic attack or the skill" — everything is a skill.

## 3. Skills

Each skill is data in `src/data/skills.ts`. Fields:

```ts
interface Skill {
  id: string;
  name: string;
  tags: SkillTag[];          // e.g. "attack" | "spell" | "physical" | "chaos" | "fire" | "cold" | "lightning" | "dot" | "aoe" | "projectile"
  baseDamage: { min: number; max: number; type: DamageType };
  damageEffectiveness: number; // how much flat added damage from stats/supports applies
  cooldownTicks: number;       // how often it auto-fires, in sim ticks (10/sec)
  targeting: "single" | "pack"; // pack = hits the whole current pack set (no positioning)
  appliesAilment?: AilmentSpec; // e.g. poison DOT
}
// NOTE: support-slot count is NOT per-skill data — it's a single global value
// driven by campaign progress (see §1). Every skill exposes the current global count.
```

Skills scale off the character's stats using the existing calculator (flat → increased → more → special), same pipeline as auto-attacks used before. A skill's `tags` gate which supports can modify it (§4).

**v1 skill pool target:** ~12-16 skills spanning the damage types and both attack/spell, so every class has viable options. At least: one basic attack, one basic spell, 2-3 per damage type, 2-3 DOT-focused skills (which Plaguebringer wants), 1-2 pack-targeting AoE skills.

## 4. Supports

Each support is data in `src/data/supports.ts`. A support modifies the skill it's slotted into.

```ts
interface Support {
  id: string;
  name: string;
  allowedTags: SkillTag[];   // support only works on skills sharing >=1 of these tags
  modifiers: StatMod[];      // applied to the linked skill's computation only
  special?: string;          // hook for non-stat effects (e.g. "spreadDotOnDeath", "splitProjectiles")
}
```

**Tag compatibility is the key rule:** a support only functions on a skill whose `tags` intersect the support's `allowedTags`. "Added Chaos Damage" (allowedTags: attack, spell) works on most skills; "Increased Area" (allowedTags: aoe) only works on AoE skills; "Ailment Duration" (allowedTags: dot) only on DOT skills. Slotting an incompatible support shows a clear "no effect — wrong skill type" warning rather than silently doing nothing.

**v1 support pool target:** ~10-14 supports. Include at least: added damage (per type), increased damage, faster casting (lower cooldown), ailment magnitude, ailment duration, added area/pack-hit, and 2-3 "special" transformers (spread-on-death, extra projectile/split, convert-damage-type). The special transformers are where build depth lives — prioritize them.

## 5. Levelling

- Skills and supports gain XP when the skill fires / deals damage, levelling independently of character level, up to a cap (e.g. 20).
- Higher level = higher base values (skill base damage, support modifier magnitude).
- Keep this simple: a flat XP curve per gem, no prestige. Do not let gem level grant permanent character stats — it only scales the gem itself.

## 6. How skills interact with existing systems

**Passive tree & ascendancies:** the character stat calculator already produces global modifiers. Skills consume those the same way the old auto-attack did. Two specific interactions to implement:

- **Hit-counting ascendancy keystones are PER-SKILL.** Measured Strikes ("every 3rd hit deals double") counts each skill's own casts independently, not a global counter. Each skill instance carries its own hit counter. Reason: a global counter fires unpredictably across skills on different cooldowns and the player can't reason about it.
- **"On kill" / "on crit" keystones** (Warlord Momentum, etc.) are global — a kill is a kill regardless of which skill did it. No per-skill tracking needed.

**DOT sources are now plural.** DOTs can come from: a skill's innate `appliesAilment`, an ailment-adding support, or another mechanic (burning ground, Herald's burst). This is what makes Plaguebringer's Plaguewind keystone meaningful — see below.

**Plaguewind (Contagion keystone) — confirmed definition:** when an afflicted enemy dies, ALL damage-over-time effects on it spread to the rest of its pack, regardless of source. This is a system-level rule operating on "every DOT currently on the dying enemy," not an ailment-specific one.

## 7. UI

- A **Skills panel** (new tab): shows the 4 skill slots; clicking a slot opens a picker of owned skills. Each equipped skill shows its support slots beneath it; clicking a support slot opens a picker of owned, tag-compatible supports (incompatible ones greyed with the reason).
- Each skill card shows its computed damage/cooldown AFTER supports, so the player sees the effect of a support immediately.
- Owned-but-unequipped skills/supports live in the existing inventory or a dedicated gem stash.

## 8. Combat integration

- `simulateTick` (from the M4 combat-events work) now iterates equipped skills, fires any whose cooldown elapsed, computes each skill's damage through the calculator with its supports applied, and emits the same `hitLanded` / `monsterDied` / etc. events.
- Each skill computation is a pure function of (skill, supports, characterStats, target) → damage + events. Keep it pure so offline progress reuses it.
- Per-skill state (cooldown timer, hit counter for keystones) lives in combat state, not the save file's permanent data — though equipped loadout and gem levels DO save.

## 9. Save schema

Add: `equippedSkills` (slot → skill id + its support ids), `ownedGems` (skill/support ids + levels + xp). Version + migrate as usual.

## 10. Scope discipline

Do NOT build in v1: gear sockets, socket colours, link groups, gem quality, alternate-quality gems, vaal/corrupted gems. These are all post-v1. If you find yourself adding a "socket" concept to gear, stop — that's out of scope. The support-to-skill link is the only linking that exists in v1.
