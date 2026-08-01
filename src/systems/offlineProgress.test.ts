import { describe, it, expect } from 'bun:test'
import { computeOfflineSeconds, simulateOfflineProgress } from './offlineProgress.ts'
import { createInitialState } from '../store/gameStore.ts'
import { OFFLINE_PROGRESS_MAX_HOURS, OFFLINE_PROGRESS_MIN_SECONDS } from '../data/balance.ts'

describe('computeOfflineSeconds', () => {
  const now = 1_800_000_000_000

  it('returns 0 for a fresh save (under the min threshold)', () => {
    expect(computeOfflineSeconds(now - 10_000, now)).toBe(0)
    expect(computeOfflineSeconds(now, now)).toBe(0)
  })

  it('returns elapsed whole seconds above the threshold', () => {
    expect(computeOfflineSeconds(now - 2 * 3600 * 1000, now)).toBe(7200)
  })

  it('caps at the max hours constant', () => {
    const huge = now - OFFLINE_PROGRESS_MAX_HOURS * 3600 * 1000 * 10
    expect(computeOfflineSeconds(huge, now)).toBe(OFFLINE_PROGRESS_MAX_HOURS * 3600)
  })

  it('returns 0 when lastSaveTime is missing or invalid', () => {
    expect(computeOfflineSeconds(0, now)).toBe(0)
    expect(computeOfflineSeconds(NaN, now)).toBe(0)
  })

  it('respects the min-seconds threshold constant', () => {
    const justOver = OFFLINE_PROGRESS_MIN_SECONDS + 1
    expect(computeOfflineSeconds(now - justOver * 1000, now)).toBe(justOver)
  })
})

describe('simulateOfflineProgress', () => {
  it('returns a zero summary for zero seconds', async () => {
    const state = createInitialState('warlord')
    const result = await simulateOfflineProgress(state, 0)
    expect(result.summary.xpGained).toBe(0)
    expect(result.summary.kills).toBe(0)
    expect(result.summary.seconds).toBe(0)
    expect(result.state).toBe(state)
  })

  it('advances the game forward and reports rewards for an hour away', async () => {
    const state = createInitialState('warlord')
    state.gamePhase = 'playing'
    const beforeTicks = state.tickCounter
    const result = await simulateOfflineProgress(state, 3600)

    // The sim actually ran: tick counter advanced and combat progressed
    expect(result.state.tickCounter).toBeGreaterThan(beforeTicks)
    // A character farming for an hour should have earned something
    expect(result.summary.seconds).toBeGreaterThan(0)
    expect(result.summary.kills).toBeGreaterThan(0)
    expect(result.summary.goldGained).toBeGreaterThanOrEqual(0)
    expect(result.summary.xpGained).toBeGreaterThanOrEqual(0)
  })

  it('reports chunk progress through the callback', async () => {
    const state = createInitialState('warlord')
    state.gamePhase = 'playing'
    const progresses: number[] = []
    await simulateOfflineProgress(state, 3600, p => progresses.push(p))
    expect(progresses.length).toBeGreaterThan(0)
    expect(progresses[progresses.length - 1]).toBe(1)
  })
})
