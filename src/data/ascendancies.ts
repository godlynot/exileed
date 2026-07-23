import type { Ascendancy, AscendancyNode, StatMod } from '../types/game.ts'

const SM: { type: 'small' } = { type: 'small' as const }
const KS: { type: 'keystone' } = { type: 'keystone' as const }

function small(id: string, name: string, x: number, y: number, stats: StatMod[] = []): AscendancyNode {
  return { id, name, description: name, x, y, ...SM, stats }
}

function keystone(id: string, name: string, x: number, y: number, description: string, opts?: Partial<AscendancyNode>): AscendancyNode {
  return { id, name, description, x, y, ...KS, ...opts }
}

// Oracle — Fateseer
const fateseerNodes: AscendancyNode[] = [
  // entry + smalls
  small('fate_s1', 'Clockwork', 150, 300, [{ stat: 'flat_accuracy', mode: 'flat', value: 20 }]),
  small('fate_s2', 'Tempo', 250, 260, [{ stat: 'inc_attack_speed_percent', mode: 'increased', value: 8 }]),
  small('fate_s3', 'Sharpened Fate', 250, 180, [{ stat: 'inc_crit_multi_percent', mode: 'increased', value: 15 }]),
  small('fate_s4', 'Foresight', 150, 140, [{ stat: 'flat_intelligence', mode: 'flat', value: 10 }]),
  small('fate_s5', 'Premonition', 50, 180, [{ stat: 'inc_es_percent', mode: 'increased', value: 10 }]),
  small('fate_s6', 'Precision', 50, 260, [{ stat: 'inc_crit_multi_percent', mode: 'increased', value: 12 }]),
  small('fate_s7', 'Converging Lines', 150, 220, [{ stat: 'inc_accuracy_percent', mode: 'increased', value: 10 }]),
  // keystones
  keystone('fate_k1', 'Measured Strikes', 350, 220, 'Every 3rd hit of each skill deals double damage.', { requires: ['fate_s3'], stats: [{ stat: 'special:measured_strikes', mode: 'special', value: 1 }] }),
  keystone('fate_k2', 'Crescendo', 350, 100, 'Every 4th hit is a guaranteed critical strike; random crit chance is set to 0.', { requires: ['fate_s3'], stats: [{ stat: 'special:crescendo', mode: 'special', value: 1 }] }),
  keystone('fate_k3', 'Foreseen Doom', 150, 20, '40% of incoming damage is recorded and dealt evenly over the next 3s; delayed damage cannot drop you below 1 life.', { requires: ['fate_s4'], stats: [{ stat: 'special:foreseen_doom', mode: 'special', value: 1 }] }),
  keystone('fate_k4', 'Inevitability', 250, 20, 'Killing an enemy cancels a portion of pending delayed damage.', { requires: ['fate_s3'], stats: [{ stat: 'special:inevitability', mode: 'special', value: 1 }] }),
  keystone('fate_k5', 'Perfect Calculation', 50, 20, 'Your hits always deal their maximum damage.', { requires: ['fate_s5'], stats: [{ stat: 'special:perfect_calculation', mode: 'special', value: 1 }] }),
]

