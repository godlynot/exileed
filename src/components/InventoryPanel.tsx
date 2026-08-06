import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import { CURRENCIES } from '../data/currencies.ts'
import { isBlankSupport, isGemItem, isNonEquipmentItem, rarityTextClass } from '../types/item.ts'
import type { Item } from '../types/item.ts'
import { SUPPORTS } from '../data/supports.ts'
import { mapAffixDescription } from '../data/mapAffixes.ts'

export function InventoryPanel() {
  const inventory = useGameStore(state => state.inventory)
  const currencies = useGameStore(state => state.currencies)
  const nexus = useGameStore(state => state.nexus)
  const equipItem = useGameStore(state => state.equipItem)
  const openNexusMap = useGameStore(state => state.openNexusMap)
  const sellItem = useGameStore(state => state.sellItem)
  const discardItem = useGameStore(state => state.discardItem)
  const useCurrency = useGameStore(state => state.useCurrency)
  const toggleAutoSell = useGameStore(state => state.toggleAutoSell)
  const claimGemItem = useGameStore(state => state.claimGemItem)
  const convertBlankSupport = useGameStore(state => state.convertBlankSupport)
  const ownedGems = useGameStore(state => state.character.ownedGems)

  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [selectedSupportId, setSelectedSupportId] = useState('')
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null)

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
            className={`relative aspect-square bg-[#1f2028] border rounded p-1 text-xs text-left hover:bg-[#2e303a] transition-colors ${
              selectedItem?.id === item.id ? 'border-[#d4a017]' : 'border-[#2e303a]'
            }`}
            style={selectedItem?.id === item.id ? undefined : { borderColor: 'rgba(46,48,58,1)' }}
          >
            <div className={`truncate ${rarityTextClass(item.rarity)}`}>{item.name}</div>
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
            {isNonEquipmentItem(selectedItem) ? (
              isGemItem(selectedItem) ? (
                <>
                  <button
                    onClick={() => { claimGemItem(selectedItem.id); setSelectedItem(null) }}
                    className="px-3 py-1 bg-[#d4a017] text-black rounded text-sm font-medium hover:bg-[#e5b12a]"
                  >
                    Claim Gem
                  </button>
                  <button
                    onClick={() => { discardItem(selectedItem.id); setSelectedItem(null) }}
                    className="px-3 py-1 bg-[#2e303a] text-gray-200 rounded text-sm hover:bg-[#3e404a]"
                  >
                    Discard
                  </button>
                </>
              ) : isBlankSupport(selectedItem) ? (
                <>
                  <select
                    value={selectedSupportId}
                    onChange={event => setSelectedSupportId(event.target.value)}
                    className="px-2 py-1 bg-[#1f2028] border border-[#2e303a] rounded text-sm text-gray-200"
                  >
                    <option value="">Choose support…</option>
                    {Object.values(SUPPORTS)
                      .filter(support => !ownedGems.some(gem => gem.id === support.id))
                      .map(support => <option key={support.id} value={support.id}>{support.name}</option>)}
                  </select>
                  <button
                    disabled={!selectedSupportId}
                    onClick={() => { convertBlankSupport(selectedItem.id, selectedSupportId); setSelectedItem(null); setSelectedSupportId('') }}
                    className="px-3 py-1 bg-[#d4a017] text-black rounded text-sm font-medium hover:bg-[#e5b12a] disabled:opacity-50"
                  >
                    Convert
                  </button>
                  <button
                    onClick={() => { discardItem(selectedItem.id); setSelectedItem(null); setSelectedSupportId('') }}
                    className="px-3 py-1 bg-[#2e303a] text-gray-200 rounded text-sm hover:bg-[#3e404a]"
                  >
                    Discard
                  </button>
                </>
              ) : null
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Nexus Maps */}
      {nexus.maps.length > 0 && (
        <div className="border-t border-[#2e303a] pt-4 mt-4">
          <h3 className="text-sm font-medium text-[#7e14ff] mb-2">Nexus Maps</h3>
          <div className="grid grid-cols-4 gap-2">
            {nexus.maps.map(map => (
              <button
                key={map.id}
                onClick={() => openNexusMap(map.id)}
                disabled={!!nexus.activeMapId}
                className="p-2 text-xs text-left border border-[#7e14ff]/30 bg-[#1a1525] rounded hover:bg-[#2a2040] disabled:opacity-50 transition-colors"
              >
                <div className="text-[#b57eff] font-medium truncate">Tier {map.tier}</div>
                <div className="text-[10px] text-gray-400">Lvl {map.monsterLevel}</div>
                <div className="text-[10px] text-gray-400">{map.currentCharges}/{map.maxCharges} charges</div>
                <div className="mt-1 space-y-0.5">
                  {map.affixes.map(affix => (
                    <div key={`${map.id}-${affix.id}`} className="text-[10px] text-purple-200 truncate" title={mapAffixDescription(affix)}>
                      {mapAffixDescription(affix)}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-[#7e14ff]/70 mt-0.5">Enter Map →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {inventory.items.length === 0 && nexus.maps.length === 0 && (
        <div className="text-sm text-gray-500 italic">No items yet — monsters drop loot on death.</div>
      )}
    </div>
  )
}
