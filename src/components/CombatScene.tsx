import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Character, CombatEvent, CombatState, Monster } from '../types/game.ts'
import { Heart, Shield, Sword, Skull } from 'lucide-react'
import { CombatEffects } from './CombatEffects.tsx'

interface CombatSceneProps {
  character: Character
  combat: CombatState
}

function classIcon(classId: string) {
  switch (classId) {
    case 'brute':
      return '🛡️'
    case 'stalker':
      return '🗡️'
    case 'acolyte':
      return '🔮'
    default:
      return '⚔️'
  }
}

function monsterEmoji(monster: Monster) {
  if (monster.isBoss) return '👹'
  const name = monster.name.toLowerCase()
  if (name.includes('drown') || name.includes('coast')) return '💀'
  if (name.includes('hound') || name.includes('waste')) return '🐺'
  if (name.includes('warden') || name.includes('bastion')) return '🧟'
  return '👾'
}

function eventColor(event: CombatEvent) {
  if (event.type === 'hitLanded') {
    if (event.source === 'player') return event.crit ? 'text-yellow-300' : 'text-red-400'
    return 'text-red-500'
  }
  if (event.type === 'hitAvoided') return 'text-gray-400'
  if (event.type === 'monsterDied') return 'text-yellow-400'
  return 'text-white'
}

function eventLabel(event: CombatEvent) {
  if (event.type === 'hitAvoided') return event.reason === 'evaded' ? 'Dodge' : 'Miss'
  if (event.type === 'monsterDied') return 'Kill!'
  if (event.type === 'hitLanded') return event.damage.toString()
  return ''
}

export function CombatScene({ character, combat }: CombatSceneProps) {
  const monster = combat.monster
  const playerLifePercent = Math.max(0, (character.life / character.maxLife) * 100)
  const playerESPercent = Math.max(0, (character.energyShield / Math.max(1, character.maxEnergyShield)) * 100)

  // Track most recent attack events to re-trigger swing animations
  const lastPlayerEvent = useMemo(
    () => [...combat.events].reverse().find(e => (e.type === 'hitLanded' || e.type === 'hitAvoided') && e.source === 'player'),
    [combat.events]
  )
  const lastMonsterEvent = useMemo(
    () => [...combat.events].reverse().find(e => (e.type === 'hitLanded' || e.type === 'hitAvoided') && e.source === 'monster'),
    [combat.events]
  )

  const visibleEvents = useMemo(
    () => combat.events.filter(e => e.type === 'hitLanded' || e.type === 'hitAvoided' || e.type === 'monsterDied'),
    [combat.events]
  )

  if (!monster) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No monster in sight.
      </div>
    )
  }

  const monsterLifePercent = Math.max(0, (combat.monsterLife / monster.maxLife) * 100)

  return (
    <div className="space-y-2">
    <div className="relative w-full h-80 bg-[#0f1115] rounded-lg border border-[#2e303a] overflow-hidden">
      {/* Background atmosphere */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-b from-red-900/20 to-transparent" />

      <div className="relative z-10 flex items-center justify-between h-full px-12">
        {/* Player avatar */}
        <div className="flex flex-col items-center gap-2 w-32">
          <div className="w-full">
            <div className="flex justify-between text-xs text-gray-300 mb-1">
              <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-500" /> {character.life}/{character.maxLife}</span>
            </div>
            <div className="w-full h-2 bg-[#2e303a] rounded overflow-hidden">
              <motion.div
                className="h-full bg-red-600"
                animate={{ width: `${playerLifePercent}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            {character.maxEnergyShield > 0 && (
              <div className="w-full h-1 mt-1 bg-[#2e303a] rounded overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500"
                  animate={{ width: `${playerESPercent}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}
          </div>

          <motion.div
            key={lastPlayerEvent?.id ?? 'player-idle'}
            animate={lastPlayerEvent ? { x: [0, 20, 0], rotate: [0, -10, 0] } : {}}
            transition={{ duration: 0.2 }}
            className="text-6xl drop-shadow-lg"
          >
            {classIcon(character.classId)}
          </motion.div>

          <div className="text-sm font-medium text-gray-200">{character.name}</div>
          <div className="text-xs text-gray-400">Lv.{character.level}</div>
        </div>

        {/* VS / center effects */}
        <div className="flex flex-col items-center gap-1">
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-2xl font-serif text-[#d4a017]"
          >
            VS
          </motion.div>
          <div className="text-xs text-gray-500">{combat.lastDamageDealt > 0 && <span className="text-green-400">-{combat.lastDamageDealt}</span>}</div>
        </div>

        {/* Monster avatar */}
        <div className="flex flex-col items-center gap-2 w-32">
          <div className="w-full">
            <div className="flex justify-between text-xs text-gray-300 mb-1">
              <span>{monster.name}</span>
            </div>
            <div className="w-full h-2 bg-[#2e303a] rounded overflow-hidden">
              <motion.div
                className="h-full bg-red-700"
                animate={{ width: `${monsterLifePercent}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            <div className="text-right text-xs text-gray-400 mt-1">{combat.monsterLife}/{monster.maxLife}</div>
          </div>

          <motion.div
            key={lastMonsterEvent?.id ?? 'monster-idle'}
            animate={lastMonsterEvent ? { x: [0, -20, 0], rotate: [0, 10, 0] } : {}}
            transition={{ duration: 0.2 }}
            className="text-6xl drop-shadow-lg"
          >
            {monsterEmoji(monster)}
          </motion.div>

          <div className="text-sm font-medium text-gray-200">{monster.name}</div>
          <div className="text-xs text-gray-400">Lv.{monster.level}</div>
        </div>
      </div>

      {/* Combat log overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Sword className="w-3 h-3 text-[#d4a017]" />
          <span className="text-gray-300">Last hit:</span>
          <span className={combat.lastDamageDealt > 0 ? 'text-green-400' : 'text-gray-500'}>
            {combat.lastDamageDealt > 0 ? `${combat.lastDamageDealt} dmg` : '—'}
          </span>
          <span className="text-gray-300">| Taken:</span>
          <span className={combat.lastDamageTaken > 0 ? 'text-red-400' : 'text-gray-500'}>
            {combat.lastDamageTaken > 0 ? `${combat.lastDamageTaken} dmg` : '—'}
          </span>
          <span className="text-gray-300">| Shield:</span>
          <span className="text-blue-400 flex items-center gap-1"><Shield className="w-3 h-3" /> {character.energyShield}/{character.maxEnergyShield}</span>
        </div>
      </div>
    </div>

    {/* Buff / Debuff bars */}
    <CombatEffects character={character} combat={combat} />

    {/* Scrolling combat events */}
    <div className="bg-[#0b0c10] border border-[#2e303a] rounded-lg p-2 h-32 overflow-hidden">
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Sword className="w-3 h-3 text-[#d4a017]" />
        <span>Combat Feed</span>
      </div>
      <div className="space-y-1 overflow-y-auto h-[calc(100%-1.25rem)] pr-1 scrollbar-thin">
        <AnimatePresence initial={false}>
          {visibleEvents.length === 0 && (
            <div className="text-xs text-gray-600 italic">No events yet.</div>
          )}
          {visibleEvents.slice(-10).map(event => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`text-xs font-medium ${eventColor(event)}`}
            >
              {event.type === 'monsterDied' ? (
                <span className="flex items-center gap-1">
                  <Skull className="w-3 h-3" /> {eventLabel(event)}
                </span>
              ) : (
                <span>{event.source === 'player' ? 'You' : monster.name} {eventLabel(event)}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  </div>
  )
}
