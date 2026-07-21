import { useGameStore } from './store/gameStore.ts'
import { useGameLoop } from './hooks/useGameLoop.ts'
import { Shield, Heart, Skull, MapPin, Save, RotateCcw, Package, ShieldCheck, Settings } from 'lucide-react'
import { useState } from 'react'
import { InventoryPanel } from './components/InventoryPanel.tsx'
import { EquipmentPanel } from './components/EquipmentPanel.tsx'

type Tab = 'zone' | 'inventory' | 'equipment' | 'settings'

function App() {
  const tick = useGameStore(state => state.tick)
  useGameLoop(tick)

  const character = useGameStore(state => state.character)
  const combat = useGameStore(state => state.combat)
  const zones = useGameStore(state => state.zones)
  const activeZoneId = useGameStore(state => state.activeZoneId)
  const selectZone = useGameStore(state => state.selectZone)
  const exportSave = useGameStore(state => state.exportSave)
  const resetGame = useGameStore(state => state.resetGame)

  const [activeTab, setActiveTab] = useState<Tab>('inventory')
  const [saveString, setSaveString] = useState('')

  const activeZone = zones.find(z => z.id === activeZoneId)
  const monster = combat.monster

  const handleExport = () => {
    setSaveString(exportSave())
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
    { id: 'equipment', label: 'Equipment', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'zone', label: 'Zone', icon: <MapPin className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-[#0b0c10] text-gray-100 flex flex-col">
      <header className="bg-[#1f2028] border-b border-[#2e303a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-serif text-[#d4a017]">Rift Idler</h1>
        <div className="text-sm text-gray-400">M2 — Items & Crafting</div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
        {/* Left: Character */}
        <section className="lg:col-span-3 bg-[#15161d] border border-[#2e303a] rounded-lg p-4 space-y-4">
          <h2 className="text-lg font-serif text-[#d4a017]">{character.name}</h2>
          <div className="text-sm text-gray-400">{character.classId.toUpperCase()} — Level {character.level}</div>

          {/* XP */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>XP</span>
              <span>{character.experience} / {character.experienceToNext}</span>
            </div>
            <div className="w-full h-2 bg-[#2e303a] rounded">
              <div
                className="h-full bg-[#d4a017] rounded"
                style={{ width: `${(character.experience / character.experienceToNext) * 100}%` }}
              />
            </div>
          </div>

          {/* Life */}
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span>Life</span>
                <span>{character.life} / {character.maxLife}</span>
              </div>
              <div className="w-full h-3 bg-[#2e303a] rounded">
                <div
                  className="h-full bg-red-600 rounded"
                  style={{ width: `${(character.life / character.maxLife) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* ES */}
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span>Energy Shield</span>
                <span>{character.energyShield} / {character.maxEnergyShield}</span>
              </div>
              <div className="w-full h-2 bg-[#2e303a] rounded">
                <div
                  className="h-full bg-blue-500 rounded"
                  style={{ width: `${(character.energyShield / Math.max(1, character.maxEnergyShield)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {!character.isAlive && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <Skull className="w-4 h-4" />
              <span>Respawning in {(character.respawnTimer / 10).toFixed(1)}s</span>
            </div>
          )}

          <div className="text-xs text-gray-400 pt-2 border-t border-[#2e303a] space-y-1">
            <div>STR: {character.attributes.strength}</div>
            <div>DEX: {character.attributes.dexterity}</div>
            <div>INT: {character.attributes.intelligence}</div>
          </div>
        </section>

        {/* Center: Combat */}
        <section className="lg:col-span-6 bg-[#15161d] border border-[#2e303a] rounded-lg p-6 flex flex-col items-center justify-center gap-6">
          {monster && (
            <>
              <div className="text-center">
                <h3 className="text-xl font-serif text-gray-200">{monster.name}</h3>
                <div className="text-sm text-gray-400">Level {monster.level}</div>
              </div>

              <div className="w-full max-w-md">
                <div className="flex justify-between text-xs mb-1">
                  <span>Monster Life</span>
                  <span>{combat.monsterLife} / {monster.maxLife}</span>
                </div>
                <div className="w-full h-4 bg-[#2e303a] rounded">
                  <div
                    className="h-full bg-red-700 rounded transition-all duration-75"
                    style={{ width: `${(combat.monsterLife / monster.maxLife) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex gap-8 text-sm">
                <div className="text-green-400">Hit: {combat.lastDamageDealt}</div>
                <div className="text-red-400">Taken: {combat.lastDamageTaken}</div>
              </div>
            </>
          )}
        </section>

        {/* Right: Tabbed panel */}
        <section className="lg:col-span-3 bg-[#15161d] border border-[#2e303a] rounded-lg p-4 flex flex-col">
          <div className="flex border-b border-[#2e303a] mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 text-xs font-medium flex flex-col items-center gap-1 ${
                  activeTab === tab.id ? 'text-[#d4a017] border-b-2 border-[#d4a017]' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {activeTab === 'zone' && (
              <div className="space-y-4">
                <h2 className="text-lg font-serif text-[#d4a017]">Zone</h2>
                <div className="space-y-2">
                  {zones.map(zone => (
                    <button
                      key={zone.id}
                      onClick={() => selectZone(zone.id)}
                      disabled={!zone.unlocked}
                      className={`w-full text-left px-3 py-2 rounded border text-sm flex items-center justify-between ${
                        activeZoneId === zone.id
                          ? 'border-[#d4a017] bg-[#2e2a1f]'
                          : 'border-[#2e303a] bg-[#1f2028]'
                      } ${!zone.unlocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#2e303a]'}`}
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {zone.name}
                      </span>
                      <span className="text-xs text-gray-400">Lv.{zone.level}</span>
                    </button>
                  ))}
                </div>
                {activeZone && (
                  <div className="text-xs text-gray-400">
                    Progress: {activeZone.killProgress.toFixed(1)}%
                  </div>
                )}
              </div>
            )}

            {activeTab === 'inventory' && <InventoryPanel />}
            {activeTab === 'equipment' && <EquipmentPanel />}

            {activeTab === 'settings' && (
              <div className="space-y-4">
                <h2 className="text-lg font-serif text-[#d4a017]">Settings</h2>
                <button
                  onClick={handleExport}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#2e303a] hover:bg-[#3e404a] rounded text-sm"
                >
                  <Save className="w-4 h-4" /> Export Save
                </button>
                {saveString && (
                  <textarea
                    readOnly
                    value={saveString}
                    className="w-full h-24 bg-[#0b0c10] border border-[#2e303a] rounded p-2 text-xs font-mono break-all"
                  />
                )}
                <button
                  onClick={resetGame}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-900/50 rounded text-sm text-red-200"
                >
                  <RotateCcw className="w-4 h-4" /> Reset Game
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
