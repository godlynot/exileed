import { ASCENDANCIES } from '../src/data/ascendancies.ts'
import { STAT_KEYS } from '../src/types/game.ts'
import type { AscendancyNode, StatKey } from '../src/types/game.ts'

const VALID_SPECIALS = new Set<StatKey>([
  'special:measured_strikes', 'special:crescendo', 'special:foreseen_doom', 'special:inevitability', 'special:perfect_calculation',
  'special:proclaim_herald', 'special:unwavering_declaration', 'special:twin_heralds', 'special:resonant_truth', 'special:foretold_end',
  'special:plaguewind', 'special:pandemic', 'special:plague_chorus', 'special:patient_zero', 'special:malignant',
  'special:septicemia', 'special:cardiac_arrest', 'special:asphyxiation', 'special:cirrhosis', 'special:calcify',
  'special:relentless_advance', 'special:overrun', 'special:breakneck', 'special:war_machine', 'special:blitz',
  'special:rallying_presence', 'special:hold_the_line', 'special:bannermans_resolve', 'special:bulwarks_wrath', 'special:war_of_attrition',
])

const statSet = new Set<string>(STAT_KEYS)
const issues: string[] = []

function validateWheel(ascendancyId: string, nodes: AscendancyNode[]) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const entry = nodes.find(n => !n.requires || n.requires.length === 0)

  if (nodes.length !== 12) {
    issues.push(`${ascendancyId}: expected 12 nodes, found ${nodes.length}`)
  }

  const keystones = nodes.filter(n => n.type === 'keystone')
  const smalls = nodes.filter(n => n.type === 'small')

  if (keystones.length !== 5) {
    issues.push(`${ascendancyId}: expected 5 keystones, found ${keystones.length}`)
  }
  if (smalls.length !== 7) {
    issues.push(`${ascendancyId}: expected 7 smalls, found ${smalls.length}`)
  }

  // Build adjacency from requires
  const adj = new Map<string, string[]>()
  for (const node of nodes) {
    adj.set(node.id, [])
  }
  for (const node of nodes) {
    for (const req of node.requires ?? []) {
      adj.get(req)?.push(node.id)
      adj.get(node.id)?.push(req)
    }
  }

  // Orphans (must be reachable from entry)
  if (entry) {
    const visited = new Set<string>([entry.id])
    const queue = [entry.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const n of adj.get(current) ?? []) {
        if (!visited.has(n)) {
          visited.add(n)
          queue.push(n)
        }
      }
    }
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        issues.push(`${ascendancyId}: node ${node.id} is not reachable from entry`)
      }
    }
  } else {
    issues.push(`${ascendancyId}: no entry node found`)
  }

  // Gating: every keystone must have a small on every path from entry
  for (const keystone of keystones) {
    if (!keystone.requires || keystone.requires.length === 0) {
      issues.push(`${ascendancyId}: keystone ${keystone.id} is not gated`)
    }
  }

  // No keystone adjacent to another keystone
  for (const keystone of keystones) {
    for (const req of keystone.requires ?? []) {
      const reqNode = nodeMap.get(req)
      if (reqNode && reqNode.type === 'keystone') {
        issues.push(`${ascendancyId}: keystone ${keystone.id} is adjacent to keystone ${req}`)
      }
    }
  }

  // Unknown stats / specials
  for (const node of nodes) {
    for (const stat of node.stats ?? []) {
      if (!statSet.has(stat.stat)) {
        issues.push(`${ascendancyId}: node ${node.id} has unknown stat ${stat.stat}`)
      }
      if (stat.mode === 'special' && !VALID_SPECIALS.has(stat.stat as StatKey)) {
        issues.push(`${ascendancyId}: node ${node.id} has unimplemented special ${stat.stat}`)
      }
    }
  }

  // Choice keystones must have choices
  for (const keystone of keystones) {
    if (keystone.id === 'herald_k1' || keystone.id === 'marsh_k3') {
      if (!keystone.choices || keystone.choices.length === 0) {
        issues.push(`${ascendancyId}: choice keystone ${keystone.id} has no choices`)
      }
    }
  }
}

function validate() {
  console.log('== Ascendancy Validation ==\n')
  for (const ascendancy of Object.values(ASCENDANCIES)) {
    validateWheel(ascendancy.id, ascendancy.nodes)
  }

  if (issues.length > 0) {
    console.log(`\n== ${issues.length} issue(s) found ==\n`)
    for (const issue of issues) {
      console.log(`  - ${issue}`)
    }
    process.exit(1)
  } else {
    console.log('\n== All ascendancies valid ==')
  }
}

validate()
