import { useGameStore } from './store/gameStore.ts'
import { useGameLoop } from './hooks/useGameLoop.ts'
import { Shield, Heart, Skull, MapPin, Save, RotateCcw, Package, ShieldCheck, Settings, Hammer, TreePine, Sparkles } from 'lucide-react'
import { useState, useMemo } from 'react'
import { InventoryPanel } from './components/InventoryPanel.tsx'
import { ClassSelection } from './components/ClassSelection.tsx'
import { EquipmentPanel } from './components/EquipmentPanel.tsx'
import { CombatScene } from './components/CombatScene.tsx'
import { CombatLog } from './components/CombatLog.tsx'
import { CraftingPanel } from './components/CraftingPanel.tsx'
import { PassiveTreePanel } from './components/PassiveTreePanel.tsx'
import { AscendancySelection } from './components/AscendancySelection.tsx'
import { AscendancyTree } from './components/AscendancyTree.tsx'
import { DevTools } from './components/DevTools.tsx'
import { CharacterStats } from './components/CharacterStats.tsx'
import { SkillsPanel } from './components/SkillsPanel.tsx'
import { ASCENDANCIES, TRIALS } from './data/ascendancies.ts'

type Tab = 'zone' | 'inventory' | 'equipment' | 'crafting' | 'tree' | 'ascendancy' | 'skills' | 'settings'

