import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Character, CombatEvent, CombatState } from '../types/game.ts'
import { Coins, Package, Sword, Skull } from 'lucide-react'
import { useGameStore } from '../store/gameStore.ts'
import { rarityTextClass } from '../types/item.ts'
import { CombatEffects } from './CombatEffects.tsx'
import { DeathSummaryPanel } from './DeathSummaryPanel.tsx'
import { PackMap } from './PackMap.tsx'
import { MinionBar } from './MinionBar.tsx'

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
  if (event.type === 'itemDropped') {
    return event.outcome === 'autoSold' ? 'text-[var(--accent-gold-bright)]' : rarityTextClass(event.rarity)
  }
  if (event.type === 'riftCrystalGained') return 'text-[var(--accent-crystal)]'
  if (event.type === 'nexusMapCompleted') return 'text-[var(--accent-crystal)]'
  return 'text-white'
}

function eventLabel(event: CombatEvent, itemName?: string, itemSlot?: string) {
  if (event.type === 'hitAvoided') return event.reason === 'evaded' ? 'Dodge' : 'Miss'
  if (event.type === 'monsterDied') return 'Kill!'
  if (event.type === 'hitLanded') return event.damage.toString()
  if (event.type === 'itemDropped') {
    const name = event.itemName ?? itemName ?? `${event.rarity} item`
    if (event.outcome === 'autoSold') {
      return `Auto-sold ${name}${event.goldValue ? ` · +${event.goldValue} gold` : ''}`
    }
    return `Found ${name}${event.slot ?? itemSlot ? ` · ${event.slot ?? itemSlot}` : ''}`
  }
  if (event.type === 'riftCrystalGained') return `+${event.amount} Crystal${event.amount === 1 ? '' : 's'}`
  if (event.type === 'nexusMapCompleted') return 'Nexus complete!'
  return ''
}

export function CombatScene({ character, combat }: CombatSceneProps) {
  const inventoryItems = useGameStore(state => state.inventory.items)
  const itemById = useMemo(
    () => new Map(inventoryItems.map(item => [item.id, item])),
    [inventoryItems],
  )
  const visibleEvents = useMemo(
    () => combat.events.filter(e =>
      e.type === 'hitLanded' ||
      e.type === 'hitAvoided' ||
      e.type === 'monsterDied' ||
      e.type === 'itemDropped' ||
      e.type === 'riftCrystalGained' ||
      e.type === 'nexusMapCompleted'
    ),
    [combat.events]
  )

  const activeMonster = combat.monster

  return (
    <div className="space-y-2">
      {/* Main spatial map — the player walks pack to pack; the sim owns time and position,
          this view only projects sim state (no layout helpers, no overlap tests here). */}
      <PackMap character={character} combat={combat} partyMembers={combat.party?.members ?? []} />

      {/* Minion detail bar — one card per summon (minion-system-spec.md §9.1) */}
      <MinionBar character={character} combat={combat} />

      {/* Death summary overlay */}
      {!character.isAlive && combat.deathSummary && <DeathSummaryPanel combat={combat} />}

      {/* Buff / Debuff bars */}
      <CombatEffects character={character} combat={combat} />

      {/* Scrolling combat events */}
      <div className="game-panel h-36 overflow-hidden rounded-xl p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Sword className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          <span className="eyebrow">Combat Feed</span>
        </div>
        <div className="h-[calc(100%-1.5rem)] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
          <AnimatePresence initial={false}>
            {visibleEvents.length === 0 && (
              <div className="text-xs italic text-[var(--text-muted)]">No events yet.</div>
            )}
            {visibleEvents.slice(-10).map(event => {
              const item = event.type === 'itemDropped' ? itemById.get(event.itemId) : undefined
              const label = eventLabel(event, item?.name, item?.slot)
              return (
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
                      <Skull className="h-3 w-3" /> {label}
                    </span>
                  ) : event.type === 'itemDropped' ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      {event.outcome === 'autoSold' ? <Coins className="h-3 w-3 shrink-0" /> : <Package className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{label}</span>
                    </span>
                  ) : event.type === 'riftCrystalGained' || event.type === 'nexusMapCompleted' ? (
                    <span>{label}</span>
                  ) : (
                    <span>{event.source === 'player' ? 'You' : activeMonster?.name ?? 'Monster'} {label}</span>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
