import type { ReactNode } from 'react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Sun,
  Coins,
  Waves,
  VolumeX,
  CloudLightning,
  Scale,
  Shield,
  Sword,
  Clock,
  Wind,
  Flame,
  Droplet,
  Skull,
  EyeOff,
  Users,
  Crosshair,
  Activity,
  X,
} from 'lucide-react'
import type { Character, CombatState, AilmentInstance } from '../types/game.ts'
import { getActiveHeralds, getActiveBuffs } from '../systems/characterEffects.ts'
import { TICKS_PER_SECOND } from '../data/balance.ts'

interface CombatEffectItem {
  id: string
  label: string
  desc: string
  icon: ReactNode
  count?: number
  timer?: string
  borderColor: string
  textColor: string
  bgColor: string
}

function secondsFromTicks(ticks: number): string {
  const seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND))
  return `${seconds}s`
}

function makeIcon(Icon: typeof Zap, classes: string, size = 14): ReactNode {
  return <Icon className={classes} size={size} />
}

export function CombatEffects({ character, combat }: { character: Character; combat: CombatState }) {
  const playerEffects: CombatEffectItem[] = []

  // Momentum
  if (combat.momentum.stacks > 0 || character.special.momentum) {
    playerEffects.push({
      id: 'momentum',
      label: 'Momentum',
      desc: `Warlord momentum: ${combat.momentum.stacks} stacks.`,
      icon: makeIcon(Zap, 'text-amber-400'),
      count: combat.momentum.stacks,
      borderColor: 'border-amber-700',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-900/30',
    })
  }

  // Heralds
  const heralds = getActiveHeralds(character)
  const heraldIcon: Record<string, typeof Zap> = {
    light: Sun,
    gold: Coins,
    tide: Waves,
    silence: VolumeX,
    storms: CloudLightning,
    judgment: Scale,
  }
  const heraldColors: Record<string, { border: string; text: string; bg: string }> = {
    light: { border: 'border-yellow-700', text: 'text-yellow-400', bg: 'bg-yellow-900/30' },
    gold: { border: 'border-yellow-600', text: 'text-yellow-300', bg: 'bg-yellow-900/30' },
    tide: { border: 'border-cyan-700', text: 'text-cyan-400', bg: 'bg-cyan-900/30' },
    silence: { border: 'border-slate-600', text: 'text-slate-300', bg: 'bg-slate-800/40' },
    storms: { border: 'border-blue-700', text: 'text-blue-400', bg: 'bg-blue-900/30' },
    judgment: { border: 'border-red-800', text: 'text-red-400', bg: 'bg-red-900/30' },
  }
  for (const herald of heralds) {
    const id = herald.label.toLowerCase().replace('herald of ', '')
    const Icon = heraldIcon[id] ?? Sun
    const colors = heraldColors[id] ?? { border: 'border-yellow-700', text: 'text-yellow-400', bg: 'bg-yellow-900/30' }
    playerEffects.push({
      id: `herald-${id}`,
      label: herald.label,
      desc: herald.desc,
      icon: makeIcon(Icon, colors.text),
      borderColor: colors.border,
      textColor: colors.text,
      bgColor: colors.bg,
    })
  }

  // Marshal army
  if (combat.marshal.army) {
    playerEffects.push({
      id: `army-${combat.marshal.army}`,
      label: `Army: ${combat.marshal.army}`,
      desc: 'Marshal army is fighting under your banner.',
      icon: makeIcon(Users, 'text-emerald-400'),
      borderColor: 'border-emerald-800',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
    })
  }

  // Bulwark's Wrath flat damage bonus
  if (combat.marshal.bulwarkFlat > 0) {
    playerEffects.push({
      id: 'bulwark',
      label: "Bulwark's Wrath",
      desc: `Damage taken is adding ${combat.marshal.bulwarkFlat} flat physical damage to your hits.`,
      icon: makeIcon(Shield, 'text-orange-400'),
      count: combat.marshal.bulwarkFlat,
      borderColor: 'border-orange-800',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-900/30',
    })
  }

  // Special ascendancy buffs (only show a curated subset to avoid clutter)
  const specialBuffs = getActiveBuffs(character).filter(
    (b) => !['Twin Heralds', 'Unwavering Declaration'].includes(b.label)
  )
  for (const buff of specialBuffs) {
    playerEffects.push({
      id: `buff-${buff.label}`,
      label: buff.label,
      desc: buff.desc,
      icon: makeIcon(Sword, 'text-[#d4a017]'),
      borderColor: 'border-[#d4a017]/60',
      textColor: 'text-[#d4a017]',
      bgColor: 'bg-[#2e2a1f]/60',
    })
  }

  // Fateseer delayed damage
  const delayedTotal = combat.delayedDamageQueue.reduce((sum, amount) => sum + amount, 0)
  if (delayedTotal > 0) {
    playerEffects.push({
      id: 'delayed-damage',
      label: 'Delayed Damage',
      desc: `${delayedTotal} pending delayed damage will be dealt over time.`,
      icon: makeIcon(Clock, 'text-purple-400'),
      count: delayedTotal,
      borderColor: 'border-purple-800',
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-900/30',
    })
  }

  // Evasion streak
  if (combat.playerEvasionStacks > 0) {
    playerEffects.push({
      id: 'evasion-streak',
      label: 'Evasion Streak',
      desc: `Consecutive dodges make your next hit more likely to land.`,
      icon: makeIcon(Wind, 'text-teal-400'),
      count: combat.playerEvasionStacks,
      borderColor: 'border-teal-800',
      textColor: 'text-teal-400',
      bgColor: 'bg-teal-900/30',
    })
  }

  // Enemy effects
  const enemyEffects: CombatEffectItem[] = []
  const monsterId = combat.monster?.id ?? null

  if (combat.monsterDebuffs.blind) {
    enemyEffects.push({
      id: 'blind',
      label: 'Blind',
      desc: 'This enemy is blinded and less likely to hit you.',
      icon: makeIcon(EyeOff, 'text-fuchsia-400'),
      borderColor: 'border-fuchsia-800',
      textColor: 'text-fuchsia-400',
      bgColor: 'bg-fuchsia-900/30',
    })
  }

  if (monsterId && combat.ailments[monsterId]) {
    const grouped = groupAilments(combat.ailments[monsterId])
    for (const ailment of grouped) {
      const colors: Record<
        string,
        { border: string; text: string; bg: string }
      > = {
        poison: { border: 'border-green-800', text: 'text-green-400', bg: 'bg-green-900/30' },
        bleed: { border: 'border-red-900', text: 'text-red-500', bg: 'bg-red-900/30' },
        burn: { border: 'border-orange-800', text: 'text-orange-500', bg: 'bg-orange-900/30' },
      }
      const color = colors[ailment.type] ?? { border: 'border-red-800', text: 'text-red-400', bg: 'bg-red-900/30' }
      const Icon = ailment.type === 'burn' ? Flame : ailment.type === 'bleed' ? Droplet : Skull
      enemyEffects.push({
        id: `ailment-${ailment.type}-${ailment.id}`,
        label: `${ailment.type.charAt(0).toUpperCase() + ailment.type.slice(1)}`,
        desc: `${ailment.type} ailment: ${ailment.stacks} stack(s), ${ailment.damagePerTick.toFixed(1)} damage/tick.`,
        icon: makeIcon(Icon, color.text),
        count: ailment.stacks,
        timer: secondsFromTicks(ailment.remainingTicks),
        borderColor: color.border,
        textColor: color.text,
        bgColor: color.bg,
      })
    }
  }

  if (monsterId && (combat.virulent.stacks[monsterId] ?? 0) > 0) {
    enemyEffects.push({
      id: 'virulent',
      label: 'Virulent',
      desc: 'Plaguebringer virulence is compounding on this target.',
      icon: makeIcon(Activity, 'text-lime-400'),
      count: combat.virulent.stacks[monsterId],
      borderColor: 'border-lime-800',
      textColor: 'text-lime-400',
      bgColor: 'bg-lime-900/30',
    })
  }

  if (combat.monsterEvasionStacks > 0) {
    enemyEffects.push({
      id: 'enemy-evasion-streak',
      label: 'Enemy Dodge Streak',
      desc: 'This enemy has dodged repeatedly and is easier to hit.',
      icon: makeIcon(Crosshair, 'text-gray-400'),
      count: combat.monsterEvasionStacks,
      borderColor: 'border-gray-700',
      textColor: 'text-gray-400',
      bgColor: 'bg-gray-800/40',
    })
  }

  return (
    <div className="bg-[#0b0c10]/90 border border-[#2e303a] rounded-lg p-2 space-y-2">
      <EffectRow label="You" effects={playerEffects} />
      <EffectRow label="Enemy" effects={enemyEffects} />
    </div>
  )
}

