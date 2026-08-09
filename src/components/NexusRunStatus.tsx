import { Gem, ShieldAlert, Sparkles, Target } from 'lucide-react'
import { useGameStore } from '../store/gameStore.ts'
import { mapAffixDescription } from '../data/mapAffixes.ts'
import { NEXUS_TIER_REWARD_MILESTONES, nexusMapPacksForTier } from '../systems/nexus.ts'

export function NexusRunStatus() {
  const nexus = useGameStore(state => state.nexus)
  const activeMap = nexus.activeMapId
    ? nexus.maps.find(map => map.id === nexus.activeMapId)
    : undefined

  if (!activeMap) return null

  const packsRequired = nexusMapPacksForTier(activeMap.tier)
  const progress = Math.min(100, Math.max(0, (nexus.packsCleared / packsRequired) * 100))

  return (
    <section
      aria-label="Active Nexus map"
      className="rounded-xl border border-[var(--accent-crystal)]/35 bg-gradient-to-br from-[var(--bg-elevated)] via-[var(--bg-panel)] to-[var(--bg-secondary)] p-4 shadow-[0_0_24px_rgba(103,209,227,0.1)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-[var(--accent-crystal)]/30 bg-[var(--accent-crystal)]/10 p-2 text-[var(--accent-crystal)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent-crystal)]">The Nexus</h2>
              <span className="rounded-full border border-[var(--accent-crystal)]/30 bg-[var(--accent-crystal)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-crystal)]">
                ACTIVE
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Tier {activeMap.tier} <span className="text-[var(--text-muted)]">•</span> Monster level {activeMap.monsterLevel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-crystal)]/20 bg-[var(--accent-crystal)]/5 px-2.5 py-1.5 text-xs text-[var(--accent-crystal)]">
          <Gem className="h-3.5 w-3.5" />
          <span>{activeMap.currentCharges} charge{activeMap.currentCharges === 1 ? '' : 's'} available</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-[var(--accent-crystal)]" /> Packs cleared</span>
            <span className="data-value text-[var(--text-primary)]">{nexus.packsCleared} / {packsRequired}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Nexus map pack progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-valuetext={`${nexus.packsCleared} of ${packsRequired} packs cleared`}
            className="h-2 overflow-hidden rounded-full border border-[var(--accent-crystal)]/25 bg-[var(--bg-primary)]"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent-crystal)]/60 to-[var(--accent-crystal)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-right text-[11px] text-[var(--text-muted)]">
          <ShieldAlert className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          <span>One charge is spent when the map is cleared</span>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Milestone crystals</span>
          <span className="text-[10px] text-[var(--text-muted)]">First clear only</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {NEXUS_TIER_REWARD_MILESTONES.map(milestone => {
            const claimed = (nexus.completedTierRewards ?? []).includes(milestone.tier)
            const current = activeMap.tier >= milestone.tier
            return (
              <div
                key={milestone.tier}
                className={`rounded-md border px-2 py-1.5 ${
                  claimed
                    ? 'border-[var(--accent-gold)]/45 bg-[var(--accent-gold)]/10'
                    : current
                      ? 'border-[var(--accent-crystal)]/35 bg-[var(--accent-crystal)]/10'
                      : 'border-[var(--border)] bg-[var(--bg-primary)]/30'
                }`}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className={claimed ? 'text-[var(--accent-gold)]' : 'text-[var(--text-secondary)]'}>T{milestone.tier}</span>
                  <span className={claimed ? 'text-[var(--accent-gold)]' : 'text-[var(--accent-crystal)]'}>+{milestone.amount}</span>
                </div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  {claimed ? 'Claimed' : current ? 'Eligible' : 'Locked'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {activeMap.affixes.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Rolled modifiers</div>
          <div className="flex flex-wrap gap-1.5">
            {activeMap.affixes.map(affix => (
              <span
                key={`${activeMap.id}-${affix.id}`}
                title={mapAffixDescription(affix)}
                className="rounded-md border border-[var(--accent-crystal)]/25 bg-[var(--accent-crystal)]/10 px-2 py-1 text-[11px] text-[var(--accent-crystal)]"
              >
                {mapAffixDescription(affix)}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        Clear the remaining packs to return automatically to your previous campaign zone.
      </p>
    </section>
  )
}
