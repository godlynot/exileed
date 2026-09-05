import type { CombatEvent, GameState, OfflineSummary } from '../types/game.ts'
import {
  OFFLINE_PROGRESS_CHUNK_HOURS,
  OFFLINE_PROGRESS_MAX_HOURS,
  OFFLINE_PROGRESS_MIN_SECONDS,
  TICKS_PER_SECOND,
} from '../data/balance.ts'
import { addProgressionDropsToInventory, consumeGeneratedDrops, reconcileAutoSellCap } from './items.ts'
import { simulateTick } from './combat.ts'
import { syncPartyState } from './party.ts'
import { reviveAllSummons } from './minions.ts'

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
  // Equipment drops are queued as a side channel for the live store's loot
  // event enrichment. Offline simulation already applies drop rewards inside
  // simulateTick, so drain that queue on every simulated tick instead of
  // retaining potentially thousands of stale items until the next live tick.
  consumeGeneratedDrops()
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
      const { state: next, events: tickEvents } = simulateTick(sim)
      const generatedDrops = consumeGeneratedDrops()
      // Honor the auto-sell level cap exactly like the live tick: combat sells
      // drops at or below the character level, so restore any drops above the
      // configured cap and refund their gold before the sim moves on.
      const { restored, goldRefund } = reconcileAutoSellCap(
        generatedDrops,
        next.inventory,
        next.character.level,
        tickEvents,
      )
      // The store normally advances tickCounter per tick; do it here so
      // periodic timers (storm ticks, DOT cadence, etc.) fire correctly.
      sim = { ...next, tickCounter: next.tickCounter + 1 }
      let events = tickEvents
      if (restored.length > 0) {
        sim = {
          ...sim,
          inventory: { ...sim.inventory, items: [...sim.inventory.items, ...restored] },
          currencies: { ...sim.currencies, gold: Math.max(0, (sim.currencies.gold || 0) - goldRefund) },
        }
        const restoredEvents = restored.map(dropped => ({
          id: `loot_restored_${dropped.id}`,
          timestamp: Date.now(),
          type: 'itemDropped' as const,
          itemId: dropped.id,
          itemName: dropped.name,
          slot: dropped.slot,
          itemLevel: dropped.itemLevel,
          rarity: dropped.rarity,
          outcome: 'stored' as const,
        }))
        events = [...tickEvents, ...restoredEvents]
      }
      const killCount = events.filter(event => event.type === 'monsterDied').length
      const zone = sim.zones.find(candidate => candidate.id === sim.activeZoneId)
      if (zone && killCount > 0) {
        const ownedGemIds = [
          ...sim.character.ownedGems.map(gem => gem.id),
          ...sim.inventory.items.flatMap(item => item.gemId ? [item.gemId] : []),
        ]
        const progression = addProgressionDropsToInventory(
          sim.inventory.items,
          sim.inventory.maxSize,
          zone.level,
          ownedGemIds,
          killCount,
        )
        sim = { ...sim, inventory: { ...sim.inventory, items: progression.items } }
        const progressionEvents = progression.drops.map(dropped => ({
          id: `progression_${dropped.id}`,
          timestamp: Date.now(),
          type: 'itemDropped' as const,
          itemId: dropped.id,
          itemName: dropped.name,
          slot: dropped.slot,
          itemLevel: dropped.itemLevel,
          rarity: dropped.rarity,
          outcome: 'stored' as const,
        }))
        events = [...events, ...progressionEvents]
      }
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

  // Revive-on-claim (minion spec §10.2, D1a): dead minions were "away" too —
  // their respawn timers already elapsed during offline time, and they return
  // at the character's post-sim level like a fresh cast would.
  sim = { ...sim, character: reviveAllSummons(sim.character) }

  return {
    // Party set mirror (M0): the offline sim discards per-tick party state, so
    // rebuild it once from the final character before handing the result back.
    state: syncPartyState({ ...sim, combat: { ...sim.combat, events: lastEvents } }),
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
