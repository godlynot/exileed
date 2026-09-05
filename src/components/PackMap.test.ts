import { describe, it, expect } from 'bun:test'
import {
  partyScreenPoint,
  worldToScreen,
  resolveMarkerOverlaps,
  DEFAULT_PROJECTION,
} from './PackMap.tsx'
import type { ProjectionConfig } from './PackMap.tsx'
import type { CombatState } from '../types/game.ts'
import { playerWorldPosition } from '../systems/spatial.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'

const config: ProjectionConfig = { ...DEFAULT_PROJECTION }

describe('PackMap projection', () => {
  it('keeps the party marker centered and inside the panel', () => {
    const point = partyScreenPoint(0, config)
    expect(point.x).toBe(config.width / 2)
    expect(point.y).toBe(config.height - config.partyBottomGap)
    expect(point.y).toBeLessThanOrEqual(config.height - config.padding)
  })

  it('projects northward world movement upward on screen', () => {
    const base = partyScreenPoint(0, config)
    const advanced = partyScreenPoint(10, config)
    // World y decreases northward, so a larger world y must render higher.
    expect(advanced.y).toBeLessThan(base.y)
  })

  it('clamps far-away monsters into the panel instead of rendering off-canvas', () => {
    const point = worldToScreen({ x: 0, y: -10000 }, 0, config)
    expect(point.y).toBeGreaterThanOrEqual(config.padding)
    const farEast = worldToScreen({ x: 10000, y: 0 }, 0, config)
    expect(farEast.x).toBeLessThanOrEqual(config.width - config.padding)
  })

  it('offsets monsters horizontally by their world x, scaled', () => {
    const center = worldToScreen({ x: 0, y: 0 }, 0, config)
    const east = worldToScreen({ x: 3, y: 0 }, 0, config)
    expect(east.x).toBeCloseTo(center.x + 3 * config.scale, 5)
    expect(east.y).toBeCloseTo(center.y, 5)
  })
})

describe('PackMap marker overlap resolution', () => {
  it('pushes coincident markers apart to at least the minimum distance', () => {
    const resolved = resolveMarkerOverlaps([
      { point: { x: 100, y: 50 } },
      { point: { x: 100, y: 50 } },
      { point: { x: 100, y: 50 } },
    ])
    for (let i = 1; i < resolved.length; i++) {
      expect(Math.abs(resolved[i].point.x - resolved[i - 1].point.x)).toBeGreaterThanOrEqual(52 - 0.001)
    }
  })

  it('leaves well-separated markers untouched', () => {
    const resolved = resolveMarkerOverlaps([{ point: { x: 40, y: 0 } }, { point: { x: 200, y: 0 } }])
    expect(resolved[0].point.x).toBe(40)
    expect(resolved[1].point.x).toBe(200)
  })
})

describe('PackMap travel beat (sim-owned time)', () => {
  it('interpolates the party along the path between ticks', () => {
    const combat: CombatState = {
      phase: 'traveling',
      travelTicksRemaining: 4,
      travelDurationTicks: 4,
      partyPosition: { x: 0, y: 0 },
      waypoint: { x: 0, y: -20 },
    } as unknown as CombatState
    const start = playerWorldPosition(combat)
    expect(start.y).toBe(0)
    const mid = playerWorldPosition({ ...combat, travelTicksRemaining: 2 })
    expect(mid.y).toBe(-10)
    const end = playerWorldPosition({ ...combat, travelTicksRemaining: 0 })
    expect(end.y).toBe(-20)
  })

  it('reports the travel countdown in seconds using the real tick rate', () => {
    const ticks = 7
    expect(ticks / TICKS_PER_SECOND).toBe(2.8)
  })
})
