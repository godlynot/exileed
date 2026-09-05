// Stage 4 spatial: swarm-tagged monster templates.
//
// Swarm monsters (the spec's "swarm-tagged" packs — vermin, cloud-of-rats
// style enemies) engage in oversized packs of 4-8 instead of the normal
// 1-4. Data lives here so designers can tune the roster without touching
// combat logic; combat.ts checks membership via isSwarmTemplate.
export const SWARM_MONSTER_IDS: ReadonlySet<string> = new Set([
  'cinder_swarm',
  'crypt_rat',
])

export function isSwarmTemplate(id: string): boolean {
  return SWARM_MONSTER_IDS.has(id)
}
