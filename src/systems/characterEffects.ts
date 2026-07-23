import type { Character } from '../types/game.ts'

export interface EffectBadge {
  label: string
  desc: string
}

const HERALD_DESC: Record<string, string> = {
  light: 'Increased damage; blinded enemies cannot crit you and take increased damage.',
  gold: 'Increased gold, item quantity, and rarity from kills.',
  tide: 'Damage ramps while untouched; resets when hit.',
  silence: 'Enemies deal reduced damage; ailments on you are weakened.',
  storms: 'A bolt strikes a random enemy periodically.',
  judgment: 'Enemies below a health threshold take increased damage.',
}

export function getActiveHeralds(character: Character): EffectBadge[] {
  let activeIds: string[] = []
  if (character.special.twinHeralds) {
    const choice = character.keystoneChoices['herald_k3'] ?? 'light'
    activeIds = choice.split(',').filter(Boolean)
  } else if (character.special.proclaimHerald) {
    activeIds = [character.special.proclaimHerald]
  }

  return activeIds.map((id) => ({
    label: `Herald of ${id.charAt(0).toUpperCase() + id.slice(1)}`,
    desc: HERALD_DESC[id] ?? 'Active Herald aura.',
  }))
}

const BUFF_LABELS: Record<string, EffectBadge> = {
  juggernautStance: {
    label: "Juggernaut's Stance",
    desc: 'You cannot evade. You take reduced physical damage and cannot be stunned.',
  },
  perfectAim: {
    label: 'Perfect Aim',
    desc: 'Your attacks always hit, but you can never deal critical strikes.',
  },
  elementalDominion: {
    label: 'Elemental Dominion',
    desc: 'Elemental damage is converted to a single element for scaling purposes.',
  },
  ironReservation: {
    label: 'Iron Reservation',
    desc: 'A portion of maximum life is reserved to grant armour and stun immunity.',
  },
  zealotsCreed: {
    label: "Zealot's Creed",
    desc: 'Resistance cap is raised, but chaos damage bypasses energy shield.',
  },
  vengefulResolve: {
    label: 'Vengeful Resolve',
    desc: 'Damage taken recently is added as bonus damage to your hits.',
  },
  measuredStrikes: {
    label: 'Measured Strikes',
    desc: 'Every 3rd hit of each skill deals double damage.',
  },
  crescendo: {
    label: 'Crescendo',
    desc: 'Every 4th hit is a guaranteed critical strike; random crit chance is set to 0.',
  },
  foreseenDoom: {
    label: 'Foreseen Doom',
    desc: '40% of incoming damage is recorded and dealt evenly over the next 3s; delayed damage cannot drop you below 1 life.',
  },
  inevitability: {
    label: 'Inevitability',
    desc: 'Killing an enemy cancels a portion of pending delayed damage.',
  },
  perfectCalculation: {
    label: 'Perfect Calculation',
    desc: 'Your hits always deal their maximum damage.',
  },
  unwaveringDeclaration: {
    label: 'Unwavering Declaration',
    desc: 'Your active Herald is significantly stronger and unlocks its unique special. You cannot switch Heralds without a respec.',
  },
  twinHeralds: {
    label: 'Twin Heralds',
    desc: 'Proclaim two Heralds at once, each at reduced effect. Herald specials are disabled.',
  },
  resonantTruth: {
    label: 'Resonant Truth',
    desc: 'A portion of damage you deal returns as energy shield while a Herald is active.',
  },
  foretoldEnd: {
    label: 'Foretold End',
    desc: 'Your first hit against each enemy is empowered while a Herald is active.',
  },
  plaguewind: {
    label: 'Plaguewind',
    desc: 'When an afflicted enemy dies, all DOTs on it spread to the rest of its pack.',
  },
  pandemic: {
    label: 'Pandemic',
    desc: 'Your ailments also spread on application.',
  },
  plagueChorus: {
    label: 'Plague Chorus',
    desc: 'The more afflicted enemies in the pack, the faster all their ailments tick.',
  },
  patientZero: {
    label: 'Patient Zero',
    desc: 'The first enemy you afflict in each pack becomes a super-spreader.',
  },
  malignant: {
    label: 'Malignant',
    desc: 'Afflicted enemies take increased damage from all sources.',
  },
  septicemia: {
    label: 'Septicemia',
    desc: 'Applying an ailment stack causes existing stacks on that target to tick faster.',
  },
  cardiacArrest: {
    label: 'Cardiac Arrest',
    desc: 'At a stack threshold, ailments flare for burst damage and consume half the stacks.',
  },
  asphyxiation: {
    label: 'Asphyxiation',
    desc: 'Afflicted enemies slow the longer ailments persist on them.',
  },
  cirrhosis: {
    label: 'Cirrhosis',
    desc: 'The target cannot cleanse your ailments; healing it receives is reversed into damage.',
  },
  calcify: {
    label: 'Calcify',
    desc: 'Each time your DOT damage crosses a threshold, a bone spike erupts.',
  },
  relentlessAdvance: {
    label: 'Relentless Advance',
    desc: 'Momentum no longer decays while in combat; resets only when a fight fully ends.',
  },
  overrun: {
    label: 'Overrun',
    desc: 'At maximum Momentum, a portion of your damage becomes an unavoidable flat hit.',
  },
  breakneck: {
    label: 'Breakneck',
    desc: 'Each Momentum stack grants action speed; killing raises the stack cap with a hard ceiling.',
  },
  warMachine: {
    label: 'War Machine',
    desc: 'Momentum damage per stack is increased, but the maximum stack count is lowered.',
  },
  blitz: {
    label: 'Blitz',
    desc: 'While at maximum Momentum, every kill echoes damage to the rest of the pack.',
  },
  rallyingPresence: {
    label: 'Rallying Presence',
    desc: 'Each Momentum stack grants life regeneration and damage reduction.',
  },
  holdTheLine: {
    label: 'Hold the Line',
    desc: 'A portion of your armour also acts as flat damage resistance.',
  },
  bulwarksWrath: {
    label: "Bulwark's Wrath",
    desc: 'Damage taken is added as flat physical damage to your hits for the next few seconds.',
  },
  warOfAttrition: {
    label: 'War of Attrition',
    desc: 'Aura: every second, applies a DOT to nearby enemies equal to a portion of your max life.',
  },
}

export function getActiveBuffs(character: Character): EffectBadge[] {
  const buffs: EffectBadge[] = []
  for (const [key, meta] of Object.entries(BUFF_LABELS)) {
    const value = (character.special as Record<string, unknown>)[key]
    if (typeof value === 'boolean' && value) {
      buffs.push(meta)
    }
  }

  const army = character.special.bannermansResolve
  if (army) {
    const armyDesc: Record<string, string> = {
      iron_legion: 'Bonus armour and flat damage resistance.',
      skirmishers: 'Bonus attack/move speed and evasion; Momentum builds faster.',
      zealots: 'Bonus damage scaling with current Momentum stacks.',
      wardens: 'A portion of your Momentum defensive bonuses applies to the party set.',
      reapers: 'Nearby enemies are slowly worn down by reduced healing and a minor DOT.',
    }
    buffs.push({
      label: `Bannerman's Resolve (${army})`,
      desc: armyDesc[army] ?? 'An army fights under your banner.',
    })
  }

  return buffs
}
