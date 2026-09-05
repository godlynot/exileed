import type { ReactNode } from 'react'
import type { Character, CombatState } from '../types/game.ts'
import { DAMAGE, TICKS_PER_SECOND, MOVEMENT, effectiveMovementSpeed, monsterScalingMultiplier } from '../data/balance.ts'
import { MINIONS } from '../data/minions.ts'
import { estimateMinionDpsPerTick, estimateMinionDpsShare } from '../systems/minions.ts'
import {
  momentumDamageMultiplier,
  momentumActionSpeed,
  momentumDamageReduction,
  momentumCap,
} from '../systems/momentum.ts'
import { getActiveHeralds, getActiveBuffs } from '../systems/characterEffects.ts'
import { hitChance } from '../systems/combat.ts'

function estimatedArmourMitigation(character: Character): number {
  // Sample hit damage follows the same act-curve scaling as monsters so the
  // displayed mitigation reflects the actual hits the player is facing.
  const sampleHitDamage = Math.max(10, character.level * 10 * monsterScalingMultiplier(character.level))
  return character.armour / (character.armour + DAMAGE.ARMOUR_MITIGATION_DENOMINATOR * sampleHitDamage)
}

function estimatedEvadeChance(character: Character, combat: CombatState): number {
  const attackerAccuracy = combat.monster?.accuracy ?? Math.max(50, character.level * 20 + 50)
  const evasionStreak = combat.monster ? combat.playerEvasionStacks : 0
  // Keep the displayed estimate on the same asymptotic hit formula used by combat.
  return 1 - hitChance(attackerAccuracy, character.evasion, evasionStreak)
}

function calculateDps(character: Character, combat: CombatState): number {
  const avgPhys = (character.basePhysicalDamageMin + character.basePhysicalDamageMax) / 2
  const critBonus = 1 + character.criticalChance * (character.criticalMultiplier - 1)
  const actionSpeed = momentumActionSpeed(combat.momentum, character)
  const damageMult = momentumDamageMultiplier(combat.momentum, character)
  return avgPhys * character.attackRate * actionSpeed * damageMult * critBonus
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="eyebrow text-[var(--text-muted)]">{children}</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  )
}