// Oracle — Herald
const heraldNodes: AscendancyNode[] = [
  small('herald_s1', 'Devotion', 150, 300, [{ stat: 'flat_intelligence', mode: 'flat', value: 10 }]),
  small('herald_s2', 'Fervor', 250, 260, [{ stat: 'inc_spell_damage_percent', mode: 'increased', value: 10 }]),
  small('herald_s3', 'Standard', 250, 180, [{ stat: 'flat_energy_shield', mode: 'flat', value: 12 }]),
  small('herald_s4', 'Conviction', 150, 140, [{ stat: 'inc_es_percent', mode: 'increased', value: 10 }]),
  small('herald_s5', 'Division', 50, 180, [{ stat: 'inc_ele_damage_percent', mode: 'increased', value: 10 }]),
  small('herald_s6', 'Communion', 50, 260, [{ stat: 'flat_life', mode: 'flat', value: 12 }]),
  small('herald_s7', 'Litany', 150, 220, [{ stat: 'inc_crit_chance_percent', mode: 'increased', value: 10 }]),
  keystone('herald_k1', 'Proclaim a Herald', 350, 220, 'Choose one of six standing auras.', {
    requires: ['herald_s3'],
    choices: [
      { id: 'light', name: 'Herald of Light', description: 'Increased damage; blinded enemies cannot crit you and take increased damage.' },
      { id: 'gold', name: 'Herald of Gold', description: 'Increased gold, item quantity, and rarity from kills.' },
      { id: 'tide', name: 'Herald of Tide', description: 'Damage ramps while untouched; resets when hit.' },
      { id: 'silence', name: 'Herald of Silence', description: 'Enemies deal reduced damage; ailments on you are weakened.' },
      { id: 'storms', name: 'Herald of Storms', description: 'A bolt strikes a random enemy periodically.' },
      { id: 'judgment', name: 'Herald of Judgment', description: 'Enemies below a health threshold take increased damage.' },
    ],
    stats: [{ stat: 'special:proclaim_herald', mode: 'special', value: 1 }],
  }),
  keystone('herald_k2', 'Unwavering Declaration', 350, 100, 'Your active Herald is significantly stronger and unlocks its unique special. You cannot switch Heralds without a respec.', { requires: ['herald_s3'], stats: [{ stat: 'special:unwavering_declaration', mode: 'special', value: 1 }], mutuallyExclusiveWith: ['herald_k3'] }),
  keystone('herald_k3', 'Twin Heralds', 250, 100, 'Proclaim two Heralds at once, each at reduced effect. Specials are disabled.', {
    requires: ['herald_s3'],
    choices: [
      { id: 'light', name: 'Herald of Light', description: 'Increased damage; blinded enemies cannot crit you and take increased damage.' },
      { id: 'gold', name: 'Herald of Gold', description: 'Increased gold, item quantity, and rarity from kills.' },
      { id: 'tide', name: 'Herald of Tide', description: 'Damage ramps while untouched; resets when hit.' },
      { id: 'silence', name: 'Herald of Silence', description: 'Enemies deal reduced damage; ailments on you are weakened.' },
      { id: 'storms', name: 'Herald of Storms', description: 'A bolt strikes a random enemy periodically.' },
      { id: 'judgment', name: 'Herald of Judgment', description: 'Enemies below a health threshold take increased damage.' },
    ],
    maxChoices: 2,
    stats: [{ stat: 'special:twin_heralds', mode: 'special', value: 1 }],
    mutuallyExclusiveWith: ['herald_k2'],
  }),
  keystone('herald_k4', 'Resonant Truth', 150, 20, 'A portion of damage you deal returns as energy shield while a Herald is active.', { requires: ['herald_s3'], stats: [{ stat: 'special:resonant_truth', mode: 'special', value: 1 }] }),
  keystone('herald_k5', 'Foretold End', 50, 20, 'Your first hit against each enemy is empowered while a Herald is active.', { requires: ['herald_s5'], stats: [{ stat: 'special:foretold_end', mode: 'special', value: 1 }] }),
]