function App() {
  const tick = useGameStore(state => state.tick)
  useGameLoop(tick)

  const character = useGameStore(state => state.character)
  const gamePhase = useGameStore(state => state.gamePhase)
  const activeTrial = useGameStore(state => state.activeTrial)
  const startTrial = useGameStore(state => state.startTrial)
  const combat = useGameStore(state => state.combat)
  const zones = useGameStore(state => state.zones)
  const passiveTree = useGameStore(state => state.passiveTree)
  const activeZoneId = useGameStore(state => state.activeZoneId)
  const previousZoneId = useGameStore(state => state.previousZoneId)
  const selectZone = useGameStore(state => state.selectZone)
  const returnToPreviousZone = useGameStore(state => state.returnToPreviousZone)
  const exportSave = useGameStore(state => state.exportSave)
  const resetGame = useGameStore(state => state.resetGame)
  const advanceToNextAct = useGameStore(state => state.advanceToNextAct)

  const [activeTab, setActiveTab] = useState<Tab>('inventory')
  const [saveString, setSaveString] = useState('')

  if (gamePhase === 'class-select') {
    return <ClassSelection />
  }

  if (gamePhase === 'ascendancy-select' && !activeTrial) {
    return <AscendancySelection />
  }

  const activeZone = zones.find(z => z.id === activeZoneId)
  const monster = combat.monster

  const ACT_NAMES: Record<number, string> = {
    1: 'The Shattered Coast',
    2: 'The Cinder Marches',
    3: 'Fulgurite Spires',
  }

  const groupedZones = useMemo(() => {
    const map: Record<number, typeof zones> = {}
    for (const zone of zones) {
      ;(map[zone.act] ??= []).push(zone)
    }
    for (const act of Object.keys(map)) {
      map[Number(act)].sort((a, b) => a.level - b.level)
    }
    return map
  }, [zones])

  const actNumbers = useMemo(
    () => Object.keys(groupedZones).map(Number).sort((a, b) => a - b),
    [groupedZones]
  )

  const activeAct = activeZone?.act ?? 1
  const currentActZones = groupedZones[activeAct] ?? []
  const currentActDone = currentActZones.length > 0 && currentActZones.every(z => z.killProgress >= 100)
  const nextAct = activeAct + 1
  const hasNextAct = actNumbers.includes(nextAct)

  const handleExport = () => {
    setSaveString(exportSave())
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
    { id: 'equipment', label: 'Equipment', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'crafting', label: 'Crafting', icon: <Hammer className="w-4 h-4" /> },
    { id: 'tree', label: 'Passives', icon: <TreePine className="w-4 h-4" /> },
    { id: 'ascendancy', label: 'Ascendancy', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'skills', label: 'Skills', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'zone', label: 'Acts', icon: <MapPin className="w-4 h-4" /> },
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
          <div className="text-sm text-gray-400">
            {character.ascendancyId
              ? ASCENDANCIES[character.ascendancyId].name.toUpperCase()
              : character.classId.toUpperCase()}{' '}
            — Level {character.level}
          </div>

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

          {/* Trials */}
          <div className="pt-2 border-t border-[#2e303a] space-y-2">
            <h4 className="text-xs font-medium text-[#d4a017]">Trials</h4>
            {activeTrial && previousZoneId && (
              <button
                onClick={returnToPreviousZone}
                className="w-full px-3 py-2 bg-[#1f2028] hover:bg-[#2e303a] border border-gray-500 rounded text-xs text-gray-200"
              >
                ← Return to Zone
              </button>
            )}
            {TRIALS.map(trial => {
              const completed =
                (trial.id === 'trial_of_ascension_1' && character.trial1Completed) ||
                (trial.id === 'trial_of_ascension_2' && character.trial2Completed) ||
                (trial.id === 'trial_of_ascension_3' && character.trial3Completed) ||
                (trial.id === 'trial_of_ascension_4' && character.trial4Completed)
              if (completed || character.level < trial.requiredLevel) return null
              return (
                <button
                  key={trial.id}
                  onClick={() => startTrial(trial.id)}
                  className="w-full px-3 py-2 bg-[#2e2a1f] hover:bg-[#3e3a2f] border border-[#d4a017] rounded text-xs text-[#d4a017]"
                >
                  Start {trial.name}
                </button>
              )
            })}
            {character.trial1Completed && character.trial2Completed && character.trial3Completed && character.trial4Completed && (
              <div className="text-xs text-gray-500">All trials completed.</div>
            )}
          </div>
        </section>

        {/* Center: Combat + Tabs */}
        <section className="lg:col-span-6 space-y-4">
          <div className="text-center">
            <h3 className="text-xl font-serif text-gray-200">{monster ? monster.name : 'Resting'}</h3>
            <div className="text-sm text-gray-400">
              {monster ? (monster.isBoss ? 'Boss' : `Level ${monster.level}`) : 'No enemy'}
            </div>
          </div>
          <CombatScene character={character} combat={combat} />

          <CombatLog events={combat.events} />

          {/* Tabs */}
          <section className="bg-[#15161d] border border-[#2e303a] rounded-lg p-4 flex flex-col">
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
                  <h2 className="text-lg font-serif text-[#d4a017]">Acts</h2>
                  {currentActDone && hasNextAct && (
                    <button
                      onClick={advanceToNextAct}
                      className="w-full px-3 py-2 bg-[#d4a017] hover:bg-[#b88a14] text-[#0b0c10] rounded text-sm font-medium flex items-center justify-center gap-2"
                    >
                      Go to Act {nextAct}
                    </button>
                  )}
                  <div className="space-y-6">
                    {actNumbers.map(act => {
                      const actZones = groupedZones[act]
                      const isActLocked = !actZones.some(z => z.unlocked)
                      return (
                        <div key={act} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-serif text-[#d4a017]">Act {act} — {ACT_NAMES[act] ?? 'Unknown'}</h3>
                            {isActLocked && <span className="text-xs text-gray-500 italic">Locked</span>}
                          </div>
                          <div className="space-y-2">
                            {actZones.map(zone => (
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
                        </div>
                      )
                    })}
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
              {activeTab === 'crafting' && <CraftingPanel />}
              {activeTab === 'tree' && <PassiveTreePanel tree={passiveTree} />}
              {activeTab === 'ascendancy' && <AscendancyTree />}
              {activeTab === 'skills' && <SkillsPanel />}

              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-serif text-[#d4a017]">Settings</h2>
                  <DevTools />
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
        </section>

        {/* Right: Character Stats */}
        <section className="lg:col-span-3">
          <CharacterStats character={character} combat={combat} />
        </section>
      </main>
    </div>
  )
}

export default App
