import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { CLASSES } from '../data/classes.ts'
import type { ClassId } from '../types/game.ts'
import { Shield, Wand2, Eye, Beaker } from 'lucide-react'

const classIcons: Record<ClassId, React.ReactNode> = {
  brute: <Shield className="w-10 h-10 text-orange-400" />,
  warlord: <Shield className="w-10 h-10 text-red-400" />,
  stalker: <Eye className="w-10 h-10 text-emerald-400" />,
  plaguebringer: <Beaker className="w-10 h-10 text-green-400" />,
  acolyte: <Wand2 className="w-10 h-10 text-purple-400" />,
  oracle: <Wand2 className="w-10 h-10 text-blue-400" />,
}

export function ClassSelection() {
  const startGame = useGameStore(state => state.startGame)
  const [selected, setSelected] = useState<ClassId | null>(null)

  return (
    <div className="min-h-screen bg-[#0b0c10] text-gray-100 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-serif text-[#d4a017] mb-2">Rift Idler</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Choose your exile. Each class starts in a different region of the passive tree.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl w-full">
        {Object.entries(CLASSES).map(([classId, gameClass]) => (
          <button
            key={classId}
            onClick={() => setSelected(classId as ClassId)}
            className={`relative p-6 rounded-lg border text-left transition-all ${
              selected === classId
                ? 'border-[#d4a017] bg-[#2e2a1f]'
                : 'border-[#2e303a] bg-[#15161d] hover:bg-[#1f2028]'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              {classIcons[classId as ClassId]}
              <h2 className="text-xl font-serif text-[#d4a017]">{gameClass.name}</h2>
            </div>
            <p className="text-sm text-gray-300 mb-4">{gameClass.description}</p>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
              <div>STR: {gameClass.baseAttributes.strength}</div>
              <div>DEX: {gameClass.baseAttributes.dexterity}</div>
              <div>INT: {gameClass.baseAttributes.intelligence}</div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Life: {gameClass.baseLife} | ES: {gameClass.baseEnergyShield}
            </div>
            <div className="mt-2 text-xs text-amber-500/80 italic">
              Starts in: {gameClass.id === 'brute' || gameClass.id === 'warlord' ? 'Warlord' : gameClass.id === 'stalker' || gameClass.id === 'plaguebringer' ? 'Plaguebringer' : 'Oracle'} region
            </div>
          </button>
        ))}
      </div>        <button
        onClick={() => selected && startGame(selected)}

        disabled={!selected}
        className="mt-8 px-8 py-3 bg-[#d4a017] text-black font-medium rounded hover:bg-[#e5b12a] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Begin Journey
      </button>
    </div>
  )
}