// Plaguebringer — Contagion
const contagionNodes: AscendancyNode[] = [
  small('cont_s1', 'Seedborne', 150, 300, [{ stat: 'flat_dexterity', mode: 'flat', value: 10 }]),
  small('cont_s2', 'Carrier', 250, 260, [{ stat: 'inc_ele_damage_percent', mode: 'increased', value: 8 }]),
  small('cont_s3', 'Withering Reach', 250, 180, [{ stat: 'flat_accuracy', mode: 'flat', value: 20 }]),
  small('cont_s4', 'Sympathetic Decay', 150, 140, [{ stat: 'inc_attack_speed_percent', mode: 'increased', value: 8 }]),
  small('cont_s5', 'Shared Rot', 50, 180, [{ stat: 'flat_intelligence', mode: 'flat', value: 10 }]),
  small('cont_s6', 'Creeping Virulence', 50, 260, [{ stat: 'inc_evasion_percent', mode: 'increased', value: 10 }]),
  small('cont_s7', 'Hivemind', 150, 220, [{ stat: 'inc_crit_chance_percent', mode: 'increased', value: 8 }]),
  keystone('cont_k1', 'Plaguewind', 350, 220, 'When an afflicted enemy dies, all DOTs on it spread to the rest of its pack.', { requires: ['cont_s3'], stats: [{ stat: 'special:plaguewind', mode: 'special', value: 1 }] }),
  keystone('cont_k2', 'Pandemic', 350, 100, 'Your ailments also spread on application.', { requires: ['cont_s3'], stats: [{ stat: 'special:pandemic', mode: 'special', value: 1 }] }),
  keystone('cont_k3', 'Plague Chorus', 250, 20, 'The more afflicted enemies in the pack, the faster all their ailments tick.', { requires: ['cont_s4'], stats: [{ stat: 'special:plague_chorus', mode: 'special', value: 1 }] }),
  keystone('cont_k4', 'Patient Zero', 150, 20, 'The first enemy you afflict in each pack becomes a super-spreader.', { requires: ['cont_s4'], stats: [{ stat: 'special:patient_zero', mode: 'special', value: 1 }] }),
  keystone('cont_k5', 'Malignant', 50, 20, 'Afflicted enemies take increased damage from all sources.', { requires: ['cont_s5'], stats: [{ stat: 'special:malignant', mode: 'special', value: 1 }] }),
]

// Plaguebringer — Virulent
const virulentNodes: AscendancyNode[] = [
  small('vir_s1', 'Infest', 150, 300, [{ stat: 'flat_intelligence', mode: 'flat', value: 10 }]),
  small('vir_s2', 'Sepsis', 250, 260, [{ stat: 'inc_ele_damage_percent', mode: 'increased', value: 8 }]),
  small('vir_s3', 'Palpitation', 250, 180, [{ stat: 'flat_dexterity', mode: 'flat', value: 10 }]),
  small('vir_s4', 'Wheeze', 150, 140, [{ stat: 'inc_evasion_percent', mode: 'increased', value: 10 }]),
  small('vir_s5', 'Bile', 50, 180, [{ stat: 'flat_energy_shield', mode: 'flat', value: 12 }]),
  small('vir_s6', 'Ossify', 50, 260, [{ stat: 'inc_es_percent', mode: 'increased', value: 10 }]),
  small('vir_s7', 'Miasma', 150, 220, [{ stat: 'inc_attack_speed_percent', mode: 'increased', value: 8 }]),
  keystone('vir_k1', 'Septicemia', 350, 220, 'Applying an ailment stack causes existing stacks on that target to tick faster.', { requires: ['vir_s3'], stats: [{ stat: 'special:septicemia', mode: 'special', value: 1 }] }),
  keystone('vir_k2', 'Cardiac Arrest', 350, 100, 'At a stack threshold, ailments flare for burst damage and consume half the stacks.', { requires: ['vir_s3'], stats: [{ stat: 'special:cardiac_arrest', mode: 'special', value: 1 }] }),
  keystone('vir_k3', 'Asphyxiation', 250, 20, 'Afflicted enemies slow the longer ailments persist on them.', { requires: ['vir_s4'], stats: [{ stat: 'special:asphyxiation', mode: 'special', value: 1 }] }),
  keystone('vir_k4', 'Cirrhosis', 150, 20, 'The target cannot cleanse your ailments; healing it receives is reversed into damage.', { requires: ['vir_s4'], stats: [{ stat: 'special:cirrhosis', mode: 'special', value: 1 }] }),
  keystone('vir_k5', 'Calcify', 50, 20, 'Each time your DOT damage crosses a threshold, a bone spike erupts.', { requires: ['vir_s5'], stats: [{ stat: 'special:calcify', mode: 'special', value: 1 }] }),
]

