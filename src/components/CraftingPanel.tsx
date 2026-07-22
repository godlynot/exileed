import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { CURRENCIES } from '../data/currencies.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import { rarityTextClass } from '../types/item.ts'
import type { Item } from '../types/item.ts'

export function CraftingPanel() {
  const inventory = useGameStore(state => state.inventory)
  const currencies = useGameStore(state => state.currencies)
  const useCurrency = useGameStore(state => state.useCurrency)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-serif text-[#d4a017]">Crafting</h2>

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(CURRENCIES).map(([id, currency]) => (
          <div key={id} className="bg-[#1f2028] border border-[#2e303a] rounded p-2 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400">{currency.name}</div>
              <div className="text-sm font-medium text-[#d4a017]">{currencies[id] || 0}</div>
            </div>
            <div className="text-[10px] text-gray-500 max-w-[80px] text-right">{currency.description}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#2e303a] pt-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Select an item to craft</h3>
        <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto scrollbar-thin">
          {inventory.items.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className={`p-2 text-xs text-left border rounded ${
                selectedItem?.id === item.id
                  ? 'border-[#d4a017] bg-[#2e2a1f]'
                  : 'border-[#2e303a] bg-[#1f2028] hover:bg-[#2e303a]'
              }`}
            >
            <div className={`truncate ${rarityTextClass(item.rarity)}`}>{item.name}</div>
            <div className="text-[10px] text-gray-500">{item.rarity}</div>
            </button>
          ))}
        </div>
      </div>

      {selectedItem && (
        <div className="border border-[#2e303a] rounded p-3 bg-[#15161d]">
          <ItemTooltip item={selectedItem} />
          <div className="mt-3 flex flex-wrap gap-2">
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
