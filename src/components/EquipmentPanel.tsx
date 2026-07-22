import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import { RARITY_COLORS, rarityTextClass, rarityBorderClass } from '../types/item.ts'
import type { Equipment as EquipmentType, Item } from '../types/item.ts'

interface SlotConfig {
  key: keyof EquipmentType
  label: string
  // Grid position for the paper-doll layout
  gridClass: string
}

const slots: SlotConfig[] = [
  { key: 'helmet', label: 'Helmet', gridClass: 'col-start-2 row-start-1' },
  { key: 'amulet', label: 'Amulet', gridClass: 'col-start-3 row-start-1' },
  { key: 'weapon', label: 'Weapon', gridClass: 'col-start-1 row-start-2' },
  { key: 'body', label: 'Body', gridClass: 'col-start-2 row-start-2' },
  { key: 'offhand', label: 'Off-hand', gridClass: 'col-start-3 row-start-2' },
  { key: 'gloves', label: 'Gloves', gridClass: 'col-start-1 row-start-3' },
  { key: 'belt', label: 'Belt', gridClass: 'col-start-2 row-start-3' },
  { key: 'ring1', label: 'Ring', gridClass: 'col-start-1 row-start-4' },
  { key: 'boots', label: 'Boots', gridClass: 'col-start-2 row-start-4' },
  { key: 'ring2', label: 'Ring', gridClass: 'col-start-3 row-start-4' },
]

function formatDamageRange(min: number, max: number): string {
  return `${Math.floor(min)}–${Math.floor(max)}`
}

function getPrimaryStatLine(item: Item): string | null {
  if (item.physicalDamageMin > 0 || item.flatLightningDamageMin > 0 || item.flatColdDamageMin > 0) {
    const parts: string[] = []
    if (item.physicalDamageMin > 0) parts.push(`${formatDamageRange(item.physicalDamageMin, item.physicalDamageMax)} phys`)
    if (item.flatLightningDamageMin > 0) parts.push(`${formatDamageRange(item.flatLightningDamageMin, item.flatLightningDamageMax)} lit`)
    if (item.flatColdDamageMin > 0) parts.push(`${formatDamageRange(item.flatColdDamageMin, item.flatColdDamageMax)} cold`)
    const rate = item.attackRate > 0 ? ` · ${item.attackRate.toFixed(1)}/s` : ''
    return `${parts.join(' · ')}${rate}`
  }

  if (item.armour > 0) return `+${Math.floor(item.armour)} armour`
  if (item.evasion > 0) return `+${Math.floor(item.evasion)} evasion`
  if (item.energyShield > 0) return `+${Math.floor(item.energyShield)} energy shield`
  if (item.life > 0) return `+${Math.floor(item.life)} life`

  // Accessories / misc: pick highest-value affix
  if (item.affixes.length > 0) {
    const best = item.affixes.reduce((a, b) => (Math.abs(a.value) > Math.abs(b.value) ? a : b))
    return `${best.name} +${best.value}`
  }

  return null
}

function getAffixCountLabel(item: Item): string | null {
  const prefixes = item.affixes.filter(a => a.type === 'prefix').length
  const suffixes = item.affixes.filter(a => a.type === 'suffix').length
  if (prefixes === 0 && suffixes === 0) return null
  return `${prefixes} prefix${prefixes !== 1 ? 'es' : ''} · ${suffixes} suffix${suffixes !== 1 ? 'es' : ''}`
}

function EquipmentSlot({ slot, item, onUnequip }: { slot: SlotConfig; item: Item | null; onUnequip: (slot: keyof EquipmentType) => void }) {
  const [hovered, setHovered] = useState(false)

  const borderClass = item ? rarityBorderClass(item.rarity) : 'border-[#2e303a] border-dashed'
  const leftBorder = item ? { borderLeft: `2px solid ${RARITY_COLORS[item.rarity]}` } : undefined

  return (
    <div
      className={`relative ${slot.gridClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >      <div className={`min-h-[4.5rem] bg-[#15161d] border ${borderClass} rounded p-2 flex flex-col justify-between cursor-pointer hover:bg-[#1f2028] transition-colors`}
        style={leftBorder}
      >
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 truncate">{slot.label}</span>
          {item && (
            <button
              onClick={() => onUnequip(slot.key)}
              className="w-4 h-4 shrink-0 bg-[#2e303a] hover:bg-red-900/80 rounded text-[10px] flex items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
              title="Unequip"
            >
              ×
            </button>
          )}
        </div>

        {item ? (
          <div className="space-y-0.5 min-w-0">
            <div className={`text-xs font-medium leading-tight truncate ${rarityTextClass(item.rarity)}`}>
              {item.name}
            </div>
            <div className="text-[10px] text-gray-400 truncate">
              {getPrimaryStatLine(item) || '\u00A0'}
            </div>
            <div className="text-[10px] text-gray-500 truncate">
              {getAffixCountLabel(item) || '\u00A0'}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-600 italic">Empty</div>
        )}
      </div>

      {hovered && item && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64">
          <ItemTooltip item={item} />
        </div>
      )}
    </div>
  )
}

export function EquipmentPanel() {
  const equipment = useGameStore(state => state.equipment)
  const unequipItem = useGameStore(state => state.unequipItem)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-serif text-[#d4a017]">Equipment</h2>

      <div className="space-y-4">
        <div className="relative bg-[#0b0c10]/50 border border-[#2e303a] rounded-lg p-3">
          {/* Human figure silhouette */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-32 bg-[#1f2028]/40 rounded-full" />
          </div>

          <div className="grid grid-cols-3 grid-rows-4 gap-2 relative z-10">
            {slots.map(slot => (
              <EquipmentSlot
                key={slot.key}
                slot={slot}
                item={equipment[slot.key]}
                onUnequip={unequipItem}
              />
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Hover over an equipped item for full details. Click the × to unequip.
        </div>
      </div>
    </div>
  )
}
