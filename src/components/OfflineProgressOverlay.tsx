import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Coins, Skull, TrendingUp, Package } from 'lucide-react'
import { useGameStore } from '../store/gameStore.ts'
import { simulateOfflineProgress } from '../systems/offlineProgress.ts'

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString()
}

export function OfflineProgressOverlay() {
  const offlineSeconds = useGameStore(s => s.offlineSeconds ?? 0)
  const offlineSummary = useGameStore(s => s.offlineSummary)
  const applyOfflineProgress = useGameStore(s => s.applyOfflineProgress)
  const dismissOfflineProgress = useGameStore(s => s.dismissOfflineProgress)

  const [progress, setProgress] = useState(0)
  const [simulated, setSimulated] = useState(false)
  // Ref guard instead of state: setting a state flag inside the effect would
  // re-render, re-run the effect, and let its own cleanup clear the pending
  // timer before it ever fires (the stuck-at-0% bug). A ref doesn't re-render,
  // and we reset it in cleanup so StrictMode's mount-cleanup-mount still runs
  // the sim exactly once.
  const startedRef = useRef(false)

  // Kick off the offline simulation once on mount. The real sim is fast
  // (~1s for the full 8h cap), so we defer it a frame so the overlay paints
  // first, and animate progress from its chunk callback.
  useEffect(() => {
    if (startedRef.current || offlineSummary || offlineSeconds <= 0) return
    startedRef.current = true

    let cancelled = false
    const snapshot = useGameStore.getState()
    // Defer one frame so the overlay paints before the sim's first chunk runs.
    const timer = setTimeout(() => {
      simulateOfflineProgress(snapshot, offlineSeconds, p => {
        if (!cancelled) setProgress(p)
      })
        .then(result => {
          if (cancelled) return
          setProgress(1)
          applyOfflineProgress(result.state, result.summary)
          setSimulated(true)
        })
        .catch(err => {
          console.error('Offline progress simulation failed:', err)
          // Never leave the player stuck on the overlay — bail out gracefully.
          if (!cancelled) dismissOfflineProgress()
        })
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
      startedRef.current = false
    }
  }, [offlineSeconds, offlineSummary, applyOfflineProgress, dismissOfflineProgress])

  const summary = useMemo(() => offlineSummary, [offlineSummary])

  // Results phase: show the rewards with a Continue button
  if (simulated && summary) {
    const rows = [
      { icon: <TrendingUp className="w-4 h-4 text-[#d4a017]" />, label: 'Experience', value: formatNumber(summary.xpGained) },
      { icon: <Coins className="w-4 h-4 text-[#d4a017]" />, label: 'Gold', value: formatNumber(summary.goldGained) },
      { icon: <Skull className="w-4 h-4 text-red-400" />, label: 'Monsters slain', value: formatNumber(summary.kills) },
      { icon: <Clock className="w-4 h-4 text-blue-400" />, label: 'Time away', value: formatDuration(summary.seconds) },
      ...(summary.levelsGained > 0 ? [{ icon: <TrendingUp className="w-4 h-4 text-green-400" />, label: 'Levels gained', value: `+${summary.levelsGained}` }] : []),
      ...(summary.itemsFound > 0 ? [{ icon: <Package className="w-4 h-4 text-purple-400" />, label: 'Items found', value: formatNumber(summary.itemsFound) }] : []),
    ]

    return (
      <div className="min-h-screen bg-[#0b0c10] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm rounded-xl border border-[#d4a017]/40 bg-[#15161d] p-6 space-y-5"
        >
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-gray-500">Welcome back, Exile</div>
            <h2 className="text-xl font-serif text-[#d4a017] mt-1">The rift was quiet…</h2>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="flex items-center justify-between rounded-lg bg-[#0b0c10] border border-[#2e303a] px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  {row.icon}
                  {row.label}
                </span>
                <span className="text-sm font-semibold text-gray-100">{row.value}</span>
              </motion.div>
            ))}
          </div>

          <button
            onClick={() => dismissOfflineProgress()}
            className="w-full px-4 py-2.5 bg-[#d4a017] hover:bg-[#b88a14] text-[#0b0c10] rounded-lg font-medium transition-colors"
          >
            Continue
          </button>
        </motion.div>
      </div>
    )
  }

  // Simulating phase: animated progress bar while the sim runs
  const pct = Math.round(progress * 100)
  return (
    <div className="min-h-screen bg-[#0b0c10] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-sm rounded-xl border border-[#2e303a] bg-[#15161d] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-[#d4a017]" />
          <div>
            <div className="text-sm font-medium text-gray-200">While you were away</div>
            <div className="text-xs text-gray-500">{formatDuration(offlineSeconds)} elapsed</div>
          </div>
        </div>

        <div className="w-full h-2 bg-[#0b0c10] rounded-full overflow-hidden border border-[#2e303a]">
          <motion.div
            className="h-full bg-gradient-to-r from-[#b88a14] to-[#d4a017]"
            animate={{ width: `${Math.max(4, pct)}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
        <div className="text-right text-xs text-gray-500">
          {pct < 100 ? 'Reaping rewards…' : 'Done'} {pct}%
        </div>
      </motion.div>
    </div>
  )
}
