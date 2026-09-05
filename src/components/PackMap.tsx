import { useEffect, useMemo, memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Character, PackMember, PartyMember, CombatState } from '../types/game.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'
import { playerWorldPosition } from '../systems/spatial.ts'

interface PackMapProps {
  character: Character
  combat: CombatState
  /** Live party mirror from combat state; minion members render on the map. */
  partyMembers?: PartyMember[]
}

function classIcon(classId: string) {
  switch (classId) {
    case 'brute': return '🛡️'
    case 'stalker': return '🗡️'
    case 'acolyte': return '🔮'
    case 'oracle': return '🔮'
    case 'warlord': return '🎖️'
    case 'plaguebringer': return '☠️'
    default: return '⚔️'
  }
}

// ── Party allies on the map (minion-system-spec.md §9.1) ──
// Real summoned minions trail the player; the hardcoded mockups remain only as
// the visual fallback while no minions are summoned.
interface MapAlly {
  id: string
  name: string
  level: number
  maxLife: number
  life: number
  icon: string
  /** Set for dead minions: grey card with a respawn countdown. */
  revivingSeconds?: number
}

const MOCK_ALLIES: MapAlly[] = [
  { id: 'ally_sentinel', name: 'Bone Sentinel', level: 29, maxLife: 2400, life: 2400, icon: '🛡️' },
  { id: 'ally_wretch', name: 'Plague Wretch', level: 29, maxLife: 900, life: 585, icon: '🐛' },
]

/** Display names for dead/reviving summons without a live party member. */
const MINION_NAMES: Record<string, string> = {
  bone_sentinel: 'Bone Sentinel',
  plague_wretch: 'Plague Wretch',
  rift_wisp: 'Rift Wisp',
}

function minionIcon(defId: string | undefined, name: string): string {
  const n = `${defId ?? ''} ${name}`.toLowerCase()
  if (n.includes('sentinel') || n.includes('echo')) return '🛡️'
  if (n.includes('wretch')) return '🐛'
  if (n.includes('wisp')) return '✨'
  return '👽'
}

