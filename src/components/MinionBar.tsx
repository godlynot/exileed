import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Character, CombatState } from '../types/game.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'
import { MINIONS } from '../data/minions.ts'
import { estimateMinionDpsShare, resolveMinionMember } from '../systems/minions.ts'

interface MinionBarProps {
  character: Character
  combat: CombatState
}

interface CardData {
  id: string
  defId: string
  name: string
  icon: string
  level: number
  life: number
  maxLife: number
  energyShield: number
  maxEnergyShield: number
  alive: boolean
  respawnSeconds: number
  instanceIndex: number
}

function minionIcon(defId: string): string {
  if (defId.includes('sentinel')) return '🛡️'
  if (defId.includes('wretch')) return '🐛'
  if (defId.includes('wisp')) return '✨'
  return '👽'
}

/** Rows shown in the expanded detail: label + value pairs from the live member. */
function statRows(member: ReturnType<typeof resolveMinionMember>) {
  return [
    { label: 'Life', value: `${Math.round(member.maxLife)}` },
    ...(member.maxEnergyShield > 0 ? [{ label: 'Energy Shield', value: `${Math.round(member.maxEnergyShield)}` }] : []),
    { label: 'Armour', value: `${Math.round(member.armour)}` },
    { label: 'Evasion', value: `${Math.round(member.evasion)}` },
    {
      label: 'Attack',
      value: `${member.attack.flatDamage.min}–${member.attack.flatDamage.max} ${member.attack.flatDamage.type} @ ${member.attack.attackRate.toFixed(2)}/s`,
    },
  ]
}

export function MinionBar({ character, combat }: MinionBarProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // One card per persisted summon, live state straight from the combat party
  // mirror so the bar always matches what actually fights (spec §9.1).
  const cards: CardData[] = (character.summons ?? []).map((summon, index) => {
    const def = MINIONS[summon.minionDefId]
    const instanceIndex = (character.summons ?? [])
      .slice(0, index + 1)
      .filter(s => s.minionDefId === summon.minionDefId).length
    const liveMember = summon.alive
      ? (combat.party?.members ?? []).find(member => member.id === `minion_${summon.minionDefId}_${instanceIndex}`)
      : null
    const fallback = def ? resolveMinionMember(summon, def, instanceIndex) : null
    return {
      id: `minion_${summon.minionDefId}_${instanceIndex}`,
      defId: summon.minionDefId,
      name: def?.name ?? summon.minionDefId,
      icon: minionIcon(summon.minionDefId),
      level: summon.level,
      life: liveMember?.life ?? fallback?.life ?? 0,
      maxLife: liveMember?.maxLife ?? fallback?.maxLife ?? 1,
      energyShield: liveMember?.energyShield ?? fallback?.energyShield ?? 0,
      maxEnergyShield: liveMember?.maxEnergyShield ?? fallback?.maxEnergyShield ?? 0,
      alive: summon.alive,
      respawnSeconds: summon.respawnTicksRemaining / TICKS_PER_SECOND,
      instanceIndex,
    }
  })

  if (cards.length === 0) return null

  const heralds = combat.herald?.active ?? []
  const dpsShare = combat.monster
    ? estimateMinionDpsShare(character, combat.party?.members ?? [], combat.monster, heralds, character.special.unwaveringDeclaration === true, combat)
    : null

  return (
    <div className="game-panel rounded-xl p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span className="eyebrow">Minion Bar</span>
          <span className="text-[10px] text-[var(--text-muted)]">
            {cards.filter(c => c.alive).length}/{cards.length} alive
          </span>
        </div>
        {dpsShare !== null && (
          <span
            title="Estimated minion DPS as a share of your own (target band 20–40%)"
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
          >
            {isFinite(dpsShare) ? `+${Math.round(dpsShare * 100)}% DPS` : 'solo army'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {cards.map(card => {
          const lifePercent = Math.max(0, (card.life / Math.max(1, card.maxLife)) * 100)
          const esPercent = card.maxEnergyShield > 0 ? Math.max(0, (card.energyShield / card.maxEnergyShield) * 100) : null
          const expanded = expandedId === card.id
          const member = combat.party?.members.find(m => m.id === card.id)
          return (
            <div key={card.id} className="min-w-[7.5rem] flex-1 sm:max-w-[11rem]">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : card.id)}
                className={`w-full rounded-lg border p-2 text-left transition-colors ${
                  card.alive
                    ? 'border-emerald-500/25 bg-emerald-500/[0.06] hover:border-emerald-400/50'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={card.alive ? '' : 'grayscale opacity-70'}>{card.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]" title={card.name}>
                    {card.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">L{card.level}</span>
                </div>
                {card.alive ? (
                  <div className="mt-1.5 space-y-0.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-primary)]">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-emerald-500"
                        animate={{ width: `${lifePercent}%` }}
                        transition={{ duration: 0.15 }}
                      />
                    </div>
                    {esPercent !== null && (
                      <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-primary)]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                          animate={{ width: `${esPercent}%` }}
                          transition={{ duration: 0.15 }}
                        />
                      </div>
                    )}
                    <div className="flex justify-between text-[9px] text-[var(--text-muted)]">
                      <span>{Math.max(0, Math.round(card.life))}/{Math.round(card.maxLife)}</span>
                      {card.maxEnergyShield > 0 && <span>{Math.round(card.energyShield)} ES</span>}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                    Reviving in {Math.max(1, Math.ceil(card.respawnSeconds))}s
                  </div>
                )}
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/70 p-2">
                      {member ? (
                        <div className="space-y-0.5">
                          {statRows(member).map(row => (
                            <div key={row.label} className="flex justify-between gap-2 text-[10px]">
                              <span className="text-[var(--text-secondary)]">{row.label}</span>
                              <span className="data-value text-[var(--text-primary)]">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-[var(--text-muted)] italic">
                          {card.alive ? 'Stats unavailable this tick.' : 'Down — auto-revives when the timer ends.'}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
