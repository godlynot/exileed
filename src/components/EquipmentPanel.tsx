import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import type { Equipment as EquipmentType, Item } from '../types/item.ts'

interface SlotConfig {
  key: keyof EquipmentType
  label: string
  position: string
}

const slots: SlotConfig[] = [
  { key: 'helmet', label: 'Helmet', position: 'col-start-2 row-start-1' },
  { key: 'amulet', label: 'Amulet', position: 'col-start-3 row-start-1' },
  { key: 'weapon', label: 'Weapon', position: 'col-start-1 row-start-2' },
  { key: 'body', label: 'Body Armour', position: 'col-start-2 row-start-2' },
  { key: 'offhand', label: 'Off-hand', position: 'col-start-3 row-start-2' },
  { key: 'gloves', label: 'Gloves', position: 'col-start-1 row-start-3' },
  { key: 'belt', label: 'Belt', position: 'col-start-2 row-start-3' },
  { key: 'ring1', label: 'Ring 1', position: 'col-start-3 row-start-3' },
  { key: 'boots', label: 'Boots', position: 'col-start-1 row-start-4' },
  { key: 'ring2', label: 'Ring 2', position: 'col-start-3 row-start-4' },
]

function EquipmentSlot({ slot, item, onUnequip }: { slot: SlotConfig; item: Item | null; onUnequip: (slot: keyof EquipmentType) => void }) {
  const [hovered, setHovered] = useState(false)

  const rarityBorder = item
    ? item.rarity === 'magic'
      ? 'border-blue-500/50'
      : item.rarity === 'rare'
      ? 'border-yellow-500/50'
      : 'border-gray-600'
    : 'border-[#2e303a] border-dashed'

  return (
    <div
      className={`relative ${slot.position}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`h-16 bg-[#15161d] border ${rarityBorder} rounded p-1.5 flex flex-col justify-between cursor-pointer hover:bg-[#1f2028] transition-colors`}
      >
        <div className="text-[10px] uppercase tracking-wider text-gray-500">{slot.label}</div>
        {item ? (
          <div className="text-xs leading-tight">
            <span className={item.rarity === 'magic' ? 'text-blue-400' : item.rarity === 'rare' ? 'text-yellow-400' : 'text-gray-300'}>
              {item.name}
            </span>
          </div>
        ) : (
          <div className="text-xs text-gray-600 italic">Empty</div>
        )}
      </div>

      {hovered && item && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64">
          <ItemTooltip item={item} compact />
        </div>
      )}

      {item && (
        <button
          onClick={() => onUnequip(slot.key)}
          className="absolute -top-1 -right-1 w-5 h-5 bg-[#2e303a] hover:bg-red-900/80 rounded-full text-[10px] flex items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
          title="Unequip"
        >
          ×
        </button>
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

      <div className="relative bg-[#0b0c10]/50 border border-[#2e303a] rounded-lg p-4">
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
        Hover over an equipped item to see its stats. Click the × to unequip.
      </div>
    </div>
  )
}
