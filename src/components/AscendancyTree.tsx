import { useGameStore } from '../store/gameStore.ts'
import { ASCENDANCIES } from '../data/ascendancies.ts'
import { AscendancyWheel } from './AscendancyWheel.tsx'

export function AscendancyTree() {
  const character = useGameStore(state => state.character)
  const allocateAscendancyNode = useGameStore(state => state.allocateAscendancyNode)
  const setAscendancyChoice = useGameStore(state => state.setAscendancyChoice)

  const availablePoints = character.ascendancyPoints

  const ascendancy = character.ascendancyId ? ASCENDANCIES[character.ascendancyId] : null

  if (!ascendancy) {
    return (
      <div className="text-center text-gray-400 py-8">
        You have not chosen an ascendancy yet. Complete a trial to unlock one.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-serif text-[#d4a017]">{ascendancy.name}</h2>
        <p className="text-gray-400 text-sm">{ascendancy.description}</p>
      </div>

      <AscendancyWheel
        ascendancy={ascendancy}
        allocatedNodes={character.allocatedAscendancyNodes}
        availablePoints={availablePoints}
        onAllocate={allocateAscendancyNode}
        onSetChoice={setAscendancyChoice}
        keystoneChoices={character.keystoneChoices}
      />
    </div>
  )
}
