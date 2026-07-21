import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import { CURRENCIES } from '../data/currencies.ts'
import type { Item } from '../types/item.ts'

export function InventoryPanel() {
  const inventory = useGameStore(state => state.inventory)
  const currencies = useGameStore(state => state.currencies)
  const equipItem = useGameStore(state => state.equipItem)
  const sellItem = useGameStore(state => state.sellItem)
  const useCurrency = useGameStore(state => state.useCurrency)
  const toggleAutoSell = useGameStore(state => state.toggleAutoSell)

  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null)

  const rarityColors = {
    normal: 'text-gray-300',
    magic: 'text-blue-400',
    rare: 'text-yellow-400',
    unique: 'text-orange-400',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-serif text-[#d4a017]">Inventory</h2>
        <span className="text-xs text-gray-400">{inventory.items.length} / {inventory.maxSize}</span>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={inventory.autoSellNormal}
            onChange={() => toggleAutoSell('normal')}
            className="accent-[#d4a017]"
          />
          Auto-sell Normal
        </label>
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={inventory.autoSellMagic}
            onChange={() => toggleAutoSell('magic')}
            className="accent-[#d4a017]"
          />
          Auto-sell Magic
        </label>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {inventory.items.map(item => (
          <button
            key={item.id}
            onClick={() => setSelectedItem(item)}
            onMouseEnter={() => setHoveredItem(item)}
            onMouseLeave={() => setHoveredItem(null)}
            className={`relative aspect-square bg-[#1f2028] border border-[#2e303a] rounded p-1 text-xs text-left hover:bg-[#2e303a] ${
              selectedItem?.id === item.id ? 'border-[#d4a017]' : ''
            }`}
          >
            <div className={`truncate ${rarityColors[item.rarity]}`}>{item.name}</div>
            <div className="text-[10px] text-gray-500">iLvl {item.itemLevel}</div>
            {hoveredItem?.id === item.id && (
              <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1 w-56">
                <ItemTooltip item={item} compact />
              </div>
            )}
          </button>
        ))}
        {Array.from({ length: Math.max(0, inventory.maxSize - inventory.items.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square bg-[#15161d] border border-[#2e303a]/50 rounded" />
        ))}
      </div>

      {selectedItem && (
        <div className="border border-[#2e303a] rounded p-3 bg-[#15161d]">
          <ItemTooltip item={selectedItem} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => { equipItem(selectedItem); setSelectedItem(null) }}
              className="px-3 py-1 bg-[#d4a017] text-black rounded text-sm font-medium hover:bg-[#e5b12a]"
            >
              Equip
            </button>
            <button
              onClick={() => { sellItem(selectedItem.id); setSelectedItem(null) }}
              className="px-3 py-1 bg-[#2e303a] text-gray-200 rounded text-sm hover:bg-[#3e404a]"
            >
              Sell
            </button>
            <div className="w-full" />
            {Object.entries(CURRENCIES).filter(([id]) => id !== 'penance').map(([id, currency]) => (
              <button
                key={id}
                onClick={() => useCurrency(selectedItem.id, id)}
                disabled={(currencies[id] || 0) <= 0}
                className="px-2 py-1 text-xs rounded bg-[#1f2028] border border-[#2e303a] hover:bg-[#2e303a] disabled:opacity-50"
              >
                {currency.name} ({currencies[id] || 0})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
