import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { SKILLS } from '../data/skills.ts'
import { SUPPORTS } from '../data/supports.ts'

export function SkillsPanel() {
  const character = useGameStore(state => state.character)
  const equipSkill = useGameStore(state => state.equipSkill)
  const equipSupport = useGameStore(state => state.equipSupport)

  const [selectedSkillSlot, setSelectedSkillSlot] = useState<number | null>(null)
  const [selectedSupportSlot, setSelectedSupportSlot] = useState<{ skill: number; support: number } | null>(null)

  const ownedSkillIds = character.ownedGems.map(g => g.id)
  const ownedSupportIds = character.ownedGems.map(g => g.id)
  const allSkillIds = Object.keys(SKILLS)
  const allSupportIds = Object.keys(SUPPORTS)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-serif text-[#d4a017]">Skills</h2>
      <p className="text-xs text-gray-400">{character.supportSlotCount} support slots per skill</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, slotIndex) => {
          const equipped = character.equippedSkills[slotIndex]
          const skill = equipped ? SKILLS[equipped.skillId] : null
          return (
            <div key={slotIndex} className="bg-[#15161d] border border-[#2e303a] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase">Slot {slotIndex + 1}</span>
                <button
                  onClick={() => setSelectedSkillSlot(slotIndex)}
                  className="text-xs px-2 py-1 bg-[#2e303a] rounded hover:bg-[#3e404a]"
                >
                  {skill ? skill.name : 'Choose Skill'}
                </button>
              </div>
              {skill && (
                <div className="text-sm text-gray-200">
                  {skill.tags.join(' · ')}
                  <div className="text-xs text-gray-500">
                    {skill.baseDamageMin}–{skill.baseDamageMax} {skill.damageType} · {skill.cooldownTicks / 10}s
                  </div>
                </div>
              )}
              {skill && (
                <div className="grid grid-cols-5 gap-1">
                  {Array.from({ length: character.supportSlotCount }).map((_, supportIdx) => {
                    const supportId = equipped.supportIds[supportIdx]
                    const support = supportId ? SUPPORTS[supportId] : null
                    return (
                      <button
                        key={supportIdx}
                        onClick={() => setSelectedSupportSlot({ skill: slotIndex, support: supportIdx })}
                        className="aspect-square bg-[#1f2028] border border-[#2e303a] rounded text-[10px] text-gray-300 hover:bg-[#2e303a]"
                        title={support?.name ?? 'Empty support slot'}
                      >
                        {support ? support.name.slice(0, 8) : '+'}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedSkillSlot !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#15161d] border border-[#2e303a] rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-serif text-[#d4a017] mb-4">Choose a Skill</h3>
            <div className="space-y-2">
              {allSkillIds.map(id => {
                const skill = SKILLS[id]
                const owned = ownedSkillIds.includes(id)
                return (
                  <button
                    key={id}
                    disabled={!owned}
                    onClick={() => {
                      equipSkill(id, selectedSkillSlot)
                      setSelectedSkillSlot(null)
                    }}
                    className="w-full text-left p-3 rounded bg-[#1f2028] hover:bg-[#2e303a] disabled:opacity-40 border border-[#2e303a]"
                  >
                    <div className="text-sm text-gray-200">{skill.name} {owned ? '' : '(not owned)'}</div>
                    <div className="text-xs text-gray-500">{skill.tags.join(' · ')}</div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setSelectedSkillSlot(null)} className="mt-4 w-full py-2 bg-[#2e303a] rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      {selectedSupportSlot && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#15161d] border border-[#2e303a] rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-serif text-[#d4a017] mb-4">Choose a Support</h3>
            <div className="space-y-2">
              {allSupportIds.map(id => {
                const support = SUPPORTS[id]
                const owned = ownedSupportIds.includes(id)
                const equippedSkill = character.equippedSkills[selectedSupportSlot.skill]
                const skill = equippedSkill ? SKILLS[equippedSkill.skillId] : null
                const compatible = skill ? support.allowedTags.some(tag => skill.tags.includes(tag)) : false
                return (
                  <button
                    key={id}
                    disabled={!owned || !compatible}
                    onClick={() => {
                      equipSupport(id, selectedSupportSlot.skill)
                      setSelectedSupportSlot(null)
                    }}
                    className="w-full text-left p-3 rounded bg-[#1f2028] hover:bg-[#2e303a] disabled:opacity-40 border border-[#2e303a]"
                  >
                    <div className="text-sm text-gray-200">{support.name} {owned ? '' : '(not owned)'}</div>
                    <div className="text-xs text-gray-500">{support.allowedTags.join(' · ')} {compatible ? '' : '· incompatible'}</div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setSelectedSupportSlot(null)} className="mt-4 w-full py-2 bg-[#2e303a] rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