function StatRow({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 odd:bg-[var(--bg-secondary)]/55">
      <span className="min-w-0 truncate text-xs text-[var(--text-secondary)]">{label}</span>
      <span className={`data-value shrink-0 text-xs ${accent ? 'text-[var(--accent-gold-bright)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </span>
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/75 p-2.5">
      <div className="eyebrow text-[var(--text-muted)]">{label}</div>
      <div className="data-value mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</div>
      {detail && <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{detail}</div>}
    </div>
  )
}

export function CharacterStats({ character, combat }: { character: Character; combat: CombatState }) {
  const dps = calculateDps(character, combat)
  const heralds = getActiveHeralds(character)
  const buffs = getActiveBuffs(character)
  const momentum = combat.momentum
  const momentumCapValue = momentumCap(momentum, character)
  const currentTargetHitChance = combat.monster
    ? hitChance(character.accuracy, combat.monster.evasion, combat.monsterEvasionStacks)
    : null
  const currentIncomingHitChance = combat.monster
    ? hitChance(combat.monster.accuracy, character.evasion, combat.playerEvasionStacks)
    : null
  const isMax = momentum.stacks >= momentumCapValue
  const momentumPercent = momentumCapValue > 0
    ? Math.min(100, (momentum.stacks / momentumCapValue) * 100)
    : 0

  const resistances = [
    { key: 'fire' as const, label: 'Fire', value: character.resistances.fire * 100 },
    { key: 'cold' as const, label: 'Cold', value: character.resistances.cold * 100 },
    { key: 'lightning' as const, label: 'Lightning', value: character.resistances.lightning * 100 },
    { key: 'chaos' as const, label: 'Chaos', value: character.resistances.chaos * 100 },
  ]

  // Minion army summary (minion-system-spec.md §9.4): one row per summon plus
  // the army's DPS contribution when a target is present.
  const summons = character.summons ?? []
  const minionRows = summons.map((summon, index) => {
    const def = MINIONS[summon.minionDefId]
    const instanceIndex = summons.slice(0, index + 1).filter(s => s.minionDefId === summon.minionDefId).length
    const live = combat.party?.members.find(
      member => member.id === `minion_${summon.minionDefId}_${instanceIndex}`,
    )
    return {
      key: `minion_${summon.minionDefId}_${instanceIndex}`,
      label: `${def?.name ?? summon.minionDefId}${instanceIndex > 1 ? ` ${instanceIndex}` : ''}`,
      value: summon.alive
        ? `L${summon.level} · ${Math.round(live?.life ?? 0)}/${Math.round(live?.maxLife ?? 0)}`
        : `Reviving ${Math.max(1, Math.ceil(summon.respawnTicksRemaining / TICKS_PER_SECOND))}s`,
      accent: summon.alive,
    }
  })
  const monster = combat.monster
  const heraldsActive = combat.herald?.active ?? []
  const unwavering = character.special.unwaveringDeclaration === true
  const minionDps = monster && combat.party
    ? combat.party.members
        .filter(member => member.role === 'minion' && member.alive)
        .reduce(
          (sum, member) =>
            sum + estimateMinionDpsPerTick(member, monster, heraldsActive, unwavering, combat.herald?.tideRamp ?? 0),
          0,
        ) * TICKS_PER_SECOND
    : null
  const minionDpsShare = monster && combat.party
    ? estimateMinionDpsShare(character, combat.party.members, monster, heraldsActive, unwavering, combat)
    : null

  return (
    <div className="game-panel space-y-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-[var(--accent-crystal)]">Build telemetry</div>
          <h3 className="mt-1 text-base text-[var(--accent-gold)]">Character Stats</h3>
        </div>
        <span className="rounded-full border border-[var(--accent-crystal)]/25 bg-[var(--accent-crystal)]/10 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--accent-crystal)]">
          Live
        </span>
      </div>

      <div className="rounded-xl border border-[var(--accent-gold)]/25 bg-[var(--accent-gold-muted)]/55 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow text-[var(--accent-gold)]">Estimated DPS</div>
            <div className="data-value mt-1 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              {Math.floor(dps)}
            </div>
          </div>
          <div className="text-right text-[10px] leading-relaxed text-[var(--text-muted)]">
            averaged physical output
            <br />before target mitigation
          </div>
        </div>
        <div className="mt-3 h-px rounded-full bg-[var(--accent-gold)]/35" aria-hidden="true" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Attack rate"
          value={`${(character.attackRate * momentumActionSpeed(momentum, character)).toFixed(2)}/s`}
          detail="with momentum"
        />
        <MetricCard label="Crit chance" value={`${(character.criticalChance * 100).toFixed(1)}%`} />
        <MetricCard label="Crit multi" value={`${character.criticalMultiplier.toFixed(2)}x`} />
        <MetricCard
          label="Accuracy"
          value={`${Math.floor(character.accuracy)}`}
          detail={currentTargetHitChance === null ? 'no target' : `${(currentTargetHitChance * 100).toFixed(1)}% chance to hit current target`}
        />
      </div>

      {/* Movement (Stage 1 spatial): travel speed shown like any other stat.
          Shows the effective speed incl. Momentum action speed, plus the
          increased pool and the cap from MOVEMENT.INCREASED_CAP. */}
      <div className="grid grid-cols-1 gap-2">
        <MetricCard
          label="Movement speed"
          value={`${(effectiveMovementSpeed(character, momentumActionSpeed(momentum, character)) / MOVEMENT.BASE_SPEED * 100).toFixed(0)}%`}
          detail={`+${Math.min(character.movementSpeed, MOVEMENT.INCREASED_CAP) * 100}% increased (cap +${MOVEMENT.INCREASED_CAP * 100}%) · base ${MOVEMENT.BASE_SPEED} u/tick`}
        />
      </div>

      <section className="space-y-2" aria-labelledby="defence-heading">
        <SectionHeading>Defence</SectionHeading>
        <h4 id="defence-heading" className="sr-only">Defence</h4>
        <div className="space-y-0.5">
          <StatRow label="Max Life" value={Math.floor(character.maxLife)} />
          <StatRow label="Life Regen" value={`${(character.lifeRegen * 5).toFixed(1)}/s`} />
          <StatRow label="Max Energy Shield" value={Math.floor(character.maxEnergyShield)} />
          <StatRow label="ES Recharge" value={`${(character.esRecharge * 5).toFixed(1)}/s`} />
          <StatRow label="Armour" value={Math.floor(character.armour)} />
          <StatRow label="Est. Phys Reduction" value={`${(estimatedArmourMitigation(character) * 100).toFixed(1)}%`} accent />
          <StatRow label="Evasion" value={Math.floor(character.evasion)} />
          <StatRow label="Est. Evade Chance" value={`${(estimatedEvadeChance(character, combat) * 100).toFixed(1)}%`} accent />
          <StatRow
            label="Enemy Hit Chance"
            value={currentIncomingHitChance === null ? '—' : `${(currentIncomingHitChance * 100).toFixed(1)}%`}
            accent
          />
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="resistance-heading">
        <SectionHeading>Resistances</SectionHeading>
        <h4 id="resistance-heading" className="sr-only">Resistances</h4>
        <div className="grid grid-cols-2 gap-2">
          {resistances.map(res => {
            const isUncapped = res.value < DAMAGE.RESISTANCE_CAP * 100
            const fill = Math.max(0, Math.min(100, (res.value / (DAMAGE.RESISTANCE_CAP * 100)) * 100))
            return (
              <div key={res.key} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/55 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">{res.label}</span>
                  <span className={`data-value text-xs ${isUncapped ? 'text-amber-300' : 'text-[var(--accent-green)]'}`}>
                    {res.value.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-primary)]">
                  <div
                    className={`h-full rounded-full ${isUncapped ? 'bg-amber-400' : 'bg-[var(--accent-green)]'}`}
                    style={{ width: `${fill}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">cap {(DAMAGE.RESISTANCE_CAP * 100).toFixed(0)}%</div>
              </div>
            )
          })}
        </div>
      </section>

      {(character.special.momentum || combat.momentum.stacks > 0) && (
        <section className="space-y-2" aria-labelledby="momentum-heading">
          <SectionHeading>Momentum</SectionHeading>
          <h4 id="momentum-heading" className="sr-only">Momentum</h4>
          <div className="rounded-lg border border-[var(--accent-gold)]/20 bg-[var(--accent-gold-muted)]/35 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--text-secondary)]">Stacks</span>
              <span className={`data-value text-xs font-medium ${isMax ? 'text-[var(--accent-gold-bright)]' : 'text-[var(--text-primary)]'}`}>
                {momentum.stacks} / {momentumCapValue}
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-primary)]"
              role="progressbar"
              aria-label="Momentum stacks"
              aria-valuemin={0}
              aria-valuemax={momentumCapValue}
              aria-valuenow={momentum.stacks}
            >
              <div
                className="h-full rounded-full bg-[var(--accent-gold)] transition-[width] duration-300"
                style={{ width: `${momentumPercent}%` }}
                aria-hidden="true"
              />
            </div>
            {momentum.stacks > 0 && (
              <div className="mt-2 space-y-0.5">
                <StatRow label="More Damage" value={`${Math.round((momentumDamageMultiplier(momentum, character) - 1) * 100)}%`} />
                <StatRow label="Action Speed" value={`${Math.round((momentumActionSpeed(momentum, character) - 1) * 100)}%`} />
                <StatRow label="Damage Reduction" value={`${Math.round(momentumDamageReduction(momentum) * 100)}%`} />
              </div>
            )}
          </div>
        </section>
      )}

      {minionRows.length > 0 && (
        <section className="space-y-2" aria-labelledby="minions-heading">
          <SectionHeading>Minions</SectionHeading>
          <h4 id="minions-heading" className="sr-only">Minions</h4>
          {minionDps !== null && minionDpsShare !== null && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--text-secondary)]">Army DPS contribution</span>
                <span className="data-value text-xs text-emerald-300">
                  {Math.round(minionDps)}
                  {isFinite(minionDpsShare)
                    ? ` · +${Math.round(minionDpsShare * 100)}% of yours`
                    : ''}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            {minionRows.map(row => (
              <StatRow key={row.key} label={row.label} value={row.value} accent={row.accent} />
            ))}
          </div>
        </section>
      )}

      {(heralds.length > 0 || buffs.length > 0) && (
        <section className="space-y-2" aria-labelledby="effects-heading">
          <SectionHeading>Active Effects</SectionHeading>
          <h4 id="effects-heading" className="sr-only">Active Effects</h4>
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Active character effects">
            {heralds.map(herald => (
              <span
                key={herald.label}
                title={herald.desc}
                aria-label={`${herald.label}: ${herald.desc}`}
                role="listitem"
                className="cursor-help rounded-full border border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 px-2.5 py-1 text-xs text-[var(--accent-blue)]"
              >
                {herald.label}
              </span>
            ))}
            {buffs.map(buff => (
              <span
                key={buff.label}
                title={buff.desc}
                aria-label={`${buff.label}: ${buff.desc}`}
                role="listitem"
                className="cursor-help rounded-full border border-[var(--accent-gold)]/40 bg-[var(--accent-gold-muted)] px-2.5 py-1 text-xs text-[var(--accent-gold)]"
              >
                {buff.label}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
