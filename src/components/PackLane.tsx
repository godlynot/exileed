import { useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Character, PackMember } from '../types/game.ts'

interface PackLaneProps {
  character: Character
  currentPack: PackMember[]
}

function classIcon(classId: string) {
  switch (classId) {
    case 'brute': return '🛡️'
    case 'stalker': return '🗡️'
    case 'acolyte': return '🔮'
    case 'oracle': return '🔮'
    case 'warlord': return '️'
    case 'plaguebringer': return '☠️'
    default: return '⚔️'
  }
}

// ── Visual mockup: party allies on the lane (minion-system-spec.md §9.1) ──
// Hardcoded allies so the on-lane layout can be reviewed before any combat
// wiring. Remove/replace when real party state exists.
interface MockAlly {
  id: string
  name: string
  level: number
  maxLife: number
  life: number
  icon: string
}

const MOCK_ALLIES: MockAlly[] = [
  { id: 'ally_sentinel', name: 'Bone Sentinel', level: 29, maxLife: 2400, life: 2400, icon: '🛡️' },
  { id: 'ally_wretch', name: 'Plague Wretch', level: 29, maxLife: 900, life: 585, icon: '🐛' },
]

const AllyCard = memo(function AllyCard({ ally, compact }: { ally: MockAlly; compact?: boolean }) {
  const hpPercent = Math.max(0, (ally.life / ally.maxLife) * 100)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative flex w-full flex-col items-center"
    >
      {/* Compact cards fit two allies + the player in the lane's 176px height */}
      <div
        className={`relative flex ${compact ? 'h-9 w-9' : 'h-10 w-10'} items-center justify-center rounded-full border-2 border-emerald-400/60 bg-[var(--bg-elevated)] shadow-[0_0_8px_rgba(52,211,153,0.35)]`}
      >
        <motion.div
          className={compact ? 'text-base' : 'text-lg'}
          animate={{ x: [1, -1, 1] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        >
          {ally.icon}
        </motion.div>
      </div>
      {/* Friendly life bar — green reads as ally, mirrors monster bar styling */}
      <div className="mt-1 w-full">
        <div className="h-1.5 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-700 to-emerald-500"
            animate={{ width: `${hpPercent}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
      </div>
      <div
        title={`${ally.name} · L${ally.level}`}
        className="w-full truncate text-center text-[8px] leading-none text-emerald-200/90 mt-0.5 h-2.5"
      >
        {ally.name}
      </div>
    </motion.div>
  )
})

/** Placeholder emoji icons until distinct monster art/silhouettes are added. */
function monsterIcon(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('warden') || n.includes('revenant') || n.includes('zealot')) return '👹'
  if (n.includes('drown') || n.includes('coast') || n.includes('brine') || n.includes('wreck')) return '💀'
  if (n.includes('hound') || n.includes('waste') || n.includes('wolf')) return '🐺'
  if (n.includes('shade') || n.includes('ghost')) return '👻'
  if (n.includes('golem') || n.includes('colossus') || n.includes('husk')) return '🪨'
  return '👾'
}

function formatHp(n: number) {
  return Math.max(0, Math.round(n)).toString()
}

type Band = 'MELEE' | 'NEAR' | 'FAR'

/** Static range-band per front-to-back position: position 0 is the front/melee band, 1 near, 2+ far. */
function bandForSlot(slot: number): Band {
  if (slot === 0) return 'MELEE'
  if (slot === 1) return 'NEAR'
  return 'FAR'
}

function bandChipClass(slot: number): string {
  if (slot === 0) return 'text-red-400 bg-red-500/10 border-red-500/40'
  if (slot === 1) return 'text-amber-400 bg-amber-500/10 border-amber-500/40'
  return 'text-blue-400 bg-blue-500/10 border-blue-500/40'
}

function rarityGlow(rarity: PackMember['monster']['rarity'], isNamedElite: boolean): string {
  if (isNamedElite) return 'drop-shadow(0 0 10px rgba(251, 146, 60, 0.95))'
  if (rarity === 'rare') return 'drop-shadow(0 0 8px rgba(251, 146, 60, 0.75))'
  if (rarity === 'magic') return 'drop-shadow(0 0 4px rgba(251, 146, 60, 0.55))'
  return 'none'
}

interface PackMonsterProps {
  member: PackMember
  index: number
  isFront: boolean
  compact?: boolean
}

const PackMonsterItem = memo(function PackMonsterItem({ member, index, isFront, compact }: PackMonsterProps) {
  const monster = member.monster
  const hpPercent = Math.max(0, (member.currentLife / member.maxLife) * 100)
  const isElite = !!monster.isNamedElite
  const glow = rarityGlow(monster.rarity, isElite)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.35 }}
      className="relative flex w-full flex-col items-center"
    >
      {/* Active target pulse ring */}
      {isFront && (
        <span className="absolute -inset-1 rounded-full border-2 border-white/80 animate-ping pointer-events-none" />
      )}

      <div
        className={`relative flex items-center justify-center rounded-full border-2 bg-[var(--bg-elevated)] ${
          compact ? 'w-9 h-9' : 'w-12 h-12'
        } ${
          isFront ? 'border-[var(--accent-crystal)] shadow-[0_0_12px_rgba(103,209,227,0.45)]' : 'border-[var(--border-strong)]'
        }`}
      >
        <motion.div
          className={compact ? 'text-xl' : 'text-2xl'}
          style={{ filter: glow }}
          animate={{ x: isFront ? [-1, 1, -1] : [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: isFront ? 1.5 : 2.5, ease: 'easeInOut' }}
        >
          {monsterIcon(monster.name)}
        </motion.div>
        {isElite && (
          <div className="absolute -top-1 -right-1 text-xs" title="Named Elite">
            👑
          </div>
        )}
      </div>

      {/* HP bar with its own clear row */}
      <div className="mt-2 w-full">
        <div className="h-1.5 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
          <motion.div
            className="h-full bg-gradient-to-r from-red-700 to-red-500"
            animate={{ width: `${hpPercent}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
        <div
          className={`w-full text-center text-gray-300 mt-0.5 font-medium leading-none h-3 overflow-hidden whitespace-nowrap ${
            compact ? 'text-[8px]' : 'text-[9px]'
          }`}
        >
          {formatHp(member.currentLife)}/{formatHp(member.maxLife)}
        </div>
      </div>

      {/* Rarity label on its own row */}
      <div
        className={`text-[9px] uppercase tracking-wider leading-none h-3 truncate w-full text-center ${
          isElite ? 'font-semibold text-orange-300' : 'text-[var(--text-muted)]'
        }`}
      >
        {isElite ? 'Elite' : monster.rarity === 'normal' ? 'Normal' : monster.rarity}
      </div>

      {/* Range-band chip: current front-to-back position, not the original spawn slot */}
      <div
        className={`text-[8px] font-semibold uppercase tracking-wider px-1.5 rounded-sm border mt-1 leading-none h-3.5 flex items-center whitespace-nowrap ${bandChipClass(index)}`}
      >
        {bandForSlot(index)}
      </div>

      {/* Monster name on its own fixed row — truncates instead of wrapping into the lane labels */}
      <div
        title={monster.name}
        className="text-[10px] text-center text-gray-200 mt-1 leading-none h-4 w-full px-1 truncate"
      >
        {monster.name}
      </div>
    </motion.div>
  )
})

/** Icon/card sizes in px that mirror PackMonsterItem's Tailwind classes. */
export const LANE_ICON_NORMAL = 48 // w-12
const LANE_ICON_COMPACT = 36 // w-9
const LANE_CARD_MAX = 80 // max-w-[5rem]

/** Compact cards are used for large swarms (7-8 members). */
export function isCompactPack(packSize: number): boolean {
  return packSize > 6
}

/** Width of the monster container: the lane CSS is left-[30%] right-5 (right-5 = 20px). */
export function laneContainerWidth(laneWidth: number): number {
  return Math.max(0, laneWidth * 0.7 - 20)
}

/**
 * Width a single monster card gets in the lane's flex row. Cards share the
 * container evenly, capped at LANE_CARD_MAX, and never shrink below their
 * icon width, so icons physically cannot overlap.
 */
export function laneCardWidth(packSize: number, containerWidth: number): number {
  const iconWidth = isCompactPack(packSize) ? LANE_ICON_COMPACT : LANE_ICON_NORMAL
  const share = containerWidth / Math.max(1, packSize)
  return Math.max(iconWidth, Math.min(LANE_CARD_MAX, share))
}

export interface LaneSlotLayout {
  slot: number
  left: number
  width: number
}

/**
 * Front-to-back layout of a pack's monsters inside the lane container.
 * Cards tile from the container's left edge; consecutive cards never overlap
 * (left[i+1] >= left[i] + width[i] always holds).
 */
export function layoutLaneSlots(packSize: number, laneWidth: number): LaneSlotLayout[] {
  const width = laneCardWidth(packSize, laneContainerWidth(laneWidth))
  return Array.from({ length: Math.max(0, packSize) }, (_, slot) => ({ slot, left: slot * width, width }))
}

export function PackLane({ character, currentPack }: PackLaneProps) {
  const members = useMemo(() => {
    return [...(currentPack ?? [])].sort((a, b) => a.slot - b.slot)
  }, [currentPack])

  const lifePercent = Math.max(0, (character.life / character.maxLife) * 100)
  const esPercent = Math.max(0, (character.energyShield / Math.max(1, character.maxEnergyShield)) * 100)

  return (
    <div className="game-panel overflow-hidden">
      {/* Header: player stats — separated vertically from the lane */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 px-4 py-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">{classIcon(character.classId)}</span>
          <div>
            <div className="text-xs font-medium text-gray-200 leading-none">{character.name}</div>
            <div className="text-[10px] text-gray-500 leading-none mt-0.5">Lvl {character.level}</div>
          </div>
        </div>

        <div className="flex-1 max-w-xs space-y-1">
          <div className="relative h-3 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-700 to-red-500"
              animate={{ width: `${lifePercent}%` }}
              transition={{ duration: 0.15 }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[9px] font-bold text-white drop-shadow">
                {formatHp(character.life)}/{formatHp(character.maxLife)}
              </span>
            </div>
          </div>
          {character.maxEnergyShield > 0 && (
            <div className="relative h-1.5 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-400"
                animate={{ width: `${esPercent}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
          )}
        </div>

        {members[0] && (
          <div className="ml-auto text-xs text-gray-400 truncate">
            Target: <span className="text-white font-medium">{members[0].monster.name}</span>
          </div>
        )}
      </div>

      {/* Lane */}
      <div className="relative w-full h-44">
        {/* Lane track — flows from the pack on the right toward the player on the left */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-[var(--accent-gold)]/40 via-[var(--accent-gold)]/20 to-transparent -translate-y-1/2" />

        {/* Ground marks */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--accent-gold)]/10 -translate-y-1/2" />
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 w-2 h-2 bg-[var(--accent-gold)]/20 rounded-full -translate-y-1/2"
            style={{ left: `${8 + i * 10}%` }}
          />
        ))}

        {/* Player formation — ally mockups stacked directly above and below the player
            (minion-system-spec.md §9.1): one column, player centered on the lane line. */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
          <AllyCard ally={MOCK_ALLIES[0]} compact />
          <div className="text-5xl drop-shadow-lg my-0.5">{classIcon(character.classId)}</div>
          <AllyCard ally={MOCK_ALLIES[1]} compact />
        </div>

        {/* Monsters — flex row, evenly distributed so icons never overlap; the front
            monster is leftmost, closest to the player. Cards shrink for large swarms. */}
        <div className="absolute top-1/2 -translate-y-1/2 left-[30%] right-5 flex items-center z-[5]">
          <AnimatePresence initial={false}>
            {members.map((member, index) => {
              const isFront = index === 0
              const compact = members.length > 6
              return (
                <motion.div
                  key={member.id}
                  layout
                  className={`flex-1 basis-0 max-w-[5rem] flex items-center justify-center ${
                    compact ? 'min-w-[2.25rem]' : 'min-w-[3rem]'
                  }`}
                  initial={{ opacity: 0, x: 80 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <motion.div
                    className="w-full"
                    animate={{ x: [-3, 3, -3] }}
                    transition={{ repeat: Infinity, duration: 2 + index * 0.2, ease: 'easeInOut' }}
                  >
                    <PackMonsterItem member={member} index={index} isFront={isFront} compact={compact} />
                  </motion.div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {members.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 italic">
            Pack cleared...
          </div>
        )}
      </div>

      {/* Band legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-[var(--border)] bg-[var(--bg-secondary)]/60 px-4 py-1.5 text-[9px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">Range bands:</span>
        <span className="text-red-400/80">Melee = front only</span>
        <span className="text-amber-400/80">Near = front 2</span>
        <span className="text-blue-400/80">Far = front 3</span>
        <span className="text-[var(--accent-crystal)]/80">AoE = whole pack</span>
      </div>
    </div>
  )
}