function groupAilments(ailments: AilmentInstance[]) {
  const byType = new Map<string, AilmentInstance>()
  for (const ailment of ailments) {
    const existing = byType.get(ailment.type)
    if (existing) {
      existing.stacks += ailment.stacks
      existing.damagePerTick += ailment.damagePerTick
      existing.remainingTicks = Math.max(existing.remainingTicks, ailment.remainingTicks)
    } else {
      byType.set(ailment.type, { ...ailment })
    }
  }
  return Array.from(byType.values())
}

function EffectRow({ label, effects }: { label: string; effects: CombatEffectItem[] }) {
  const [selected, setSelected] = useState<CombatEffectItem | null>(null)

  return (
    <div className="flex items-start gap-2">
      <div className="w-12 shrink-0 text-[10px] text-gray-500 uppercase tracking-wider pt-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {effects.length === 0 && <span className="text-[10px] text-gray-600 italic pt-1.5">None</span>}
        {effects.map((effect) => (
          <button
            key={effect.id}
            type="button"
            onClick={() => setSelected(effect)}
            className={[
              'relative flex items-center justify-center w-8 h-8 rounded border',
              'bg-gradient-to-br from-[#1a1c24] to-[#111318]',
              effect.bgColor,
              effect.borderColor,
              'shadow-sm hover:brightness-110 hover:scale-105 transition-transform cursor-pointer',
            ].join(' ')}
          >
            {effect.icon}
            {typeof effect.count === 'number' && (
              <span className={`absolute -top-1 -right-1 text-[9px] font-bold ${effect.textColor}`}>
                {Math.round(effect.count)}
              </span>
            )}
            {effect.timer && (
              <span className="absolute -bottom-1 right-0 text-[8px] leading-none text-gray-300 bg-black/60 px-0.5 rounded">
                {effect.timer}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-sm bg-gradient-to-b from-[#1a1515] to-[#0f0c0c] border border-[#2e303a] rounded-xl p-5 shadow-[0_0_40px_-10px_rgba(220,38,38,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={[
                    'flex items-center justify-center w-10 h-10 rounded border',
                    selected.bgColor,
                    selected.borderColor,
                  ].join(' ')}
                >
                  {selected.icon}
                </div>
                <div>
                  <h4 className={`text-base font-semibold ${selected.textColor}`}>{selected.label}</h4>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label} Effect</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{selected.desc}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-1.5 bg-[#2e303a] hover:bg-[#3e404a] rounded text-xs text-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  )
}
