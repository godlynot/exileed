import { useGameStore } from '../store/gameStore.ts'
import { ASCENDANCIES } from '../data/ascendancies.ts'
import { AscendancyWheel } from './AscendancyWheel.tsx'

export function AscendancySelection() {
  const character = useGameStore(state => state.character)
  const activeTrial = useGameStore(state => state.activeTrial)
  const selectAscendancy = useGameStore(state => state.selectAscendancy)
  const allocateAscendancyNode = useGameStore(state => state.allocateAscendancyNode)
  const setAscendancyChoice = useGameStore(state => state.setAscendancyChoice)

  const availablePoints = character.ascendancyPoints

  const ascendancy = character.ascendancyId ? ASCENDANCIES[character.ascendancyId] : null
  const classAscendancies = Object.values(ASCENDANCIES).filter(a => a.classId === character.classId)

  if (activeTrial) {
    return (
      <div className="min-h-screen bg-[#0b0c10] text-gray-100 flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-serif text-[#d4a017] mb-2">{activeTrial.name}</h1>
        <p className="text-gray-400 mb-6 text-center max-w-md">
          Defeat the {activeTrial.name} guardian to earn ascendancy points.
        </p>
        <div className="text-sm text-gray-500">The trial is in progress. Return to the game to fight.</div>
      </div>
    )
  }

  if (!ascendancy) {
    return (
      <div className="min-h-screen bg-[#0b0c10] text-gray-100 flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-serif text-[#d4a017] mb-2">Choose Your Ascendancy</h1>
        <p className="text-gray-400 mb-8 text-center max-w-md">
          You have completed a trial. Choose a specialization path for your {character.classId}.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full">
          {classAscendancies.map(a => (
            <button
              key={a.id}
              onClick={() => selectAscendancy(a.id)}
              className="p-6 rounded-lg border border-[#2e303a] bg-[#15161d] hover:bg-[#1f2028] text-left transition-all"
            >
              <h2 className="text-xl font-serif text-[#d4a017] mb-2">{a.name}</h2>
              <p className="text-sm text-gray-300 mb-4">{a.description}</p>
              <div className="text-xs text-gray-500">
                {a.nodes.length} possible nodes · {availablePoints} points available
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] text-gray-100 flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-serif text-[#d4a017] mb-2">{ascendancy.name}</h1>
      <p className="text-gray-400 mb-2 text-center max-w-md">{ascendancy.description}</p>

      <AscendancyWheel
        ascendancy={ascendancy}
        allocatedNodes={character.allocatedAscendancyNodes}
        availablePoints={availablePoints}
        onAllocate={allocateAscendancyNode}
        onSetChoice={setAscendancyChoice}
        keystoneChoices={character.keystoneChoices}
      />

      <button
        onClick={() => selectAscendancy(ascendancy.id)}
        className="mt-8 px-8 py-3 bg-[#d4a017] text-black font-medium rounded hover:bg-[#e5b12a]"
      >
        Continue Journey
      </button>
    </div>
  )
}
