import type { Item } from '../types/item.ts'

interface ItemTooltipProps {
  item: Item
  compact?: boolean
}

const rarityColor = (rarity: Item['rarity']) => {
  switch (rarity) {
    case 'magic': return 'text-blue-400'
    case 'rare': return 'text-yellow-400'
    case 'unique': return 'text-orange-400'
    default: return 'text-gray-300'
  }
}

const rarityBorder = (rarity: Item['rarity']) => {
  switch (rarity) {
    case 'magic': return 'border-blue-900/50'
    case 'rare': return 'border-yellow-900/50'
    case 'unique': return 'border-orange-900/50'
    default: return 'border-[#2e303a]'
  }
}

export function ItemTooltip({ item, compact }: ItemTooltipProps) {
  return (
    <div className={`bg-[#0b0c10] border ${rarityBorder(item.rarity)} p-3 rounded shadow-2xl max-w-xs ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Header */}
      <div className={`font-bold ${rarityColor(item.rarity)} ${compact ? 'text-sm' : 'text-base'} mb-0.5`}>
        {item.name}
      </div>
      <div className="text-xs text-gray-500 mb-2">
        {item.rarity} {item.slot} <span className="text-gray-600">• iLvl {item.itemLevel}</span>
      </div>

      {/* Base stats */}
      <div className="space-y-0.5 mb-2">
        {item.physicalDamageMin > 0 && (
          <div className="text-gray-200">
            <span className="text-[#d4a017]">{item.physicalDamageMin}-{item.physicalDamageMax}</span> Physical Damage
          </div>
        )}
        {item.flatLightningDamageMin > 0 && (
          <div className="text-gray-200">
            <span className="text-yellow-400">{item.flatLightningDamageMin}-{item.flatLightningDamageMax}</span> Lightning Damage
          </div>
        )}
        {item.flatColdDamageMin > 0 && (
          <div className="text-gray-200">
            <span className="text-cyan-400">{item.flatColdDamageMin}-{item.flatColdDamageMax}</span> Cold Damage
          </div>
        )}
        {item.attackRate > 0 && (
          <div className="text-gray-200">{item.attackRate.toFixed(2)} Attacks per Second</div>
        )}
        {item.armour > 0 && <div className="text-gray-200">{item.armour} Armour</div>}
        {item.evasion > 0 && <div className="text-gray-200">{item.evasion} Evasion</div>}
        {item.energyShield > 0 && <div className="text-gray-200">{item.energyShield} Energy Shield</div>}
        {item.life > 0 && <div className="text-gray-200">+{item.life} to maximum Life</div>}
        {item.chanceToBleed > 0 && <div className="text-red-400">{Math.round(item.chanceToBleed * 100)}% Chance to Bleed</div>}
        {item.chanceToShock > 0 && <div className="text-yellow-400">{Math.round(item.chanceToShock * 100)}% Chance to Shock</div>}
        {item.chanceToInflictDespair > 0 && <div className="text-purple-400">{Math.round(item.chanceToInflictDespair * 100)}% Chance to inflict Despair</div>}
        {item.movementSpeed > 0 && <div className="text-gray-200">+{Math.round(item.movementSpeed * 100)}% Movement Speed</div>}
        {item.increasedArmourPercent > 0 && <div className="text-gray-200">+{item.increasedArmourPercent}% increased Armour</div>}
        {item.increasedMaxLifePercent > 0 && <div className="text-gray-200">+{item.increasedMaxLifePercent}% increased maximum Life</div>}
        {item.damageVsBossesPercent > 0 && <div className="text-gray-200">+{item.damageVsBossesPercent}% increased Damage vs Bosses</div>}
        {item.goldFindPercent > 0 && <div className="text-yellow-300">+{item.goldFindPercent}% increased Gold Find</div>}
      </div>

      {/* Affixes */}
      {item.affixes.length > 0 && (
        <div className="border-t border-[#2e303a] pt-2 space-y-0.5">
          {item.affixes.map((affix, idx) => {
            const isPrefix = affix.type === 'prefix'
            return (
              <div key={idx} className={`${isPrefix ? 'text-blue-300' : 'text-green-300'}`}>
                <span className="text-gray-500 text-xs">T{affix.tier} {isPrefix ? 'P' : 'S'}:</span>{' '}
                {affix.name} <span className="text-gray-400">(+{affix.value})</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
