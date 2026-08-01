import { describe, it, expect } from 'bun:test'
import {
  isCompactPack,
  laneContainerWidth,
  laneCardWidth,
  layoutLaneSlots,
  LANE_ICON_NORMAL,
} from './PackLane.tsx'

const ICON_COMPACT = 36 // w-9
const CARD_MAX = 80 // max-w-[5rem]

describe('PackLane monster layout', () => {
  it('lays out an 8-member pack with no overlapping cards on a wide lane', () => {
    const laneWidth = 1200
    const slots = layoutLaneSlots(8, laneWidth)
    const containerWidth = laneContainerWidth(laneWidth)

    expect(slots).toHaveLength(8)
    expect(isCompactPack(8)).toBe(true)

    for (let i = 0; i < slots.length; i++) {
      // Every card is at least as wide as the compact icon, so icons never stack
      expect(slots[i].width).toBeGreaterThanOrEqual(ICON_COMPACT)
      // Cards stay within the container (no clipping off the lane)
      expect(slots[i].left + slots[i].width).toBeLessThanOrEqual(containerWidth)
      // No card starts before the previous one ends
      if (i > 0) {
        expect(slots[i].left).toBeGreaterThanOrEqual(slots[i - 1].left + slots[i - 1].width)
      }
    }
  })

  it('never overlaps for an 8-member pack across narrow to wide lanes', () => {
    for (const laneWidth of [400, 640, 800, 1200, 1600]) {
      const slots = layoutLaneSlots(8, laneWidth)
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i].left, `lane ${laneWidth}px, slot ${i}`).toBeGreaterThanOrEqual(
          slots[i - 1].left + slots[i - 1].width,
        )
      }
    }
  })

  it('uses full-size cards for packs of 4 and keeps them non-overlapping', () => {
    const laneWidth = 1200
    const slots = layoutLaneSlots(4, laneWidth)

    expect(slots).toHaveLength(4)
    expect(isCompactPack(4)).toBe(false)
    expect(laneCardWidth(4, laneContainerWidth(laneWidth))).toBeGreaterThanOrEqual(LANE_ICON_NORMAL)

    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].left).toBeGreaterThanOrEqual(slots[i - 1].left + slots[i - 1].width)
    }
  })

  it('caps card width at 5rem even when the lane is very wide', () => {
    const laneWidth = 3000
    const containerWidth = laneContainerWidth(laneWidth)
    expect(laneCardWidth(1, containerWidth)).toBe(CARD_MAX)
    expect(laneCardWidth(8, containerWidth)).toBeLessThanOrEqual(CARD_MAX)
  })

  it('matches the lane container CSS (left-[30%] right-5 => 70% width minus 20px)', () => {
    expect(laneContainerWidth(1000)).toBeCloseTo(680)
    expect(laneContainerWidth(0)).toBe(0)
  })
})
