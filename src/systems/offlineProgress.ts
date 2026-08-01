import type { CombatEvent, GameState, OfflineSummary } from '../types/game.ts'
import {
  OFFLINE_PROGRESS_CHUNK_HOURS,
  OFFLINE_PROGRESS_MAX_HOURS,
  OFFLINE_PROGRESS_MIN_SECONDS,
  TICKS_PER_SECOND,
} from '../data/balance.ts'
import { simulateTick } from './combat.ts'

/**
 * How many whole seconds of offline time to credit, given the last save time.
 * Capped at OFFLINE_PROGRESS_MAX_HOURS and floored to 0 below the minimum
 * threshold (so quick tab-switches don't trigger the overlay).
 */
export function computeOfflineSeconds(lastSaveTime: number, now: number = Date.now()): number {
  if (!lastSaveTime || lastSaveTime <= 0) return 0
  const elapsed = Math.floor((now - lastSaveTime) / 1000)
  if (elapsed < OFFLINE_PROGRESS_MIN_SECONDS) return 0
  return Math.min(elapsed, OFFLINE_PROGRESS_MAX_HOURS * 3600)
}

export interface OfflineSimResult {
  state: GameState
  summary: OfflineSummary
}

/**
 * Simulates the game forward by `seconds` of offline time using the real
 * combat tick, so rewards (XP, gold, kills, levels, drops) match what the
 * player would actually have earned. Runs in OFFLINE_PROGRESS_CHUNK_HOURS
 * chunks and yields between chunks so a UI overlay can animate progress.
 */
export async function simulateOfflineProgress(
  state: GameState,
  seconds: number,
  onChunk?: (progress: number) => void,
): Promise<OfflineSimResult> {
  const totalTicks = Math.max(0, Math.floor(seconds * TICKS_PER_SECOND))
  const chunkTicks = Math.max(1, Math.floor(OFFLINE_PROGRESS_CHUNK_HOURS * 3600 * TICKS_PER_SECOND))
  const zeroSummary: OfflineSummary = {
    seconds: 0,
    xpGained: 0,
    goldGained: 0,
    kills: 0,
    levelsGained: 0,
    itemsFound: 0,
  }
  if (totalTicks === 0) {
    return { state, summary: zeroSummary }
  }

  let sim = state
  let ticksDone = 0
  let xpGained = 0
  let kills = 0
  let itemsFound = 0
  // Rolling combat-event buffer so the applied state's log isn't stale
  let lastEvents: CombatEvent[] = []
  const startGold = state.currencies['gold'] ?? 0
  const startLevel = state.character.level

  while (ticksDone < totalTicks) {
    const batch = Math.min(chunkTicks, totalTicks - ticksDone)
    for (let i = 0; i < batch; i++) {
      const { state: next, events } = simulateTick(sim)
      // The store normally advances tickCounter per tick; do it here so
      // periodic timers (storm ticks, DOT cadence, etc.) fire correctly.
      sim = { ...next, tickCounter: next.tickCounter + 1 }
      lastEvents = [...lastEvents, ...events].slice(-50)
      for (const event of events) {
        if (event.type === 'xpGained') xpGained += event.amount
        else if (event.type === 'monsterDied') kills += 1
        else if (event.type === 'itemDropped') itemsFound += 1
      }
    }
    ticksDone += batch
    onChunk?.(Math.min(1, ticksDone / totalTicks))
    // Yield to the event loop between hour-chunks so the overlay's progress
    // bar can actually paint instead of React batching every update together.
    if (ticksDone < totalTicks) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  const goldGained = Math.max(0, (sim.currencies['gold'] ?? 0) - startGold)
  const levelsGained = Math.max(0, sim.character.level - startLevel)

  return {
    state: { ...sim, combat: { ...sim.combat, events: lastEvents } },
    summary: {
      seconds: Math.floor(ticksDone / TICKS_PER_SECOND),
      xpGained,
      goldGained,
      kills,
      levelsGained,
      itemsFound,
    },
  }
}
