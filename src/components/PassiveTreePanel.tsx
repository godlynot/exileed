import { useEffect, useMemo, useRef, useState } from 'react'
import type { PassiveNode as PassiveNodeType, PassiveTree, StatKey } from '../types/game.ts'
import { useGameStore } from '../store/gameStore.ts'

interface PassiveTreePanelProps {
  tree: PassiveTree
}

const NODE_RADIUS = {
  small: 14,
  notable: 26,
  keystone: 38,
  root: 30,
}

const PADDING = 80

function hexagonPoints(radius: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`
  }).join(' ')
}

function formatStat(mod: { stat: StatKey; value: number }): string {
  const sign = mod.value > 0 ? '+' : ''
  const pct = mod.stat.endsWith('_percent') ? '%' : ''
  return `${sign}${mod.value}${pct} ${mod.stat}`
}

interface Bounds {
  minX: number
  minY: number
  width: number
  height: number
}

export function PassiveTreePanel({ tree }: PassiveTreePanelProps) {
  const character = useGameStore(state => state.character)
  const allocateNode = useGameStore(state => state.allocateNode)
  const refundNode = useGameStore(state => state.refundNode)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ clientX: 0, clientY: 0, panX: 0, panY: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const allocatedSet = useMemo(() => new Set(character.allocatedNodes), [character.allocatedNodes])

  const adjacency = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const [a, b] of tree.edges) {
      if (!map.has(a)) map.set(a, [])
      if (!map.has(b)) map.set(b, [])
      map.get(a)!.push(b)
      map.get(b)!.push(a)
    }
    return map
  }, [tree.edges])

  const treeBounds = useMemo<Bounds>(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of tree.nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x)
      maxY = Math.max(maxY, node.y)
    }
    return {
      minX: minX - PADDING,
      minY: minY - PADDING,
      width: maxX - minX + PADDING * 2,
      height: maxY - minY + PADDING * 2,
    }
  }, [tree.nodes])

  const treeCenter = useMemo(
    () => ({ x: treeBounds.minX + treeBounds.width / 2, y: treeBounds.minY + treeBounds.height / 2 }),
    [treeBounds]
  )

  const fitToContainer = () => {
    const container = containerRef.current
    if (!container) return
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    setContainerSize({ width, height })
    setScale(1)
    setPan({ x: treeCenter.x, y: treeCenter.y })
  }

  useEffect(() => {
    fitToContainer()
    const observer = new ResizeObserver(() => fitToContainer())
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeCenter.x, treeCenter.y])

  const baseView = useMemo<Bounds>(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { ...treeBounds }
    }
    const containerAspect = containerSize.width / containerSize.height
    const treeAspect = treeBounds.width / treeBounds.height
    if (treeAspect >= containerAspect) {
      return {
        minX: treeBounds.minX,
        minY: treeBounds.minY,
        width: treeBounds.width,
        height: treeBounds.width / containerAspect,
      }
    }
    return {
      minX: treeBounds.minX,
      minY: treeBounds.minY,
      width: treeBounds.height * containerAspect,
      height: treeBounds.height,
    }
  }, [treeBounds, containerSize.width, containerSize.height])

  const viewBox = useMemo<Bounds>(() => {
    const width = baseView.width / scale
    const height = baseView.height / scale
    return {
      minX: pan.x - width / 2,
      minY: pan.y - height / 2,
      width,
      height,
    }
  }, [baseView, scale, pan])

  const canAllocate = (node: PassiveNodeType): boolean => {
    if (allocatedSet.has(node.id)) return false
    if (node.classRoot) return false
    if (character.passivePoints <= 0) return false
    const neighbours = adjacency.get(node.id) ?? []
    return neighbours.some(id => allocatedSet.has(id))
  }

  const allocatableSet = useMemo(() => {
    const set = new Set<string>()
    for (const node of tree.nodes) {
      if (canAllocate(node)) set.add(node.id)
    }
    return set
  }, [tree.nodes, allocatedSet, character.passivePoints])

  const shortestPath = useMemo(() => {
    if (!hoveredNode || allocatedSet.has(hoveredNode)) return [] as string[]
    const target = tree.nodes.find(n => n.id === hoveredNode)
    if (!target) return [] as string[]
    if (target.classRoot) return [] as string[]

    const queue: { id: string; path: string[] }[] = Array.from(allocatedSet).map(id => ({ id, path: [id] }))
    const visited = new Set<string>(Array.from(allocatedSet))
    let found: string[] | null = null

    while (queue.length > 0) {
      const current = queue.shift()!
      const neighbours = adjacency.get(current.id) ?? []
      for (const neighbour of neighbours) {
        if (visited.has(neighbour)) continue
        const nextPath = [...current.path, neighbour]
        if (neighbour === hoveredNode) {
          found = nextPath
          break
        }
        visited.add(neighbour)
        queue.push({ id: neighbour, path: nextPath })
      }
      if (found) break
    }

    return found ?? [] as string[]
  }, [hoveredNode, allocatedSet, adjacency])

  const pathSet = useMemo(() => new Set(shortestPath), [shortestPath])

  const searchMatches = useMemo(() => {
    if (!search.trim()) return new Set<string>()
    const term = search.toLowerCase()
    const matches = new Set<string>()
    for (const node of tree.nodes) {
      if (node.name.toLowerCase().includes(term)) {
        matches.add(node.id)
        continue
      }
      const statText = node.stats.map(s => `${s.stat} ${s.value}`).join(' ')
      if (statText.toLowerCase().includes(term)) {
        matches.add(node.id)
      }
    }
    return matches
  }, [search, tree.nodes])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setScale(prev => Math.max(0.4, Math.min(2.5, prev + delta)))
  }

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(false)
    setDragStart({ clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (e.buttons !== 1) return
    setDragging(true)
    const dx = e.clientX - dragStart.clientX
    const dy = e.clientY - dragStart.clientY
    const treeDx = dx * (viewBox.width / containerSize.width)
    const treeDy = dy * (viewBox.height / containerSize.height)
    setPan({ x: dragStart.panX + treeDx, y: dragStart.panY + treeDy })
  }

  const onMouseUp = () => setDragging(false)

  const handleNodeClick = (node: PassiveNodeType, shiftKey: boolean) => {
    if (dragging) return
    if (allocatedSet.has(node.id)) {
      setSelectedNode(node.id)
      return
    }
    if (!canAllocate(node)) return

    if (shiftKey) {
      const idsToAllocate = shortestPath.filter(id => !allocatedSet.has(id))
      if (idsToAllocate.length > character.passivePoints) return
      for (const id of idsToAllocate) {
        allocateNode(id)
      }
    } else {
      allocateNode(node.id)
    }
  }

  const resetView = () => fitToContainer()

  return (
    <div className="space-y-2 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-gray-400">
          Points: <span className="text-[#d4a017] font-medium">{character.passivePoints}</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="px-2 py-1 bg-[#15161d] border border-[#2e303a] rounded text-sm text-gray-200 focus:outline-none focus:border-[#d4a017]"
        />
        <button
          onClick={resetView}
          className="px-2 py-1 text-xs bg-[#2e303a] hover:bg-[#3e404a] rounded text-gray-300"
        >
          Reset View
        </button>
        <div className="text-xs text-gray-500">Scroll to zoom • Drag to pan • Shift-click path</div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 bg-[#0b0c10] border border-[#2e303a] rounded overflow-hidden cursor-move relative"
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg
          className="block w-full h-full"
          viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {tree.edges.map(([a, b]) => {
            const nodeA = tree.nodes.find(n => n.id === a)
            const nodeB = tree.nodes.find(n => n.id === b)
            if (!nodeA || !nodeB) return null
            const bothAllocated = allocatedSet.has(a) && allocatedSet.has(b)
            const isPath = pathSet.has(a) && pathSet.has(b)
            return (
              <line
                key={`${a}-${b}`}
                x1={nodeA.x}
                y1={nodeA.y}
                x2={nodeB.x}
                y2={nodeB.y}
                stroke={isPath ? '#f59e0b' : bothAllocated ? '#f0b020' : '#6b7280'}
                strokeWidth={isPath ? 3 : bothAllocated ? 2.5 : 1}
                opacity={bothAllocated || isPath ? 1 : 0.5}
              />
            )
          })}

          {/* Nodes */}
          {tree.nodes.map(node => {
            const isAllocated = allocatedSet.has(node.id)
            const allocatable = allocatableSet.has(node.id)
            const unreachable = !isAllocated && !allocatable && !node.classRoot
            const isMatch = searchMatches.has(node.id)
            const isPath = pathSet.has(node.id)
            const isHovered = hoveredNode === node.id
            const r = NODE_RADIUS[node.type] || 8

            let fillColor: string
            let strokeColor: string
            let strokeWidth: number
            let filter: string | undefined
            let opacity = 1

            if (isAllocated) {
              fillColor = '#f0b020'
              strokeColor = '#fff3c4'
              strokeWidth = isMatch ? 3 : 2
              filter = 'url(#glow)'
            } else if (allocatable) {
              fillColor = '#2e303a'
              strokeColor = isMatch ? '#f59e0b' : '#fbbf24'
              strokeWidth = isMatch ? 3 : 2
              filter = 'url(#glow)'
            } else {
              fillColor = isMatch ? '#9ca3af' : '#6b7280'
              strokeColor = isMatch ? '#e5e4e7' : '#9ca3af'
              strokeWidth = isMatch ? 2 : 1
              opacity = unreachable ? 0.3 : 0.75
            }

            const shape = node.type === 'keystone' ? (
              <polygon
                points={hexagonPoints(r + (isPath ? 4 : 0))}
                fill={fillColor}
                stroke={isPath ? '#f59e0b' : strokeColor}
                strokeWidth={isPath ? 3 : strokeWidth}
                opacity={opacity}
                filter={filter}
              />
            ) : (
              <circle
                r={r + (isPath ? 3 : 0)}
                fill={fillColor}
                stroke={isPath ? '#f59e0b' : strokeColor}
                strokeWidth={isPath ? 3 : strokeWidth}
                opacity={opacity}
                filter={filter}
              />
            )

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e: React.MouseEvent) => handleNodeClick(node, e.shiftKey)}
                style={{ cursor: 'pointer' }}
              >
                {shape}
                {allocatable && !isAllocated && (
                  <circle
                    r={r + 6}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={1}
                    opacity={0.5}
                    className="animate-pulse"
                  />
                )}
                {(isHovered || (selectedNode === node.id && node.type !== 'small')) && node.type !== 'small' && (
                  <text
                    x={r + 10}
                    y={4}
                    fontSize={12}
                    fill={isAllocated ? '#fde68a' : '#e5e4e7'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.name}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {hoveredNode && (() => {
          const node = tree.nodes.find(n => n.id === hoveredNode)
          if (!node) return null
          const cost = shortestPath.length - 1
          const showCost = !allocatedSet.has(node.id) && cost > 0
          return (
            <div className="absolute top-2 left-2 p-2 bg-[#15161d] border border-[#2e303a] rounded text-xs text-gray-200 pointer-events-none max-w-xs z-10">
              <div className="font-medium text-[#d4a017]">{node.name || 'Unnamed Node'}</div>
              <div className="text-gray-500 capitalize">{node.type}</div>
              {node.description && <div className="text-amber-400">{node.description}</div>}
              {node.stats.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {node.stats.map((stat, i) => (
                    <div key={i}>{formatStat(stat)}</div>
                  ))}
                </div>
              )}
              {showCost && <div className="mt-1 text-gray-400">Path cost: {cost} point{cost === 1 ? '' : 's'}</div>}
            </div>
          )
        })()}
      </div>

      {selectedNode && (
        <div className="p-3 bg-[#15161d] border border-[#2e303a] rounded text-sm">
          {(() => {
            const node = tree.nodes.find(n => n.id === selectedNode)
            if (!node) return null
            return (
              <div className="space-y-1">
                <div className="font-medium text-[#d4a017]">{node.name}</div>
                <div className="text-xs text-gray-400 capitalize">{node.type}</div>
                {node.description && <div className="text-xs text-amber-400">{node.description}</div>}
                {node.stats.length > 0 && (
                  <div className="text-xs text-gray-300 space-y-0.5">
                    {node.stats.map((s, i) => (
                      <div key={i}>{formatStat(s)}</div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  {!allocatedSet.has(node.id) && (
                    <button
                      onClick={() => allocateNode(node.id)}
                      disabled={!canAllocate(node) || character.passivePoints <= 0}
                      className="px-3 py-1 bg-[#d4a017] text-black rounded text-xs font-medium disabled:opacity-50"
                    >
                      Allocate
                    </button>
                  )}
                  {allocatedSet.has(node.id) && (
                    <button
                      onClick={() => refundNode(node.id)}
                      className="px-3 py-1 bg-red-900/50 text-red-200 border border-red-900/50 rounded text-xs"
                    >
                      Refund
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="px-3 py-1 bg-[#2e303a] rounded text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