// Warlord — Vanguard
const vanguardNodes: AscendancyNode[] = [
  { id: 'van_momentum', name: 'Momentum', description: 'Gain access to Momentum: a stacking combat resource that grants damage, action speed, and damage reduction.', x: 150, y: 340, type: 'small', free: true, stats: [{ stat: 'special:momentum', mode: 'special', value: 1 }] },
  small('van_s1', 'Advance', 150, 300, [{ stat: 'flat_strength', mode: 'flat', value: 10 }]),
  small('van_s2', 'Charge', 250, 260, [{ stat: 'inc_phys_damage_percent', mode: 'increased', value: 10 }]),
  small('van_s3', 'Fury', 250, 180, [{ stat: 'inc_attack_speed_percent', mode: 'increased', value: 8 }]),
  small('van_s4', 'Momentum', 150, 140, [{ stat: 'flat_life', mode: 'flat', value: 15 }]),
  small('van_s5', 'Press', 50, 180, [{ stat: 'inc_evasion_percent', mode: 'increased', value: 10 }]),
  small('van_s6', 'Rout', 50, 260, [{ stat: 'flat_accuracy', mode: 'flat', value: 20 }]),
  small('van_s7', 'Drive', 150, 220, [{ stat: 'inc_crit_chance_percent', mode: 'increased', value: 8 }]),
  keystone('van_k1', 'Relentless Advance', 350, 220, 'Momentum no longer decays while in combat; resets only when a fight fully ends.', { requires: ['van_s3'], stats: [{ stat: 'special:relentless_advance', mode: 'special', value: 1 }] }),
  keystone('van_k2', 'Overrun', 350, 100, 'At maximum Momentum, a portion of your damage becomes an unavoidable flat hit.', { requires: ['van_s3'], stats: [{ stat: 'special:overrun', mode: 'special', value: 1 }] }),
  keystone('van_k3', 'Breakneck', 250, 20, 'Each Momentum stack grants action speed; killing raises the stack cap with a hard ceiling.', { requires: ['van_s4'], stats: [{ stat: 'special:breakneck', mode: 'special', value: 1 }], mutuallyExclusiveWith: ['van_k4'] }),
  keystone('van_k4', 'War Machine', 150, 20, 'Momentum damage per stack is increased, but the maximum stack count is lowered.', { requires: ['van_s4'], stats: [{ stat: 'special:war_machine', mode: 'special', value: 1 }], mutuallyExclusiveWith: ['van_k3'] }),
  keystone('van_k5', 'Blitz', 50, 20, 'While at maximum Momentum, every kill echoes damage to the rest of the pack.', { requires: ['van_s5'], stats: [{ stat: 'special:blitz', mode: 'special', value: 1 }] }),
]

// Warlord — Marshal
const marshalNodes: AscendancyNode[] = [
  { id: 'marsh_momentum', name: 'Momentum', description: 'Gain access to Momentum: a stacking combat resource that grants damage, action speed, and damage reduction.', x: 150, y: 340, type: 'small', free: true, stats: [{ stat: 'special:momentum', mode: 'special', value: 1 }] },
  small('marsh_s1', 'Rally', 150, 300, [{ stat: 'flat_strength', mode: 'flat', value: 10 }]),
  small('marsh_s2', 'Standard', 250, 260, [{ stat: 'inc_armour_percent', mode: 'increased', value: 10 }]),
  small('marsh_s3', 'Shieldwall', 250, 180, [{ stat: 'flat_life', mode: 'flat', value: 15 }]),
  small('marsh_s4', 'Vengeance', 150, 140, [{ stat: 'inc_phys_damage_percent', mode: 'increased', value: 10 }]),
  small('marsh_s5', 'Endure', 50, 180, [{ stat: 'flat_armour', mode: 'flat', value: 30 }]),
  small('marsh_s6', 'Muster', 50, 260, [{ stat: 'inc_accuracy_percent', mode: 'increased', value: 10 }]),
  small('marsh_s7', 'Colors', 150, 220, [{ stat: 'inc_life_percent', mode: 'increased', value: 8 }]),
  keystone('marsh_k1', 'Rallying Presence', 350, 220, 'Each Momentum stack grants life regeneration and damage reduction.', { requires: ['marsh_s3'], stats: [{ stat: 'special:rallying_presence', mode: 'special', value: 1 }] }),
  keystone('marsh_k2', 'Hold the Line', 350, 100, 'A portion of your armour also acts as flat damage resistance.', { requires: ['marsh_s3'], stats: [{ stat: 'special:hold_the_line', mode: 'special', value: 1 }] }),
  keystone('marsh_k3', 'Bannerman\'s Resolve', 250, 20, 'Choose one of five armies to serve under your banner.', {
    requires: ['marsh_s4'],
    choices: [
      { id: 'iron_legion', name: 'Iron Legion', description: 'Bonus armour and flat damage resistance.' },
      { id: 'skirmishers', name: 'Skirmishers', description: 'Bonus attack/move speed and evasion; Momentum builds faster.' },
      { id: 'zealots', name: 'Zealots', description: 'Bonus damage scaling with current Momentum stacks.' },
      { id: 'wardens', name: 'Wardens', description: 'A portion of your Momentum defensive bonuses applies to the party set.' },
      { id: 'reapers', name: 'Reapers', description: 'Nearby enemies are slowly worn down by reduced healing and a minor DOT.' },
    ],
    stats: [{ stat: 'special:bannermans_resolve', mode: 'special', value: 1 }],
  }),
  keystone('marsh_k4', 'Bulwark\'s Wrath', 150, 20, 'Damage taken is added as flat physical damage to your hits for the next few seconds.', { requires: ['marsh_s4'], stats: [{ stat: 'special:bulwarks_wrath', mode: 'special', value: 1 }] }),
  keystone('marsh_k5', 'War of Attrition', 50, 20, 'Aura: every second, applies a DOT to nearby enemies equal to a portion of your max life.', { requires: ['marsh_s5'], stats: [{ stat: 'special:war_of_attrition', mode: 'special', value: 1 }] }),
]

