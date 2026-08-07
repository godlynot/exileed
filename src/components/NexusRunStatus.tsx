import { Gem, ShieldAlert, Sparkles, Target } from 'lucide-react'
import { useGameStore } from '../store/gameStore.ts'
import { mapAffixDescription } from '../data/mapAffixes.ts'
import { nexusMapPacksForTier } from '../systems/nexus.ts'

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
      className="rounded-xl border border-[#7e14ff]/50 bg-gradient-to-br from-[#1a1525] via-[#15161d] to-[#111318] p-4 shadow-[0_0_24px_rgba(126,20,255,0.12)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-[#b57eff]/30 bg-[#7e14ff]/15 p-2 text-[#b57eff]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d8b8ff]">The Nexus</h2>
              <span className="rounded-full border border-[#b57eff]/30 bg-[#b57eff]/10 px-2 py-0.5 text-[10px] font-medium text-[#d8b8ff]">
                ACTIVE
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Tier {activeMap.tier} <span className="text-gray-600">•</span> Monster level {activeMap.monsterLevel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-1.5 text-xs text-cyan-200">
          <Gem className="h-3.5 w-3.5" />
          <span>{activeMap.currentCharges} charge{activeMap.currentCharges === 1 ? '' : 's'} available</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-[#b57eff]" /> Packs cleared</span>
            <span className="tabular-nums text-gray-300">{nexus.packsCleared} / {packsRequired}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-[#7e14ff]/30 bg-[#0b0c10]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7e14ff] to-[#d8b8ff] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-right text-[11px] text-gray-500">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          <span>One charge is spent when the map is cleared</span>
        </div>
      </div>

      {activeMap.affixes.length > 0 && (
        <div className="mt-4 border-t border-[#2e303a] pt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Rolled modifiers</div>
          <div className="flex flex-wrap gap-1.5">
            {activeMap.affixes.map(affix => (
              <span
                key={`${activeMap.id}-${affix.id}`}
                title={mapAffixDescription(affix)}
                className="rounded-md border border-[#b57eff]/25 bg-[#7e14ff]/10 px-2 py-1 text-[11px] text-[#dfc7ff]"
              >
                {mapAffixDescription(affix)}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-500">
        Clear the remaining packs to return automatically to your previous campaign zone.
      </p>
    </section>
  )
}
