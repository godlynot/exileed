import { useEffect, useRef } from 'react'


export function useGameLoop(tick: () => void) {
  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current()
    }, 100)

    return () => clearInterval(id)
  }, [])
}
