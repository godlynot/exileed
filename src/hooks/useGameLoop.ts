import { useEffect, useRef } from 'react'
import { TICK_RATE } from '../data/balance.ts'

export function useGameLoop(tick: () => void) {
  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current()
    }, TICK_RATE)

    return () => clearInterval(id)
  }, [])
}
