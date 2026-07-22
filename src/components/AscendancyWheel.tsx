import { useMemo, useState } from 'react'
import type { Ascendancy, AscendancyNode } from '../types/game.ts'

interface Props {
  ascendancy: Ascendancy
  allocatedNodes: string[]
  availablePoints: number
  onAllocate: (nodeId: string) => void
  onSetChoice?: (nodeId: string, choiceId: string) => void
  keystoneChoices?: Record<string, string>
}

const PALETTE: Record<string, { stroke: string; fill: string }> = {
  fateseer: { stroke: '#818cf8', fill: '#312e81' },
  herald: { stroke: '#fbbf24', fill: '#451a03' },
  contagion: { stroke: '#c084fc', fill: '#3b0764' },
  virulent: { stroke: '#4ade80', fill: '#064e3b' },
  vanguard: { stroke: '#f87171', fill: '#450a0a' },
  marshal: { stroke: '#fb923c', fill: '#431407' },
}

export function AscendancyWheel({ ascendancy, allocatedNodes, availablePoints, onAllocate, onSetChoice, keystoneChoices = {} }: Props) {
  const allocatedSet = useMemo(() => new Set(allocatedNodes), [allocatedNodes])
  const [hovered, setHovered] = useState<AscendancyNode | null>(null)
  const [picking, setPicking] = useState<AscendancyNode | null>(null)
  const [pickingSelections, setPickingSelections] = useState<string[]>([])
  const palette = PALETTE[ascendancy.id] ?? { stroke: '#d4a017', fill: '#15161d' }

  const canAllocate = (node: AscendancyNode) => {
    if (allocatedSet.has(node.id)) return false
    if (allocatedNodes.length >= availablePoints) return false
    if (node.requires && node.requires.some(req => !allocatedSet.has(req))) return false
    return true
  }

  const stateOf = (node: AscendancyNode) => {
    if (allocatedSet.has(node.id)) return 'allocated'
    if (canAllocate(node)) return 'allocatable'
    return 'locked'
  }

  const handleAllocate = (node: AscendancyNode) => {
    if (node.choices && node.choices.length > 0) {
      if (keystoneChoices[node.id]) {
        onAllocate(node.id)
      } else if (stateOf(node) === 'allocatable') {
        setPicking(node)
        setPickingSelections([])
      }
    } else {
      onAllocate(node.id)
    }
  }

  const edges: { from: AscendancyNode; to: AscendancyNode; allocated: boolean }[] = []
  for (const node of ascendancy.nodes) {
    if (node.requires) {
      for (const reqId of node.requires) {
        const req = ascendancy.nodes.find(n => n.id === reqId)
        if (req) {
          edges.push({ from: req, to: node, allocated: allocatedSet.has(req.id) && allocatedSet.has(node.id) })
        }
      }
    }
  }

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="bg-[#0b0c10] border border-[#2e303a] rounded-xl p-4 shadow-inner">
        <svg viewBox="0 0 400 340" className="w-full h-auto" style={{ maxHeight: 600 }}>
          <defs>
            <filter id="asc-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {edges.map((edge, idx) => (
            <line
              key={idx}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke={edge.allocated ? palette.stroke : '#2e303a'}
              strokeWidth={edge.allocated ? 3 : 2}
              strokeOpacity={edge.allocated ? 1 : 0.5}
            />
          ))}

          {/* Nodes */}
          {ascendancy.nodes.map(node => {
            const state = stateOf(node)
            const isChoice = !!node.choices && node.choices.length > 0
            const fill = state === 'allocated' ? palette.stroke : state === 'allocatable' ? palette.fill : '#0b0c10'
            const stroke = state === 'allocated' ? '#ffffff' : state === 'allocatable' ? palette.stroke : '#3e404a'
            const r = node.type === 'keystone' ? 18 : 12
            const isHex = node.type === 'keystone'
            const points = isHex ? hexagonPoints(node.x, node.y, r) : null
            return (
              <g key={node.id}>
                {points ? (
                  <polygon
                    points={points}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={state === 'allocated' ? 3 : 2}
                    filter={state === 'allocated' ? 'url(#asc-glow)' : undefined}
                    className={state === 'allocatable' ? 'cursor-pointer' : 'cursor-default'}
                    onMouseEnter={() => setHovered(node)}
                    onMouseLeave={() => setHovered(prev => (prev?.id === node.id ? null : prev))}
                    onClick={() => state === 'allocatable' && handleAllocate(node)}
                  />
                ) : (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={state === 'allocated' ? 3 : 2}
                    filter={state === 'allocated' ? 'url(#asc-glow)' : undefined}
                    className={state === 'allocatable' ? 'cursor-pointer' : 'cursor-default'}
                    onMouseEnter={() => setHovered(node)}
                    onMouseLeave={() => setHovered(prev => (prev?.id === node.id ? null : prev))}
                    onClick={() => state === 'allocatable' && handleAllocate(node)}
                  />
                )}
                {isChoice && keystoneChoices[node.id] && (
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#000" fontSize={10} fontWeight={600} pointerEvents="none">
                    ★
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {hovered && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#15161d] border border-[#d4a017] rounded-lg shadow-lg pointer-events-none z-10 max-w-xs text-center">
            <div className="text-sm font-serif text-[#d4a017]">{hovered.name}</div>
            <div className="text-xs text-gray-300 mt-1">{hovered.description}</div>
            <div className="text-[10px] text-gray-500 mt-1">
              {allocatedSet.has(hovered.id)
                ? 'Allocated'
                : canAllocate(hovered)
                  ? 'Click to allocate'
                  : 'Locked'}
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-sm text-gray-400 mt-3">
        Points allocated:{' '}
        <span className="text-[#d4a017]">
          {allocatedNodes.length} / {availablePoints}
        </span>
      </div>

      {picking && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#15161d] border border-[#2e303a] rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-serif text-[#d4a017] mb-2">{picking.name}</h3>
            <p className="text-sm text-gray-400 mb-4">{picking.description}</p>
            <div className="space-y-2">
              {picking.choices?.map(choice => {
                const selected = pickingSelections.includes(choice.id)
                const isMulti = (picking.maxChoices ?? 1) > 1
                return (
                  <button
                    key={choice.id}
                    onClick={() => {
                      if (!isMulti) {
                        onSetChoice?.(picking.id, choice.id)
                        setPicking(null)
                        onAllocate(picking.id)
                        return
                      }
                      setPickingSelections(prev => {
                        if (prev.includes(choice.id)) return prev.filter(id => id !== choice.id)
                        if (prev.length >= (picking.maxChoices ?? 2)) return prev
                        return [...prev, choice.id]
                      })
                    }}
                    className={[
                      'w-full text-left p-3 rounded border border-[#2e303a]',
                      selected ? 'bg-[#d4a017]/20 border-[#d4a017]' : 'bg-[#1f2028] hover:bg-[#2e303a]',
                    ].join(' ')}
                  >
                    <div className="text-sm text-gray-200 font-medium">{choice.name}</div>
                    <div className="text-xs text-gray-500">{choice.description}</div>
                  </button>
                )
              })}
            </div>
            {picking.maxChoices && picking.maxChoices > 1 && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    if (pickingSelections.length === (picking.maxChoices ?? 2)) {
                      onSetChoice?.(picking.id, pickingSelections.join(','))
                      setPicking(null)
                      onAllocate(picking.id)
                      setPickingSelections([])
                    }
                  }}
                  disabled={pickingSelections.length !== (picking.maxChoices ?? 2)}
                  className="flex-1 py-2 bg-[#d4a017] disabled:bg-[#2e303a] disabled:text-gray-500 rounded text-sm font-medium"
                >
                  Confirm ({pickingSelections.length}/{picking.maxChoices})
                </button>
                <button onClick={() => { setPicking(null); setPickingSelections([]) }} className="flex-1 py-2 bg-[#2e303a] rounded text-sm">Cancel</button>
              </div>
            )}
            {!(picking.maxChoices && picking.maxChoices > 1) && (
              <button onClick={() => { setPicking(null); setPickingSelections([]) }} className="mt-4 w-full py-2 bg-[#2e303a] rounded text-sm">Cancel</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function hexagonPoints(cx: number, cy: number, r: number): string {
  const points: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`)
  }
  return points.join(' ')
}
