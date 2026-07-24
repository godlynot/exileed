import type { Character, CombatState } from '../types/game.ts'
import { DAMAGE, monsterScalingMultiplier } from '../data/balance.ts'
import {
  momentumDamageMultiplier,
  momentumActionSpeed,
  momentumDamageReduction,
  momentumCap,
} from '../systems/momentum.ts'
import { getActiveHeralds, getActiveBuffs } from '../systems/characterEffects.ts'

function estimatedArmourMitigation(character: Character): number {
  // Sample hit damage follows the same act-curve scaling as monsters so the
  // displayed mitigation reflects the actual hits the player is facing.
  const sampleHitDamage = Math.max(10, character.level * 10 * monsterScalingMultiplier(character.level))
  return character.armour / (character.armour + DAMAGE.ARMOUR_MITIGATION_DENOMINATOR * sampleHitDamage)
}

function estimatedEvadeChance(character: Character): number {
  const attackerAccuracy = Math.max(50, character.level * 20 + 50)
  return Math.min(character.evasion / (character.evasion + attackerAccuracy), DAMAGE.EVASION_CAP)
}

function calculateDps(character: Character, combat: CombatState): number {
  const avgPhys = (character.basePhysicalDamageMin + character.basePhysicalDamageMax) / 2
  const critBonus = 1 + character.criticalChance * (character.criticalMultiplier - 1)
  const actionSpeed = momentumActionSpeed(combat.momentum, character)
  const damageMult = momentumDamageMultiplier(combat.momentum, character)
  return avgPhys * character.attackRate * actionSpeed * damageMult * critBonus
}

export function CharacterStats({ character, combat }: { character: Character; combat: CombatState }) {
  const dps = calculateDps(character, combat)
  const heralds = getActiveHeralds(character)
  const buffs = getActiveBuffs(character)
  const momentum = combat.momentum
  const momentumCapValue = momentumCap(momentum, character)
  const isMax = momentum.stacks >= momentumCapValue

  const resistances = [
    { key: 'fire' as const, label: 'Fire', value: character.resistances.fire * 100 },
    { key: 'cold' as const, label: 'Cold', value: character.resistances.cold * 100 },
    { key: 'lightning' as const, label: 'Lightning', value: character.resistances.lightning * 100 },
    { key: 'chaos' as const, label: 'Chaos', value: character.resistances.chaos * 100 },
  ]

  return (
    <div className="bg-[#15161d] border border-[#2e303a] rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-serif text-[#d4a017] uppercase tracking-wider">Character Stats</h3>

      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">DPS</div>
        <div className="text-3xl font-bold text-white">{Math.floor(dps)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Attack Rate</div>
          <div className="text-sm text-gray-200">
            {(character.attackRate * momentumActionSpeed(momentum, character)).toFixed(2)}/s
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Crit Chance</div>
          <div className="text-sm text-gray-200">{(character.criticalChance * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Crit Multi</div>
          <div className="text-sm text-gray-200">{character.criticalMultiplier.toFixed(2)}x</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Accuracy</div>
          <div className="text-sm text-gray-200">{Math.floor(character.accuracy)}</div>
        </div>
      </div>

      <div className="border-t border-[#2e303a] pt-3 space-y-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Defence</div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Max Life</span>
          <span className="text-gray-200">{Math.floor(character.maxLife)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Life Regen</span>
          <span className="text-gray-200">{(character.lifeRegen * 5).toFixed(1)}/s</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Max Energy Shield</span>
          <span className="text-gray-200">{Math.floor(character.maxEnergyShield)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">ES Recharge</span>
          <span className="text-gray-200">{(character.esRecharge * 5).toFixed(1)}/s</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Armour</span>
          <span className="text-gray-200">{Math.floor(character.armour)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Est. Phys Reduction</span>
          <span className="text-gray-200">{(estimatedArmourMitigation(character) * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Evasion</span>
          <span className="text-gray-200">{Math.floor(character.evasion)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Est. Evade Chance</span>
          <span className="text-gray-200">{(estimatedEvadeChance(character) * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="border-t border-[#2e303a] pt-3 space-y-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Resistances</div>
        {resistances.map((res) => {
          const isUncapped = res.value < DAMAGE.RESISTANCE_CAP * 100
          return (
            <div key={res.key} className="flex justify-between text-sm">
              <span className="text-gray-400">{res.label}</span>
              <span className={isUncapped ? 'text-amber-400' : 'text-gray-200'}>
                {res.value.toFixed(0)}% / {(DAMAGE.RESISTANCE_CAP * 100).toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>

      {(character.special.momentum || combat.momentum.stacks > 0) && (
        <div className="border-t border-[#2e303a] pt-3 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Momentum</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Stacks</span>
            <span className={isMax ? 'text-[#d4a017] font-medium' : 'text-gray-200'}>
              {momentum.stacks} / {momentumCapValue}
            </span>
          </div>
          {momentum.stacks > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">More Damage</span>
                <span className="text-gray-200">
                  {Math.round((momentumDamageMultiplier(momentum, character) - 1) * 100)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Action Speed</span>
                <span className="text-gray-200">
                  {Math.round((momentumActionSpeed(momentum, character) - 1) * 100)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Damage Reduction</span>
                <span className="text-gray-200">
                  {Math.round(momentumDamageReduction(momentum) * 100)}%
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {(heralds.length > 0 || buffs.length > 0) && (
        <div className="border-t border-[#2e303a] pt-3 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Active Effects</div>
          {heralds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {heralds.map((herald) => (
                <span
                  key={herald.label}
                  title={herald.desc}
                  className="px-2 py-0.5 bg-blue-900/40 border border-blue-700/50 rounded text-xs text-blue-200 cursor-help"
                >
                  {herald.label}
                </span>
              ))}
            </div>
          )}
          {buffs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {buffs.map((buff) => (
                <span
                  key={buff.label}
                  title={buff.desc}
                  className="px-2 py-0.5 bg-[#2e2a1f] border border-[#d4a017]/50 rounded text-xs text-[#d4a017] cursor-help"
                >
                  {buff.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
