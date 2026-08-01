import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Character, CombatEvent, CombatState } from '../types/game.ts'
import { Sword, Skull } from 'lucide-react'
import { CombatEffects } from './CombatEffects.tsx'
import { DeathSummaryPanel } from './DeathSummaryPanel.tsx'
import { PackLane } from './PackLane.tsx'

interface CombatSceneProps {
  character: Character
  combat: CombatState
}

function eventColor(event: CombatEvent) {
  if (event.type === 'hitLanded') {
    if (event.source === 'player') return event.crit ? 'text-yellow-300' : 'text-red-400'
    return 'text-red-500'
  }
  if (event.type === 'hitAvoided') return 'text-gray-400'
  if (event.type === 'monsterDied') return 'text-yellow-400'
  return 'text-white'
}

function eventLabel(event: CombatEvent) {
  if (event.type === 'hitAvoided') return event.reason === 'evaded' ? 'Dodge' : 'Miss'
  if (event.type === 'monsterDied') return 'Kill!'
  if (event.type === 'hitLanded') return event.damage.toString()
  return ''
}

export function CombatScene({ character, combat }: CombatSceneProps) {
  const visibleEvents = useMemo(
    () => combat.events.filter(e => e.type === 'hitLanded' || e.type === 'hitAvoided' || e.type === 'monsterDied'),
    [combat.events]
  )

  const activeMonster = combat.monster

  return (
    <div className="space-y-2">
      {/* Main pack lane — player vs the whole pack */}
      <PackLane character={character} currentPack={combat.currentPack} />

      {/* Death summary overlay */}
      {!character.isAlive && combat.deathSummary && <DeathSummaryPanel combat={combat} />}

      {/* Buff / Debuff bars */}
      <CombatEffects character={character} combat={combat} />

      {/* Scrolling combat events */}
      <div className="bg-[#0b0c10] border border-[#2e303a] rounded-lg p-2 h-32 overflow-hidden">
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <Sword className="w-3 h-3 text-[#d4a017]" />
          <span>Combat Feed</span>
        </div>
        <div className="space-y-1 overflow-y-auto h-[calc(100%-1.25rem)] pr-1 scrollbar-thin">
          <AnimatePresence initial={false}>
            {visibleEvents.length === 0 && (
              <div className="text-xs text-gray-600 italic">No events yet.</div>
            )}
            {visibleEvents.slice(-10).map(event => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`text-xs font-medium ${eventColor(event)}`}
              >
                {event.type === 'monsterDied' ? (
                  <span className="flex items-center gap-1">
                    <Skull className="w-3 h-3" /> {eventLabel(event)}
                  </span>
                ) : (
                  <span>{event.source === 'player' ? 'You' : activeMonster?.name ?? 'Monster'} {eventLabel(event)}</span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
