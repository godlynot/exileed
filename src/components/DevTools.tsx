import { useGameStore } from '../store/gameStore.ts'
import { useState } from 'react'

export function DevTools() {
  const character = useGameStore(state => state.character)
  const devSetLevel = useGameStore(state => state.devSetLevel)
  const devSetStats = useGameStore(state => state.devSetStats)
  const [customLevel, setCustomLevel] = useState(character.level)

  const [stats, setStats] = useState({
    strength: character.attributes.strength,
    dexterity: character.attributes.dexterity,
    intelligence: character.attributes.intelligence,
    maxLife: character.maxLife,
    maxEnergyShield: character.maxEnergyShield,
    basePhysicalDamageMin: character.basePhysicalDamageMin,
    basePhysicalDamageMax: character.basePhysicalDamageMax,
    attackRate: character.attackRate,
    criticalChance: character.criticalChance,
  })

  const applyStats = () => {
    devSetStats({
      attributes: {
        ...character.attributes,
        strength: stats.strength,
        dexterity: stats.dexterity,
        intelligence: stats.intelligence,
      },
      maxLife: stats.maxLife,
      maxEnergyShield: stats.maxEnergyShield,
      basePhysicalDamageMin: stats.basePhysicalDamageMin,
      basePhysicalDamageMax: stats.basePhysicalDamageMax,
      attackRate: stats.attackRate,
      criticalChance: stats.criticalChance,
    })
  }

  const godMode = () => {
    devSetStats({
      attributes: {
        ...character.attributes,
        strength: 200,
        dexterity: 200,
        intelligence: 200,
      },
      maxLife: 2000,
      maxEnergyShield: 1000,
      basePhysicalDamageMin: 200,
      basePhysicalDamageMax: 400,
      attackRate: 2.0,
      criticalChance: 0.5,
      life: 2000,
      energyShield: 1000,
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-serif text-[#d4a017]">Dev Tools</h3>
      <p className="text-xs text-gray-400">
        Use these controls to quickly test trials, balance, and late-game systems.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => devSetLevel(30)}
          className="px-3 py-2 bg-[#2e303a] hover:bg-[#3e404a] rounded text-xs text-gray-200"
        >
          Set Level 30
        </button>
        <button
          onClick={() => devSetLevel(60)}
          className="px-3 py-2 bg-[#2e303a] hover:bg-[#3e404a] rounded text-xs text-gray-200"
        >
          Set Level 60
        </button>
        <button
          onClick={() => devSetLevel(90)}
          className="px-3 py-2 bg-[#2e303a] hover:bg-[#3e404a] rounded text-xs text-gray-200"
        >
          Set Level 90
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={90}
          value={customLevel}
          onChange={e => setCustomLevel(Number(e.target.value))}
          className="w-20 px-2 py-1 bg-[#0b0c10] border border-[#2e303a] rounded text-sm text-gray-100"
        />
        <button
          onClick={() => devSetLevel(customLevel)}
          className="px-3 py-2 bg-[#2e303a] hover:bg-[#3e404a] rounded text-xs text-gray-200"
        >
          Set Custom Level
        </button>
      </div>

      <div className="text-xs text-gray-400 pt-2 border-t border-[#2e303a]">
        Current level: <span className="text-[#d4a017]">{character.level}</span>
      </div>

      {/* Stat overrides */}
      <div className="pt-2 border-t border-[#2e303a] space-y-3">
        <h4 className="text-sm font-medium text-[#d4a017]">Stat Overrides</h4>
        <p className="text-xs text-gray-400">
          Values are applied directly. Equipment/passive recalculation may overwrite some values.
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'STR', key: 'strength', min: 0 },
            { label: 'DEX', key: 'dexterity', min: 0 },
            { label: 'INT', key: 'intelligence', min: 0 },
            { label: 'Max Life', key: 'maxLife', min: 1 },
            { label: 'Max ES', key: 'maxEnergyShield', min: 0 },
            { label: 'Dmg Min', key: 'basePhysicalDamageMin', min: 0 },
            { label: 'Dmg Max', key: 'basePhysicalDamageMax', min: 0 },
            { label: 'Attack Rate', key: 'attackRate', min: 0.1, step: 0.1 },
            { label: 'Crit Chance', key: 'criticalChance', min: 0, step: 0.05 },
          ].map(field => (
            <div key={field.key} className="flex items-center gap-2">
              <span className="w-20 text-gray-400">{field.label}</span>
              <input
                type="number"
                min={field.min}
                step={field.step ?? 1}
                value={stats[field.key as keyof typeof stats]}
                onChange={e =>
                  setStats(s => ({ ...s, [field.key]: Number(e.target.value) }))
                }
                className="w-24 px-2 py-1 bg-[#0b0c10] border border-[#2e303a] rounded text-sm text-gray-100"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={applyStats}
            className="flex-1 px-3 py-2 bg-[#d4a017] text-black font-medium rounded hover:bg-[#e5b12a] text-xs"
          >
            Apply Stats
          </button>
          <button
            onClick={godMode}
            className="flex-1 px-3 py-2 bg-[#2e303a] hover:bg-[#3e404a] rounded text-xs text-gray-200"
          >
            God Mode
          </button>
        </div>
      </div>
    </div>
  )
}