const AllyChip = memo(function AllyChip({ ally }: { ally: MapAlly }) {
  const hpPercent = Math.max(0, (ally.life / Math.max(1, ally.maxLife)) * 100)
  const reviving = typeof ally.revivingSeconds === 'number'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="absolute z-10"
      style={{ left: 0, top: 0 }}
    >
      <div
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 ${
          reviving ? 'border-gray-600 bg-[var(--bg-primary)] opacity-60 grayscale' : 'border-emerald-400/60 bg-[var(--bg-elevated)] shadow-[0_0_8px_rgba(52,211,153,0.35)]'
        }`}
      >
        <span className="text-base">{ally.icon}</span>
        {reviving && (
          <span className="absolute -bottom-0.5 text-[9px] font-bold text-gray-200 bg-black/70 rounded px-1 leading-tight">
            {Math.max(1, Math.ceil(ally.revivingSeconds ?? 0))}s
          </span>
        )}
        {/* Friendly life bar under the chip */}
        <div className="absolute -bottom-1.5 left-0 right-0 h-1 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
          <motion.div
            className={`h-full ${reviving ? 'bg-gray-600' : 'bg-gradient-to-r from-emerald-700 to-emerald-500'}`}
            animate={{ width: `${reviving ? 100 : hpPercent}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
      </div>
      <div
        title={`${ally.name} · L${ally.level}${reviving ? ' · reviving' : ''}`}
        className={`mt-1 w-14 truncate text-center text-[8px] leading-none ${reviving ? 'text-gray-500' : 'text-emerald-200/90'}`}
      >
        {reviving ? 'Reviving…' : ally.name}
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

function rarityGlow(rarity: PackMember['monster']['rarity'], isNamedElite: boolean): string {
  if (isNamedElite) return 'drop-shadow(0 0 10px rgba(251, 146, 60, 0.95))'
  if (rarity === 'rare') return 'drop-shadow(0 0 8px rgba(251, 146, 60, 0.75))'
  if (rarity === 'magic') return 'drop-shadow(0 0 4px rgba(251, 146, 60, 0.55))'
  return 'none'
}

// ── Pure projection math (unit-tested in PackMap.test.ts) ────────────────────

/**
 * Maps the sim's abstract world units to screen space. The camera keeps the
 * party marker a fixed distance above the panel bottom; world y decreases
 * northward, so higher (more negative) world y renders closer to the top.
 * Marker coordinates are CENTER points in px, with x in [PADDING, width -
 * PADDING] and y in [TOP_MARGIN, height - PARTY_BOTTOM_GAP - 2 * PADDING].
 */
export interface ProjectionConfig {
  width: number
  height: number
  /** World units per screen px. */
  scale: number
  padding: number
  /** Distance from the panel bottom to the party marker center (px). */
  partyBottomGap: number
}

export const DEFAULT_PROJECTION: ProjectionConfig = {
  width: 640,
  height: 256,
  scale: 3.2,
  padding: 40,
  partyBottomGap: 56,
}

/** Center coordinates (px) of the party marker on the map panel. */
export function partyScreenPoint(worldY: number, config: ProjectionConfig = DEFAULT_PROJECTION): { x: number; y: number } {
  const centerX = config.width / 2
  // Party sits at the bottom of the map; move up as the world y increases.
  const y = config.height - config.partyBottomGap - worldY * config.scale
  return { x: centerX, y: clampY(y, config) }
}

/** Center coordinates (px) of a world-space marker on the map panel. */
export function worldToScreen(
  point: { x: number; y: number },
  partyWorldY: number,
  config: ProjectionConfig = DEFAULT_PROJECTION,
): { x: number; y: number } {
  const party = partyScreenPoint(partyWorldY, config)
  return {
    x: clampX(party.x + (point.x - 0) * config.scale, config),
    y: clampY(party.y - (point.y - partyWorldY) * config.scale, config),
  }
}

function clampX(x: number, config: ProjectionConfig): number {
  return Math.max(config.padding, Math.min(config.width - config.padding, x))
}

function clampY(y: number, config: ProjectionConfig): number {
  return Math.max(config.padding, Math.min(config.height - config.padding, y))
}

const MAP_CARD = 52 // marker diameter + label allowance, used for overlap checks

/** Any marker carrying a screen-space point that can be pushed apart. */
export interface PositionedMarker {
  point: { x: number; y: number }
}

/**
 * Resolve overlaps between same-panel markers by pushing each colliding marker
 * outward horizontally until every pair is separated. Deterministic and order
 * independent at the input level (later markers give way to earlier ones).
 */
export function resolveMarkerOverlaps<T extends PositionedMarker>(markers: T[], minDistance: number = MAP_CARD): T[] {
  const result = markers.map(marker => ({ ...marker, point: { ...marker.point } }))
  for (let i = 0; i < result.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = result[i].point
      const b = result[j].point
      const dx = a.x - b.x
      const distance = Math.abs(dx)
      if (distance >= minDistance) continue
      // Push the later marker away from the earlier one.
      const push = (minDistance - distance) * (dx >= 0 ? 1 : -1)
      result[i] = { ...result[i], point: { ...a, x: a.x + push } }
    }
  }
  return result
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PackMonsterProps {
  member: PackMember
  isFront: boolean
}

const PackMonsterMarker = memo(function PackMonsterMarker({ member, isFront }: PackMonsterProps) {
  const monster = member.monster
  const hpPercent = Math.max(0, (member.currentLife / member.maxLife) * 100)
  const isElite = !!monster.isNamedElite
  const glow = rarityGlow(monster.rarity, isElite)

  return (
    <motion.div
      className="absolute z-[5] flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ duration: 0.3 }}
      style={{ left: 0, top: 0 }}
    >
      {/* Active target pulse ring */}
      {isFront && (
        <span className="absolute left-1/2 top-1/2 -ml-8 -mt-8 h-16 w-16 rounded-full border-2 border-white/70 animate-ping pointer-events-none" />
      )}
      {/* Elite arena-lite ring (Stage 3): named elites read as mini-bosses */}
      {isElite && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 -ml-10 -mt-10 h-20 w-20 rounded-full border border-orange-400/40 animate-pulse" />
      )}

      <div
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 bg-[var(--bg-elevated)] ${
          isFront ? 'border-[var(--accent-crystal)] shadow-[0_0_12px_rgba(103,209,227,0.45)]' : 'border-[var(--border-strong)]'
        }`}
      >
        <span className="text-xl" style={{ filter: glow }}>
          {monsterIcon(monster.name)}
        </span>
        {isElite && (
          <div className="absolute -top-1 -right-1 text-xs" title="Named Elite">
            👑
          </div>
        )}
      </div>

      {/* Elite nameplate (Stage 3): compact orange label above the HP bar */}
      {isElite && (
        <div
          title={monster.name}
          className="mt-0.5 h-3 w-24 truncate rounded border border-orange-400/40 bg-[var(--bg-primary)]/80 px-1 text-center text-[9px] font-semibold leading-3 text-orange-300"
        >
          {monster.name}
        </div>
      )}

      {/* HP bar */}
      <div className="mt-1 w-12">
        <div className="h-1.5 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
          <motion.div
            className="h-full bg-gradient-to-r from-red-700 to-red-500"
            animate={{ width: `${hpPercent}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
      </div>
      <div
        title={monster.name}
        className="mt-0.5 h-3 w-16 truncate text-center text-[9px] font-medium leading-none text-gray-200"
      >
        {formatHp(member.currentLife)}/{formatHp(member.maxLife)}
      </div>
    </motion.div>
  )
})

/**
 * Boss encounter marker (Stage 2 spatial): oversized icon, gold arena ring,
 * and a full nameplate with a wide HP bar. Bosses are solo encounters, so
 * the nameplate has room without the overlap resolver interfering.
 */
const BossMarker = memo(function BossMarker({ member }: PackMonsterProps) {
  const monster = member.monster
  const hpPercent = Math.max(0, (member.currentLife / member.maxLife) * 100)
  return (
    <motion.div
      className="absolute z-[6] flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.4 }}
      style={{ left: 0, top: 0 }}
    >
      {/* Pulsing arena ring */}
      <span className="pointer-events-none absolute left-1/2 top-1/2 -ml-14 -mt-10 h-28 w-28 animate-pulse rounded-full border border-[var(--accent-gold)]/40" />
      {/* Active target pulse ring */}
      <span className="pointer-events-none absolute left-1/2 top-7 -ml-8 -mt-8 h-16 w-16 animate-ping rounded-full border-2 border-white/70" />

      <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--accent-gold)] bg-[var(--bg-elevated)] shadow-[0_0_18px_rgba(250,204,21,0.4)]">
        <span
          className="text-3xl"
          style={{ filter: 'drop-shadow(0 0 12px rgba(250, 204, 21, 0.9))' }}
        >
          {monsterIcon(monster.name)}
        </span>
      </div>

      {/* Boss nameplate */}
      <div className="mt-1 w-44 rounded border border-[var(--accent-gold)]/50 bg-[var(--bg-primary)]/90 px-2 py-1 shadow-lg">
        <div className="truncate text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">
          {monster.name}
        </div>
        <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
          <motion.div
            className="h-full bg-gradient-to-r from-red-800 via-red-600 to-red-400"
            animate={{ width: `${hpPercent}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
        <div className="mt-0.5 text-center text-[9px] tabular-nums text-gray-300">
          {formatHp(member.currentLife)}/{formatHp(member.maxLife)}
        </div>
      </div>
    </motion.div>
  )
})

/**
 * Stage 4 boss phase banner (Nexus Stage 4): flashes "Phase N" when a
 * bossPhaseChanged event crosses the combat event buffer. Keys on the latest
 * event id so repeat phases re-trigger the animation.
 */
function BossPhaseBanner({ combat }: { combat: CombatState }) {
  const [phaseFlash, setPhaseFlash] = useState<{ index: number; total: number; key: string } | null>(null)
  const phaseEvent = [...(combat.events ?? [])].reverse().find(event => event.type === 'bossPhaseChanged')
  const latestKey = phaseEvent?.id ?? null

  useEffect(() => {
    if (!phaseEvent || phaseEvent.type !== 'bossPhaseChanged') return
    setPhaseFlash({ index: phaseEvent.phaseIndex, total: phaseEvent.totalPhases, key: phaseEvent.id })
    const timer = setTimeout(() => setPhaseFlash(null), 2400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestKey])

  return (
    <AnimatePresence>
      {phaseFlash && (
        <motion.div
          key={phaseFlash.key}
          className="pointer-events-none absolute left-1/2 top-10 z-30 -translate-x-1/2"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 0.3 }}
        >
          <div className="rounded border border-red-500/60 bg-black/70 px-4 py-1.5 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
            <div className="text-center text-sm font-bold uppercase tracking-[0.2em] text-red-400">
              Phase {phaseFlash.index}
              {phaseFlash.total > 1 && <span className="text-red-300/70"> / {phaseFlash.total}</span>}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function PackMap({ character, combat, partyMembers }: PackMapProps) {
  const members = useMemo(() => {
    return [...(combat.currentPack ?? [])].sort((a, b) => a.slot - b.slot)
  }, [combat.currentPack])

  // The renderer interpolates between sim positions; it never writes back.
  const partyWorld = useMemo(() => playerWorldPosition(combat), [combat])
  const traveling = combat.phase === 'traveling'

  // Real summoned minions trail the player; dead ones show a grey reviving chip.
  const allies = useMemo<MapAlly[]>(() => {
    const live = (partyMembers ?? []).filter(member => member.role === 'minion')
    if (live.length === 0 && !(character.summons ?? []).some(summon => !summon.alive)) return MOCK_ALLIES
    const liveCards: MapAlly[] = live.map(member => ({
      id: member.id,
      name: member.name,
      level: member.level,
      maxLife: member.maxLife,
      life: member.life,
      icon: minionIcon(member.minionDefId, member.name),
    }))
    const deadCards: MapAlly[] = (character.summons ?? [])
      .filter(summon => !summon.alive)
      .map(summon => ({
        id: `dead_${summon.minionDefId}`,
        name: MINION_NAMES[summon.minionDefId] ?? summon.minionDefId,
        level: summon.level,
        maxLife: 1,
        life: 1,
        icon: minionIcon(summon.minionDefId, summon.minionDefId),
        revivingSeconds: summon.respawnTicksRemaining / TICKS_PER_SECOND,
      }))
    return [...liveCards, ...deadCards]
  }, [partyMembers, character.summons])

  // Project the party and every monster to panel coordinates, then resolve
  // marker collisions so big packs never stack into one blob.
  const layout = useMemo(() => {
    const party = partyScreenPoint(partyWorld.y)
    const projected = members.map(member => ({
      member,
      point: worldToScreen(member.position, partyWorld.y),
    }))
    const resolved = resolveMarkerOverlaps(projected)
    return { party, markers: resolved }
  }, [members, partyWorld.y])

  const lifePercent = Math.max(0, (character.life / character.maxLife) * 100)
  const esPercent = Math.max(0, (character.energyShield / Math.max(1, character.maxEnergyShield)) * 100)
  const travelSeconds = Math.max(0, combat.travelTicksRemaining / TICKS_PER_SECOND)

  return (
    <div className="game-panel overflow-hidden">
      {/* Header: player stats — separated vertically from the map */}
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
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 truncate">
            {members[0].monster.rarity === 'boss' && (
              <span className="rounded bg-[var(--accent-gold)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--accent-gold)]">
                Boss
              </span>
            )}
            {members[0].monster.rarity !== 'boss' && members[0].monster.isNamedElite && (
              <span className="rounded bg-orange-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-300">
                Elite
              </span>
            )}
            {/* Only swarm packs exceed 4 members (regular packs cap at 4, bosses are solo) */}
            {members.length >= 5 && (
              <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                Swarm ×{members.length}
              </span>
            )}
            Target:{' '}
            <span className={`font-medium ${members[0].monster.rarity === 'boss' ? 'text-[var(--accent-gold)]' : 'text-white'}`}>
              {members[0].monster.name}
            </span>
          </div>
        )}
      </div>

      {/* Top-down map */}
      <div className={`relative w-full overflow-hidden ${traveling ? 'map-travel' : ''}`} style={{ height: 256 }}>
        {/* Ground: subtle grid that scrolls south while traveling so the party reads as moving north */}
        <div className="map-ground absolute inset-0" />

        {/* Approach line: party to the current pack/waypoint */}
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          <line
            x1={layout.party.x}
            y1={layout.party.y}
            x2={traveling ? layout.party.x : layout.markers[0]?.point.x ?? layout.party.x}
            y2={traveling ? Math.max(24, layout.party.y - 72) : layout.markers[0]?.point.y ?? layout.party.y}
            stroke="var(--accent-gold)"
            strokeOpacity={0.25}
            strokeDasharray="4 6"
          />
        </svg>

        {/* Monster markers (hidden while traveling — the pack is seeded on arrival). Bosses get the arena treatment. */}
        <AnimatePresence initial={false}>
          {!traveling &&
            layout.markers.map(({ member, point }) => (
              <motion.div
                key={member.id}
                className="absolute z-[5]"
                style={{ left: point.x, top: point.y }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {member.monster.rarity === 'boss' ? (
                  <BossMarker member={member} isFront={member === members[0]} />
                ) : (
                  <PackMonsterMarker member={member} isFront={member === members[0]} />
                )}
              </motion.div>
            ))}
        </AnimatePresence>

        {/* Travel destination marker */}
        {traveling && (
          <div className="absolute z-[4]" style={{ left: layout.party.x, top: Math.max(24, layout.party.y - 72) }}>
            <span className="map-waypoint-pulse block h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--accent-gold)]" />
          </div>
        )}

        {/* Party column: summoned minions trail slightly left of the player */}
        <motion.div
          className="absolute z-10 flex flex-col items-center"
          animate={{ left: layout.party.x, top: layout.party.y }}
          transition={{ type: 'tween', duration: TICKS_PER_SECOND > 0 ? 1 / TICKS_PER_SECOND : 0.4, ease: 'linear' }}
        >
          {allies[0] && (
            <div className="absolute -left-11 -top-2">
              <AllyChip ally={allies[0]} />
            </div>
          )}
          <div className="text-4xl drop-shadow-lg">{classIcon(character.classId)}</div>
          {allies[1] && (
            <div className="absolute -left-11 top-10">
              <AllyChip ally={allies[1]} />
            </div>
          )}
        </motion.div>

        {/* Travel status banner */}
        {traveling && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded border border-[var(--border)] bg-[var(--bg-primary)]/80 px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Traveling · next pack in {travelSeconds.toFixed(1)}s
          </div>
        )}

        {/* Stage 4: boss phase transition banner (Nexus Sovereign + phased campaign bosses) */}
        {!traveling && <BossPhaseBanner combat={combat} />}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-[var(--border)] bg-[var(--bg-secondary)]/60 px-4 py-1.5 text-[9px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">Spatial view:</span>
        <span className="text-orange-400/80">Glow = magic/rare</span>
        <span className="text-[var(--accent-crystal)]/80">Ring = active target</span>
        <span className="text-[var(--accent-gold)]/80">Dash = approach path</span>
        <span className="text-[var(--accent-gold)]/90">Arena = boss</span>
        <span className="text-orange-300/80">👑 + ring = named elite</span>
        <span className="text-amber-300/80">Wedge = swarm pack</span>
      </div>
    </div>
  )
}
