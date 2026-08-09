import { useMemo, useState } from 'react'
import type { CombatEvent } from '../types/game.ts'
import type { Item } from '../types/item.ts'
import { rarityTextClass } from '../types/item.ts'
import { useGameStore } from '../store/gameStore.ts'
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react'

interface CombatLogProps {
  events: CombatEvent[]
  maxEntries?: number
}

function formatEvent(event: CombatEvent, item?: Pick<Item, 'name' | 'slot'>): { text: string; color: string } {
  switch (event.type) {
    case 'monsterSpawned': {
      const rarityLabel = event.rarity === 'rare' ? 'Rare' : event.rarity === 'magic' ? 'Magic' : ''
      const modList = event.modifierNames.length > 0 ? ` [${event.modifierNames.join(', ')}]` : ''
      return { text: `Spawned: ${rarityLabel}${event.monsterType} (Lv.${event.level})${modList}`, color: 'text-gray-400' }
    }
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
    case 'itemDropped': {
      const itemName = event.itemName ?? item?.name ?? `${event.rarity} item`
      const slot = event.slot ?? item?.slot
      if (event.outcome === 'autoSold') {
        return {
          text: `Auto-sold ${itemName}${event.goldValue ? ` (+${event.goldValue} gold)` : ''}`,
          color: 'text-[var(--accent-gold-bright)]',
        }
      }
      return {
        text: `Found ${itemName}${slot ? ` (${event.rarity}, ${slot})` : ` (${event.rarity})`}`,
        color: rarityTextClass(event.rarity),
      }
    }
    case 'zoneProgress':
      return { text: `Zone progress: ${event.current.toFixed(1)}%`, color: 'text-gray-400' }
    case 'ailmentApplied':
      return { text: `Applied ${event.ailmentType} to ${event.targetId}`, color: 'text-green-400' }
    case 'ailmentExpired':
      return { text: `${event.ailmentType} expired on ${event.targetId}`, color: 'text-gray-500' }
    case 'dotTick':
      return { text: `${event.ailmentType} ticked for ${event.damage}`, color: 'text-orange-400' }
    case 'momentumChanged':
      return { text: `Momentum: ${event.stacks} stacks`, color: 'text-cyan-400' }
    case 'auraApplied':
      return { text: `Aura applied: ${event.auraId}`, color: 'text-purple-400' }
    case 'delayedDamageTick':
      return { text: `Delayed damage ticks for ${event.damage}`, color: 'text-orange-300' }
    case 'gemLeveledUp':
      return { text: `Gem leveled up: ${event.gemName} is now level ${event.newLevel}`, color: 'text-green-400' }
    case 'packSeeded':
      return { text: `Pack seeded: ${event.size} monster${event.size > 1 ? 's' : ''}${event.hasElite ? ' (elite)' : ''}`, color: 'text-orange-400' }
    case 'eliteSpawned':
      return { text: `A ${event.monsterType} joins the pack`, color: 'text-orange-300' }
    case 'packCleared':
      return { text: `Pack cleared (${event.size})`, color: 'text-yellow-300' }
    case 'riftCrystalGained':
      return { text: `+${event.amount} Rift Crystal${event.amount === 1 ? '' : 's'}`, color: 'text-cyan-300' }
    case 'nexusMapCompleted':
      return { text: 'Nexus map completed', color: 'text-[var(--accent-crystal)]' }
    case 'nexusTierCompleted':
      return { text: `Tier ${event.tier} milestone reached: +${event.amount} Rift Crystals`, color: 'text-[var(--accent-gold)]' }
    case 'bandHit':
      return { text: `${event.skillName} hits ${event.targetCount} targets`, color: 'text-cyan-400' }
    default:
      return { text: 'Unknown event', color: 'text-gray-400' }
  }
}

export function CombatLog({ events, maxEntries = 50 }: CombatLogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const inventoryItems = useGameStore(state => state.inventory.items)
  const itemById = useMemo(
    () => new Map(inventoryItems.map(item => [item.id, item])),
    [inventoryItems],
  )
  const displayEvents = events.slice(-maxEntries).reverse()

  return (
    <div className="game-panel overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-expanded={isOpen}
        aria-controls="combat-log-entries"
        className="flex w-full items-center justify-between bg-[var(--bg-elevated)] px-4 py-2 transition-colors hover:bg-[var(--border)]"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent-gold)]">
          <ScrollText className="h-4 w-4" />
          <span>Combat Log</span>
          <span className="text-xs text-[var(--text-muted)]">({events.length})</span>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {isOpen && (
        <div id="combat-log-entries" className="max-h-64 space-y-1 overflow-y-auto p-2 scrollbar-thin">
          {displayEvents.length === 0 ? (
            <div className="px-2 py-1 text-xs italic text-[var(--text-muted)]">No combat events yet.</div>
          ) : (
            displayEvents.map(event => {
              const item = event.type === 'itemDropped' ? itemById.get(event.itemId) : undefined
              const { text, color } = formatEvent(event, item)
              return (
                <div key={event.id} className="border-l-2 border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--bg-elevated)]">
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