function connectEntry(nodes: AscendancyNode[], entryId: string, children: string[]) {
  const entry = nodes.find(n => n.id === entryId)
  if (!entry) return
  for (const childId of children) {
    const child = nodes.find(n => n.id === childId)
    if (child && !child.requires) child.requires = []
  }
}

connectEntry(fateseerNodes, 'fate_s1', ['fate_s2', 'fate_s6', 'fate_s7'])
connectEntry(heraldNodes, 'herald_s1', ['herald_s2', 'herald_s6', 'herald_s7'])
connectEntry(contagionNodes, 'cont_s1', ['cont_s2', 'cont_s6', 'cont_s7'])
connectEntry(virulentNodes, 'vir_s1', ['vir_s2', 'vir_s6', 'vir_s7'])
connectEntry(vanguardNodes, 'van_s1', ['van_s2', 'van_s6', 'van_s7'])
vanguardNodes.find(n => n.id === 'van_momentum')!.requires = ['van_s1']
connectEntry(marshalNodes, 'marsh_s1', ['marsh_s2', 'marsh_s6', 'marsh_s7'])
marshalNodes.find(n => n.id === 'marsh_momentum')!.requires = ['marsh_s1']

// Wire small paths to keystones
fateseerNodes.find(n => n.id === 'fate_s2')!.requires = ['fate_s1']
fateseerNodes.find(n => n.id === 'fate_s3')!.requires = ['fate_s2']
fateseerNodes.find(n => n.id === 'fate_s4')!.requires = ['fate_s1']
fateseerNodes.find(n => n.id === 'fate_s5')!.requires = ['fate_s1']
fateseerNodes.find(n => n.id === 'fate_s6')!.requires = ['fate_s1']
fateseerNodes.find(n => n.id === 'fate_s7')!.requires = ['fate_s2', 'fate_s6']

heraldNodes.find(n => n.id === 'herald_s2')!.requires = ['herald_s1']
heraldNodes.find(n => n.id === 'herald_s3')!.requires = ['herald_s2']
heraldNodes.find(n => n.id === 'herald_s4')!.requires = ['herald_s1']
heraldNodes.find(n => n.id === 'herald_s5')!.requires = ['herald_s1']
heraldNodes.find(n => n.id === 'herald_s6')!.requires = ['herald_s1']
heraldNodes.find(n => n.id === 'herald_s7')!.requires = ['herald_s2', 'herald_s6']

