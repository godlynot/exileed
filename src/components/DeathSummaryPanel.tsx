import { motion } from 'framer-motion'
import type { CombatState, DamageType } from '../types/game.ts'
import { Skull } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { CHARACTER, TICKS_PER_SECOND } from '../data/balance.ts'

const DAMAGE_TYPE_COLORS: Record<DamageType, string> = {
  physical: 'text-gray-300',
  fire: 'text-orange-400',
  cold: 'text-cyan-400',
  lightning: 'text-yellow-300',
  chaos: 'text-purple-400',
}

const DAMAGE_TYPE_BG_COLORS: Record<DamageType, string> = {
  physical: 'bg-gray-400',
  fire: 'bg-orange-500',
  cold: 'bg-cyan-500',
  lightning: 'bg-yellow-400',
  chaos: 'bg-purple-500',
}

function rarityLabel(rarity: string) {
  switch (rarity) {
    case 'magic': return 'Magic'
    case 'rare': return 'Rare'
    case 'boss': return 'Boss'
    default: return 'Normal'
  }
}

function rarityColor(rarity: string) {
  switch (rarity) {
    case 'magic': return 'text-blue-400'
    case 'rare': return 'text-yellow-400'
    case 'boss': return 'text-purple-400'
    default: return 'text-gray-400'
  }
}

function formatDamageType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

interface DeathSummaryPanelProps {
  combat: CombatState
}

export function DeathSummaryPanel({ combat }: DeathSummaryPanelProps) {
  const summary = combat.deathSummary

  // Defensive: if summary is missing or malformed, don't render anything.
  if (!summary || typeof summary !== 'object') return null
  if (!summary.damageTaken || typeof summary.damageTaken !== 'object') return null

  const entries = Object.entries(summary.damageTaken)
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
  const total = entries.reduce((sum, [, value]) => sum + (value as number), 0)

  const monsterName = summary.monsterName ?? 'Unknown'
  const monsterLevel = typeof summary.monsterLevel === 'number' ? summary.monsterLevel : '?'
  const monsterRarity = typeof summary.monsterRarity === 'string' ? summary.monsterRarity : 'normal'
  const monsterModifiers = Array.isArray(summary.monsterModifiers) ? summary.monsterModifiers : []

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto bg-gradient-to-b from-[#1a1515] to-[#0f0c0c] border border-red-900/60 rounded-xl p-4 sm:p-6 shadow-[0_0_40px_-10px_rgba(220,38,38,0.35)]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-red-900/30">
          <div className="p-2 bg-red-950/60 rounded-full border border-red-700/40">
            <Skull className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-serif text-red-500 tracking-wide">You Died</h3>
            <p className="text-xs text-red-300/70">Death Summary</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Killer info cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 bg-[#15161d]/80 border border-[#2e303a] rounded-lg p-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Killed by</span>
              <span className="text-sm font-medium text-gray-100">{monsterName}</span>
            </div>
            <div className="bg-[#15161d]/80 border border-[#2e303a] rounded-lg p-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Level</span>
              <span className="text-sm font-medium text-gray-100">{monsterLevel}</span>
            </div>
          </div>

          <div className="bg-[#15161d]/80 border border-[#2e303a] rounded-lg p-3">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Rarity</span>
            <span className={`text-sm font-semibold uppercase tracking-wide ${rarityColor(monsterRarity)}`}>
              {rarityLabel(monsterRarity)}
            </span>
          </div>

          {/* Modifiers */}
          {monsterModifiers.length > 0 && (
            <div className="bg-[#15161d]/80 border border-[#2e303a] rounded-lg p-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Modifiers</span>
              <div className="flex flex-wrap gap-1.5">
                {monsterModifiers.map((mod, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#2e303a]/80 text-gray-300 border border-[#3f414d]"
                  >
                    {String(mod)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Damage breakdown */}
          <div className="bg-[#15161d]/80 border border-[#2e303a] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Damage Taken</span>
              <span className="text-xs font-medium text-gray-300">{total.toLocaleString()} total</span>
            </div>
            <div className="space-y-2">
              {entries.map(([type, value]) => {
                const pct = total > 0 ? (value / total) * 100 : 0
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className={`text-xs w-16 shrink-0 ${DAMAGE_TYPE_COLORS[type as DamageType]}`}>
                      {formatDamageType(type)}
                    </span>
                    <div className="flex-1 h-2.5 bg-[#2e303a] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className={`h-full ${DAMAGE_TYPE_BG_COLORS[type as DamageType]}`}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-14 text-right tabular-nums">{value.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Respawn timer */}
          <RespawnTimer combat={combat} />
        </div>
      </motion.div>
    </div>
  )
}

function RespawnTimer({ combat }: { combat: CombatState }) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    let rafId = 0
    const startTime = performance.now()
    const totalMs = CHARACTER.RESPAWN_TIME_SECONDS * 1000

    const tick = (now: number) => {
      const elapsed = now - startTime
      const remaining = Math.max(0, totalMs - elapsed)
      const progress = remaining / totalMs
      bar.style.width = `${progress * 100}%`

      if (remaining > 0) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const secondsLeft = Math.max(0, Math.ceil(combat.respawnTicks / TICKS_PER_SECOND))

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span>
          Respawning in{' '}
          <span className="inline-block min-w-[1rem] text-center tabular-nums text-gray-200">
            {secondsLeft}
          </span>{' '}
          second{secondsLeft !== 1 && 's'}
        </span>
        <span className="text-red-400/80 tabular-nums">{Math.max(0, combat.respawnTicks)} ticks</span>
      </div>
      <div className="h-1.5 bg-[#2e303a] rounded-full overflow-hidden">
        <div ref={barRef} className="h-full bg-red-600" />
      </div>
    </div>
  )
}
