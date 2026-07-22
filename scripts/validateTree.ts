import { PASSIVE_TREE } from '../src/data/passiveTree.ts'
import { STAT_KEYS } from '../src/types/game.ts'
import type { PassiveNode } from '../src/types/game.ts'

const KNOWN_SPECIALS = new Set([
  'special:juggernauts_stance',
  'special:perfect_aim',
  'special:elemental_dominion',
  'special:iron_reservation',
  'special:zealots_creed',
  'special:vengeful_resolve',
])

const statSet = new Set<string>(STAT_KEYS)
const issues: string[] = []

function countByType(nodes: PassiveNode[], type: PassiveNode['type']) {
  return nodes.filter(n => n.type === type).length
}

function buildAdj(nodes: PassiveNode[], edges: [string, string][]) {
  const adj = new Map<string, string[]>()
  for (const node of nodes) {
    adj.set(node.id, [])
  }
  for (const [a, b] of edges) {
    adj.get(a)?.push(b)
    adj.get(b)?.push(a)
  }
  return adj
}

function bfsDist(start: string, adj: Map<string, string[]>) {
  const dist = new Map<string, number>()
  const queue: [string, number][] = [[start, 0]]
  dist.set(start, 0)
  while (queue.length > 0) {
    const [id, d] = queue.shift()!
    for (const n of adj.get(id) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, d + 1)
        queue.push([n, d + 1])
      }
    }
  }
  return dist
}

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

function validate() {
  const { nodes, edges } = PASSIVE_TREE

  console.log('== Rift Idler Passive Tree Validation ==\n')

  // 1. Counts
  const roots = countByType(nodes, 'root')
  const keystones = countByType(nodes, 'keystone')
  const notables = countByType(nodes, 'notable')
  const smalls = countByType(nodes, 'small')
  console.log(`Roots: ${roots} (expected 3)`)
  console.log(`Keystones: ${keystones} (expected 6)`)
  console.log(`Notables: ${notables} (expected 15)`)
  console.log(`Smalls: ${smalls} (expected 56)`)
  console.log(`Total: ${nodes.length} (expected 80)\n`)

  if (roots !== 3) issues.push(`Root count ${roots} != 3`)
  if (keystones !== 6) issues.push(`Keystone count ${keystones} != 6`)
  if (notables !== 15) issues.push(`Notable count ${notables} != 15`)
  if (smalls !== 56) issues.push(`Small count ${smalls} != 56`)
  if (nodes.length !== 80) issues.push(`Total node count ${nodes.length} != 80`)

  // 2. Unknown stats and specials
  for (const node of nodes) {
    for (const mod of node.stats) {
      if (!statSet.has(mod.stat)) {
        issues.push(`Unknown stat "${mod.stat}" on node ${node.id}`)
      }
      if (mod.mode === 'special' && !KNOWN_SPECIALS.has(mod.stat)) {
        issues.push(`Unknown special "${mod.stat}" on node ${node.id}`)
      }
    }
  }

  // 3. Edge validation
  const nodeIds = new Set(nodes.map(n => n.id))
  for (const [a, b] of edges) {
    if (!nodeIds.has(a)) issues.push(`Edge references unknown node ${a}`)
    if (!nodeIds.has(b)) issues.push(`Edge references unknown node ${b}`)
  }
  const seenEdges = new Set<string>()
  for (const [a, b] of edges) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seenEdges.has(key)) issues.push(`Duplicate edge ${key}`)
    seenEdges.add(key)
  }

  // 4. Connectivity / orphans
  const adj = buildAdj(nodes, edges)
  const classRoots = nodes.filter(n => n.type === 'root').map(n => n.id)
  const reachableFromRoots = new Set<string>()
  for (const root of classRoots) {
    const dists = bfsDist(root, adj)
    for (const id of dists.keys()) reachableFromRoots.add(id)
  }
  for (const node of nodes) {
    if (!reachableFromRoots.has(node.id)) {
      issues.push(`Orphaned node ${node.id} is not reachable from any class root`)
    }
  }

  // 5. Coordinate collisions
  const minDistance = 42
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = distance(nodes[i], nodes[j])
      if (d < minDistance) {
        issues.push(`Nodes ${nodes[i].id} and ${nodes[j].id} are too close (${d.toFixed(1)}px)`)
      }
    }
  }

  // 6. Shortest distances from each root
  console.log('== Distances from class roots ==\n')
  for (const root of classRoots) {
    const dists = bfsDist(root, adj)
    const targetNodes = nodes.filter(n => n.type === 'keystone' || n.type === 'notable')
    const rootName = nodes.find(n => n.id === root)?.name ?? root
    console.log(`From ${rootName}:`)
    for (const n of targetNodes) {
      const d = dists.get(n.id)
      console.log(`  ${n.name || n.id}: ${d === undefined ? 'unreachable' : d}`)
    }
    console.log('')
  }

  // 7. Equal root-to-nearest-hub-keystone distance
  const hubKeystones = nodes.filter(n => n.type === 'keystone' && !n.classRoot).map(n => n.id)
  console.log('== Root-to-nearest-hub-keystone distances ==\n')
  const nearestDistances: Record<string, number> = {}
  for (const root of classRoots) {
    const dists = bfsDist(root, adj)
    let nearest = Infinity
    for (const k of hubKeystones) {
      const d = dists.get(k)
      if (d !== undefined && d < nearest) nearest = d
    }
    nearestDistances[root] = nearest
    console.log(`  ${root}: ${nearest === Infinity ? 'unreachable' : nearest}`)
  }
  const uniqueDistances = new Set(Object.values(nearestDistances))
  if (uniqueDistances.size > 1) {
    issues.push(`Root-to-nearest-hub-keystone distances are not equal: ${JSON.stringify(nearestDistances)}`)
  }
  console.log('')

  // 8. Notable approach paths (nodes with >=2 neighbours)
  const notablesWithSinglePath: string[] = []
  for (const node of nodes) {
    if (node.type === 'notable') {
      const neighbours = adj.get(node.id) ?? []
      if (neighbours.length < 2) {
        notablesWithSinglePath.push(node.id)
      }
    }
  }
  if (notablesWithSinglePath.length > 0) {
    issues.push(`Notables with fewer than 2 approach paths: ${notablesWithSinglePath.join(', ')}`)
  }

  if (issues.length > 0) {
    console.log(`== ${issues.length} issue(s) found ==\n`)
    for (const issue of issues) {
      console.log(`  - ${issue}`)
    }
    process.exit(1)
  } else {
    console.log('== Validation passed ==')
  }
}

validate()
