import type { GameState, OfflineSummary } from '../types/game.ts'
import {
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
 * player would actually have earned. Runs in fixed-size chunks and reports
 * progress via `onChunk(progress01)` so a UI overlay can animate.
 */
export function simulateOfflineProgress(
  state: GameState,
  seconds: number,
  onChunk?: (progress: number) => void,
): OfflineSimResult {
  const totalTicks = Math.max(0, Math.floor(seconds * TICKS_PER_SECOND))
  const chunkTicks = Math.max(1, Math.floor(1 * 3600 * TICKS_PER_SECOND)) // 1 simulated hour per chunk
  if (totalTicks === 0) {
    return {
      state,
      summary: {
        seconds: 0,
        xpGained: 0,
        goldGained: 0,
        kills: 0,
        levelsGained: 0,
        itemsFound: 0,
      },
    }
  }

  let sim = state
  let ticksDone = 0
  let xpGained = 0
  let kills = 0
  let itemsFound = 0
  const startGold = state.currencies['gold'] ?? 0
  const startLevel = state.character.level

  while (ticksDone < totalTicks) {
    const batch = Math.min(chunkTicks, totalTicks - ticksDone)
    for (let i = 0; i < batch; i++) {
      const { state: next, events } = simulateTick(sim)
      // The store normally advances tickCounter per tick; do it here so
      // periodic timers (storm ticks, DOT cadence, etc.) fire correctly.
      sim = { ...next, tickCounter: next.tickCounter + 1 }
      for (const event of events) {
        if (event.type === 'xpGained') xpGained += event.amount
        else if (event.type === 'monsterDied') kills += 1
        else if (event.type === 'itemDropped') itemsFound += 1
      }
    }
    ticksDone += batch
    onChunk?.(Math.min(1, ticksDone / totalTicks))
  }

  const goldGained = Math.max(0, (sim.currencies['gold'] ?? 0) - startGold)
  const levelsGained = Math.max(0, sim.character.level - startLevel)

  return {
    state: sim,
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