contagionNodes.find(n => n.id === 'cont_s2')!.requires = ['cont_s1']
contagionNodes.find(n => n.id === 'cont_s3')!.requires = ['cont_s2']
contagionNodes.find(n => n.id === 'cont_s4')!.requires = ['cont_s1']
contagionNodes.find(n => n.id === 'cont_s5')!.requires = ['cont_s1']
contagionNodes.find(n => n.id === 'cont_s6')!.requires = ['cont_s1']
contagionNodes.find(n => n.id === 'cont_s7')!.requires = ['cont_s2', 'cont_s6']

virulentNodes.find(n => n.id === 'vir_s2')!.requires = ['vir_s1']
virulentNodes.find(n => n.id === 'vir_s3')!.requires = ['vir_s2']
virulentNodes.find(n => n.id === 'vir_s4')!.requires = ['vir_s1']
virulentNodes.find(n => n.id === 'vir_s5')!.requires = ['vir_s1']
virulentNodes.find(n => n.id === 'vir_s6')!.requires = ['vir_s1']
virulentNodes.find(n => n.id === 'vir_s7')!.requires = ['vir_s2', 'vir_s6']

vanguardNodes.find(n => n.id === 'van_s2')!.requires = ['van_s1']
vanguardNodes.find(n => n.id === 'van_s3')!.requires = ['van_s2']
vanguardNodes.find(n => n.id === 'van_s4')!.requires = ['van_s1']
vanguardNodes.find(n => n.id === 'van_s5')!.requires = ['van_s1']
vanguardNodes.find(n => n.id === 'van_s6')!.requires = ['van_s1']
vanguardNodes.find(n => n.id === 'van_s7')!.requires = ['van_s2', 'van_s6']

marshalNodes.find(n => n.id === 'marsh_s2')!.requires = ['marsh_s1']
marshalNodes.find(n => n.id === 'marsh_s3')!.requires = ['marsh_s2']
marshalNodes.find(n => n.id === 'marsh_s4')!.requires = ['marsh_s1']
marshalNodes.find(n => n.id === 'marsh_s5')!.requires = ['marsh_s1']
marshalNodes.find(n => n.id === 'marsh_s6')!.requires = ['marsh_s1']
marshalNodes.find(n => n.id === 'marsh_s7')!.requires = ['marsh_s2', 'marsh_s6']

export const ASCENDANCIES: Record<string, Ascendancy> = {
  fateseer: {
    id: 'fateseer',
    name: 'Fateseer',
    classId: 'oracle',
    description: 'Combat on rails. No RNG. Random crit chance is replaced by scheduled crits.',
    nodes: fateseerNodes,
  },
  herald: {
    id: 'herald',
    name: 'Herald',
    classId: 'oracle',
    description: 'Declare a standing truth (aura) and it persists. Auras buff the party set.',
    nodes: heraldNodes,
  },
  contagion: {
    id: 'contagion',
    name: 'Contagion',
    classId: 'plaguebringer',
    description: 'The pack-spreader. One infection becomes everyone\'s problem.',
    nodes: contagionNodes,
  },
  virulent: {
    id: 'virulent',
    name: 'Virulent',
    classId: 'plaguebringer',
    description: 'The single-target boss-killer. Organs rot from within.',
    nodes: virulentNodes,
  },
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    classId: 'warlord',
    description: 'The steamroller. Build Momentum and never lose it.',
    nodes: vanguardNodes,
  },
  marshal: {
    id: 'marshal',
    name: 'Marshal',
    classId: 'warlord',
    description: 'Momentum as defense. Hold the line and let durability kill them.',
    nodes: marshalNodes,
  },
}

export const TRIALS: import('../types/game.ts').Trial[] = [
  { id: 'trial_of_ascension_1', name: 'Labyrinth: Normal', requiredLevel: 30, monsterId: 'trial_warden', rewardAscendancyPoints: 2 },
  { id: 'trial_of_ascension_2', name: 'Labyrinth: Cruel', requiredLevel: 50, monsterId: 'trial_lord', rewardAscendancyPoints: 2 },
  { id: 'trial_of_ascension_3', name: 'Labyrinth: Merciless', requiredLevel: 65, monsterId: 'trial_lord', rewardAscendancyPoints: 2 },
  { id: 'trial_of_ascension_4', name: 'Labyrinth: Uber', requiredLevel: 75, monsterId: 'trial_lord', rewardAscendancyPoints: 2 },
]
