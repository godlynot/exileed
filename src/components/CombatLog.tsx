import { useState } from 'react'
import type { CombatEvent } from '../types/game.ts'
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react'

interface CombatLogProps {
  events: CombatEvent[]
  maxEntries?: number
}

function formatEvent(event: CombatEvent): { text: string; color: string } {
  switch (event.type) {
    case 'monsterSpawned':
      return { text: `Spawned: ${event.monsterType} (Lv.${event.level})`, color: 'text-gray-400' }
    case 'bossSpawned':
      return { text: `Boss spawned: ${event.bossId}`, color: 'text-purple-400' }
    case 'hitLanded':
      if (event.source === 'player') {
        return {
          text: `You hit for ${event.damage} ${event.damageType} damage${event.crit ? ' (crit)' : ''}`,
          color: event.crit ? 'text-yellow-300' : 'text-red-400',
        }
      }
      return {
        text: `You took ${event.damage} ${event.damageType} damage`,
        color: 'text-red-500',
      }
    case 'hitAvoided':
      return {
        text: event.source === 'player' ? 'Your attack missed' : `You ${event.reason === 'evaded' ? 'dodged' : 'avoided'} the attack`,
        color: 'text-gray-400',
      }
    case 'monsterDied':
      return { text: `${event.monsterType} died`, color: 'text-yellow-400' }
    case 'bossDefeated':
      return { text: `Boss defeated: ${event.bossId}`, color: 'text-purple-400' }
    case 'playerDied':
      return { text: 'You died', color: 'text-red-600' }
    case 'xpGained':
      return { text: `+${event.amount} XP`, color: 'text-blue-400' }
    case 'levelUp':
      return { text: `Level up! You are now level ${event.newLevel}`, color: 'text-green-400' }
    case 'itemDropped':
      return { text: `Item dropped: ${event.rarity}`, color: 'text-[#d4a017]' }
    case 'zoneProgress':
      return { text: `Zone progress: ${event.current.toFixed(1)}%`, color: 'text-gray-400' }
    default:
      return { text: 'Unknown event', color: 'text-gray-400' }
  }
}

export function CombatLog({ events, maxEntries = 50 }: CombatLogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const displayEvents = events.slice(-maxEntries).reverse()

  return (
    <div className="bg-[#15161d] border border-[#2e303a] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-[#1f2028] hover:bg-[#2a2b35] transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-[#d4a017]">
          <ScrollText className="w-4 h-4" />
          <span>Combat Log</span>
          <span className="text-xs text-gray-500">({events.length})</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {isOpen && (
        <div className="max-h-64 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {displayEvents.length === 0 ? (
            <div className="text-xs text-gray-500 italic px-2 py-1">No combat events yet.</div>
          ) : (
            displayEvents.map(event => {
              const { text, color } = formatEvent(event)
              return (
                <div key={event.id} className="text-xs px-2 py-0.5 border-l-2 border-[#2e303a] hover:bg-[#1f2028]">
                  <span className={color}>{text}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
