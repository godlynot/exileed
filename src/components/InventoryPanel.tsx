import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { ItemTooltip } from './ItemTooltip.tsx'
import { CURRENCIES } from '../data/currencies.ts'
import { isBlankSupport, isGemItem, isNonEquipmentItem, rarityTextClass, RARITY_COLORS } from '../types/item.ts'
import type { Item } from '../types/item.ts'
import { SUPPORTS } from '../data/supports.ts'
import { mapAffixDescription } from '../data/mapAffixes.ts'
import { nexusMapPacksForTier } from '../systems/nexus.ts'

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
  const setAutoSellMaxLevel = useGameStore(state => state.setAutoSellMaxLevel)
  const claimGemItem = useGameStore(state => state.claimGemItem)
  const convertBlankSupport = useGameStore(state => state.convertBlankSupport)
  const ownedGems = useGameStore(state => state.character.ownedGems)

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const selectedItem = selectedItemId
    ? inventory.items.find(item => item.id === selectedItemId) ?? null
    : null
  const [selectedSupportId, setSelectedSupportId] = useState('')
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-serif text-[var(--accent-gold)]">Inventory</h2>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">A compact 5 × 6 field kit for your next run.</p>
        </div>
        <span className="data-value shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
          {inventory.items.length} / {inventory.maxSize}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2 text-xs">
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={inventory.autoSellNormal}
            onChange={() => toggleAutoSell('normal')}
            className="accent-[var(--accent-gold)]"
          />
          Auto-sell Normal
        </label>
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={inventory.autoSellMagic}
            onChange={() => toggleAutoSell('magic')}
            className="accent-[var(--accent-gold)]"
          />
          Auto-sell Magic
        </label>
        <label className="flex items-center gap-2 text-gray-300">
          <span>Through item level</span>
          <input
            type="number"
            min={0}
            max={90}
            value={inventory.autoSellMaxLevel}
            onChange={event => setAutoSellMaxLevel(Number(event.target.value))}
            aria-label="Auto-sell maximum item level"
            className="w-14 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-center text-gray-200"
          />
          <span className="text-[10px] text-[var(--text-muted)]">0 = current level</span>
        </label>
      </div>

      <div
        role="grid"
        aria-label={`Inventory slots, ${inventory.items.length} of ${inventory.maxSize} occupied`}
        className="grid grid-cols-5 gap-2 sm:gap-2.5"
      >
        {inventory.items.map(item => (
          <button
            key={item.id}
            onClick={() => setSelectedItemId(item.id)}
            onMouseEnter={() => setHoveredItem(item)}
            onMouseLeave={() => setHoveredItem(null)}
            aria-label={`${item.name}, ${item.rarity} ${item.slot}, item level ${item.itemLevel}`}
            aria-pressed={selectedItem?.id === item.id}
            className={`group relative aspect-square min-w-0 rounded border bg-[var(--bg-elevated)] p-1 text-left text-xs transition-all hover:-translate-y-0.5 hover:bg-[var(--border)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] ${
              selectedItem?.id === item.id ? 'border-[var(--accent-gold)] shadow-[0_0_0_1px_rgba(227,183,91,0.2)]' : 'border-[var(--border)]'
            }`}
            style={{ borderLeftColor: RARITY_COLORS[item.rarity], borderLeftWidth: '3px' }}
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
          <div
            key={`empty-${i}`}
            role="gridcell"
            aria-label="Empty inventory slot"
            className="aspect-square rounded border border-[var(--border)]/60 bg-[var(--bg-secondary)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.28)]"
          />
        ))}
      </div>

      {inventory.items.length > inventory.maxSize && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          This save has {inventory.items.length - inventory.maxSize} item{inventory.items.length - inventory.maxSize === 1 ? '' : 's'} beyond the 5 × 6 capacity. Existing loot is preserved; clear overflow before collecting more.
        </div>
      )}

      {selectedItem && (
        <div className="game-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="eyebrow text-[var(--text-muted)]">Selected item</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${rarityTextClass(selectedItem.rarity)}`}>{selectedItem.rarity}</span>
          </div>
          <ItemTooltip item={selectedItem} />
          <div className="mt-3 flex flex-wrap gap-2">
            {isNonEquipmentItem(selectedItem) ? (
              isGemItem(selectedItem) ? (
                <>
                  <button
                    onClick={() => { claimGemItem(selectedItem.id); setSelectedItemId(null) }}
                    className="px-3 py-1 bg-[var(--accent-gold)] text-[var(--bg-primary)] rounded text-sm font-medium hover:bg-[var(--accent-gold-bright)]"
                  >
                    Claim Gem
                  </button>
                  <button
                    onClick={() => { discardItem(selectedItem.id); setSelectedItemId(null) }}
                    className="px-3 py-1 bg-[var(--border)] text-gray-200 rounded text-sm hover:bg-[var(--border-strong)]"
                  >
                    Discard
                  </button>
                </>
              ) : isBlankSupport(selectedItem) ? (
                <>
                  <select
                    value={selectedSupportId}
                    onChange={event => setSelectedSupportId(event.target.value)}
                    className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-sm text-gray-200"
                  >
                    <option value="">Choose support…</option>
                    {Object.values(SUPPORTS)
                      .filter(support => !ownedGems.some(gem => gem.id === support.id))
                      .map(support => <option key={support.id} value={support.id}>{support.name}</option>)}
                  </select>
                  <button
                    disabled={!selectedSupportId}
                    onClick={() => { convertBlankSupport(selectedItem.id, selectedSupportId); setSelectedItemId(null); setSelectedSupportId('') }}
                    className="px-3 py-1 bg-[var(--accent-gold)] text-[var(--bg-primary)] rounded text-sm font-medium hover:bg-[var(--accent-gold-bright)] disabled:opacity-50"
                  >
                    Convert
                  </button>
                  <button
                    onClick={() => { discardItem(selectedItem.id); setSelectedItemId(null); setSelectedSupportId('') }}
                    className="px-3 py-1 bg-[var(--border)] text-gray-200 rounded text-sm hover:bg-[var(--border-strong)]"
                  >
                    Discard
                  </button>
                </>
              ) : null
            ) : (
              <>
                <button
                  onClick={() => { equipItem(selectedItem); setSelectedItemId(null) }}
                  className="px-3 py-1 bg-[var(--accent-gold)] text-[var(--bg-primary)] rounded text-sm font-medium hover:bg-[var(--accent-gold-bright)]"
                >
                  Equip
                </button>
                <button
                  onClick={() => { sellItem(selectedItem.id); setSelectedItemId(null) }}
                  className="px-3 py-1 bg-[var(--border)] text-gray-200 rounded text-sm hover:bg-[var(--border-strong)]"
                >
                  Sell
                </button>
                <div className="w-full" />
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Nexus Maps */}
      {nexus.maps.length > 0 && (
        <div className="border-t border-[var(--border)] pt-4 mt-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[var(--accent-crystal)]">Nexus Maps</h3>
              <p className="mt-0.5 text-[11px] text-gray-500">Choose a map to begin an endgame run.</p>
            </div>
            {nexus.activeMapId && (
              <span className="rounded-full border border-[var(--accent-crystal)]/30 bg-[var(--accent-crystal)]/10 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--accent-crystal)]">
                Map in progress
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {nexus.maps.map(map => {
              const packsRequired = nexusMapPacksForTier(map.tier)
              const canEnter = !nexus.activeMapId && map.currentCharges > 0
              return (
                <button
                  key={map.id}
                  onClick={() => openNexusMap(map.id)}
                  disabled={!canEnter}
                  aria-label={`Enter Tier ${map.tier} Nexus map`}
                  className={`group rounded-lg border p-3 text-left transition-all ${
                    canEnter
                      ? 'border-[var(--accent-crystal)]/35 bg-[var(--bg-elevated)] hover:-translate-y-0.5 hover:border-[var(--accent-crystal)]/70 hover:bg-[var(--border)] hover:shadow-[0_8px_20px_rgba(103,209,227,0.12)]'
                      : 'border-[var(--border)] bg-[var(--bg-panel)] opacity-55'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--accent-crystal)]">Tier {map.tier}</div>
                      <div className="mt-0.5 text-[10px] text-gray-500">Level {map.monsterLevel} • {packsRequired} packs</div>
                    </div>
                    <div className="text-right text-[10px] text-cyan-200">
                      <div>{map.currentCharges}/{map.maxCharges}</div>
                      <div className="text-gray-500">charges</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {map.affixes.map(affix => (
                      <div key={`${map.id}-${affix.id}`} className="truncate text-[10px] text-[var(--accent-crystal)]" title={mapAffixDescription(affix)}>
                        {mapAffixDescription(affix)}
                      </div>
                    ))}
                  </div>
                  <div className={`mt-3 text-[10px] font-medium uppercase tracking-wider ${canEnter ? 'text-[var(--accent-crystal)] group-hover:text-white' : 'text-gray-600'}`}>
                    {map.currentCharges <= 0 ? 'Depleted' : canEnter ? 'Enter map →' : 'Finish current map first'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {inventory.items.length === 0 && nexus.maps.length === 0 && (
        <div className="text-sm text-gray-500 italic">No items yet — monsters drop loot on death.</div>
      )}
    </div>
  )
}
