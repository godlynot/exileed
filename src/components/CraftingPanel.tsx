import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { CURRENCIES } from '../data/currencies.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import { rarityTextClass } from '../types/item.ts'
import { NEXUS_MAX_TIER, nexusMapCrystalCost, nexusMapPacksForTier } from '../systems/nexus.ts'

export function CraftingPanel() {
  const inventory = useGameStore(state => state.inventory)
  const currencies = useGameStore(state => state.currencies)
  const nexus = useGameStore(state => state.nexus)
  const useCurrency = useGameStore(state => state.useCurrency)
  const craftNexusMap = useGameStore(state => state.craftNexusMap)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const selectedItem = selectedItemId
    ? inventory.items.find(item => item.id === selectedItemId) ?? null
    : null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-serif text-[var(--accent-gold)]">Crafting</h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(CURRENCIES).map(([id, currency]) => (
          <div key={id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div>
              <div className="text-xs text-gray-400">{currency.name}</div>
              <div className="data-value text-sm font-medium text-[var(--accent-gold)]">{currencies[id] || 0}</div>
            </div>
            <div className="text-[10px] text-gray-500 max-w-[80px] text-right">{currency.description}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Select an item to craft</h3>
          <span className="eyebrow text-[var(--text-muted)]">Choose a base</span>
        </div>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-4">
          {inventory.items.length === 0 && (
            <div className="col-span-4 text-xs text-gray-500 text-center py-4">No items in inventory</div>
          )}
          {inventory.items.map(item => (
            <button
              key={item.id}                onClick={() => setSelectedItemId(item.id)}
                aria-pressed={selectedItem?.id === item.id}
                className={`min-w-0 rounded border p-2 text-left text-xs transition-all hover:-translate-y-0.5 ${

                selectedItem?.id === item.id
                  ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-muted)] shadow-[0_0_0_1px_rgba(227,183,91,0.2)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--border)]'
              }`}
            >
            <div className={`truncate ${rarityTextClass(item.rarity)}`}>{item.name}</div>
            <div className="text-[10px] text-gray-500">{item.rarity}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Penance orb — standalone, does not require an item selection */}
      {(currencies['penance'] || 0) > 0 && (
        <div className="border border-[var(--border)] rounded p-3 bg-[var(--bg-panel)]">
          <div className="text-xs text-gray-400 mb-2">
            <span className="text-[var(--accent-green)]">Orb of Penance</span> — Refunds one allocated passive skill point.
          </div>
          <button
            onClick={() => useCurrency('', 'penance')}
            className="rounded border border-[var(--accent-green)]/30 bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10"
          >
            Use Orb of Penance ({currencies['penance'] || 0})
          </button>
        </div>
      )}

      {/* Nexus Map Crafting */}
      <div className="border-t border-[var(--border)] pt-4 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-[var(--accent-crystal)]">Nexus Mapcraft</h3>
          <span className="text-xs text-[var(--accent-crystal)]">{currencies['rift_crystal'] || 0} Rift Crystals</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: NEXUS_MAX_TIER }, (_, index) => index + 1).map(tier => {
            const cost = nexusMapCrystalCost(tier)
            const canAfford = (currencies['rift_crystal'] || 0) >= cost
            return (
              <button
                key={tier}
                onClick={() => craftNexusMap(tier)}
                disabled={!canAfford}
                className="rounded border border-[var(--accent-crystal)]/30 bg-[var(--bg-elevated)] p-2 text-center text-xs transition-colors hover:bg-[var(--border)] disabled:opacity-40"
              >
                <div className="font-medium text-[var(--accent-crystal)]">Tier {tier}</div>
                <div className="text-[10px] text-gray-500">{cost} Crystal{cost !== 1 && 's'}</div>
              </button>
            )
          })}
        </div>
        {nexus.maps.length > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--accent-crystal)]/20 bg-[var(--accent-crystal)]/5 p-3 text-[11px] text-gray-400">
            <div className="flex items-center justify-between gap-2">
              <span>{nexus.maps.length} map{nexus.maps.length !== 1 && 's'} owned</span>
              <span className="text-[var(--accent-crystal)]">{nexus.activeMapId ? 'Map in progress' : 'Open from Inventory'}</span>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {nexus.maps.slice(0, 4).map(map => (
                <div key={map.id} className="rounded border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5">
                  <div className="flex items-center justify-between text-[var(--accent-crystal)]">
                    <span>Tier {map.tier}</span>
                    <span className="text-cyan-200">{map.currentCharges}/{map.maxCharges}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-500">{nexusMapPacksForTier(map.tier)} packs to clear</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="game-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="eyebrow text-[var(--text-muted)]">Crafting target</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${rarityTextClass(selectedItem.rarity)}`}>{selectedItem.rarity}</span>
          </div>
          <ItemTooltip item={selectedItem} />
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(CURRENCIES).filter(([id]) => id !== 'penance').map(([id, currency]) => (
              <button
                key={id}
                onClick={() => useCurrency(selectedItem.id, id)}
                disabled={(currencies[id] || 0) <= 0}
                className="px-2 py-1 text-xs rounded bg-[var(--bg-elevated)] border border-[var(--border)] hover:bg-[var(--border)] disabled:opacity-50"
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
