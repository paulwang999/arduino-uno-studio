import type { ArduinoUnoElement } from '@wokwi/elements'
import { GripVertical, Maximize2, Minimize2, Palette, Plus, RotateCcw, Scan, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import {
  addCircuitPart,
  breadboardTerminalNames,
  circuitComponentNames,
  circuitPartSizes,
  createCircuitWire,
  partTerminalNames,
  removeCircuitPart,
  resetCircuitDesign,
  terminalId,
  updateCircuitPart,
  type CircuitDesign,
  type CircuitPartInstance,
  type CircuitWire,
  type Point,
} from '../circuit'
import { buildElectricalTopology } from '../electrical'
import type { SimulationState } from '../simulator/types'
import { ComponentCatalog } from './ComponentCatalog'

const minimumCanvasWidth = 430
const minimumCanvasHeight = 690
const unoOrigin = { x: 23, y: 24 }
const unoScale = 1.4
const digitalPinX = [255.5, 246, 236.5, 227, 217.5, 208, 198.5, 189, 173, 163, 153.5, 144, 134.5, 125]
const wireColorOptions = ['#ef615e', '#e54848', '#ee9b38', '#f2d54a', '#36c879', '#54b8df', '#8492ff', '#ef78c7', '#ffffff', '#30383d']

function digitalPinPoint(pin: number): Point {
  return { x: unoOrigin.x + digitalPinX[pin] * unoScale, y: unoOrigin.y + 9 * unoScale }
}

function analogPinPoint(pin: number): Point {
  return { x: unoOrigin.x + (208 + pin * 9.5) * unoScale, y: unoOrigin.y + 191.5 * unoScale }
}

function groundPinPoint(pin: string): Point {
  const rawPoint = pin === 'GND.1' ? { x: 115.5, y: 9 } : { x: pin === 'GND.2' ? 169.5 : 179, y: 191.5 }
  return { x: unoOrigin.x + rawPoint.x * unoScale, y: unoOrigin.y + rawPoint.y * unoScale }
}

function powerPinPoint(pin: string): Point {
  return { x: unoOrigin.x + (pin === '3.3V' ? 150 : 160) * unoScale, y: unoOrigin.y + 191.5 * unoScale }
}

function boardTerminalPoint(endpoint: string): Point | null {
  const digital = endpoint.match(/^uno:D(\d+)$/)
  if (digital) return digitalPinPoint(Number(digital[1]))
  const analog = endpoint.match(/^uno:A(\d+)$/)
  if (analog) return analogPinPoint(Number(analog[1]))
  const ground = endpoint.match(/^uno:(GND\.[123])$/)
  if (ground) return groundPinPoint(ground[1])
  const power = endpoint.match(/^uno:(3\.3V|5V)$/)
  if (power) return powerPinPoint(power[1])
  return null
}

function breadboardLocalPoint(name: string): Point {
  const columnMatch = name.match(/(\d+)$/)
  const column = Math.max(1, Math.min(30, Number(columnMatch?.[1] || 1)))
  const x = 17 + (column - 1) * 12.25
  const row = name[0]
  if (/^[a-j]$/.test(row)) {
    const index = row.charCodeAt(0) - 97
    return { x, y: index <= 4 ? 69 + index * 10 : 130 + (index - 5) * 10 }
  }
  if (name.startsWith('top+')) return { x, y: 35 }
  if (name.startsWith('top-')) return { x, y: 48 }
  if (name.startsWith('bottom+')) return { x, y: 198 }
  return { x, y: 211 }
}

function normalTerminalLocalPoint(part: CircuitPartInstance, name: string): Point {
  const width = circuitPartSizes[part.type].width
  if (part.type === 'resistor' || part.type === 'battery') return { x: name === '1' || name === '+' ? 8 : width - 8, y: 60 }
  if (part.type === 'ultrasonic') {
    const x = { VCC: 43, TRIG: 74, ECHO: 106, GND: 137 }[name] || 43
    return { x, y: 126 }
  }
  if (part.type === 'ws2812b') {
    if (name === 'DIN') return { x: 8, y: 75 }
    return { x: width - 8, y: name === 'VCC' ? 57 : 94 }
  }
  if (name === 'SIG' || name === 'PWM' || name === 'A' || name === '1' || name === '+') return { x: 8, y: 47 }
  if (name === 'VCC') return { x: width - 8, y: 46 }
  return { x: width - 8, y: 72 }
}

function partTerminalPoint(part: CircuitPartInstance, name: string): Point {
  const local = part.type === 'breadboard' ? breadboardLocalPoint(name) : normalTerminalLocalPoint(part, name)
  return { x: part.position.x + local.x, y: part.position.y + local.y }
}

function endpointPoint(design: CircuitDesign, endpoint: string): Point | null {
  const boardPoint = boardTerminalPoint(endpoint)
  if (boardPoint) return boardPoint
  const part = design.parts.find((item) => endpoint.startsWith(`${item.instanceId}:`))
  if (!part) return null
  return partTerminalPoint(part, endpoint.slice(part.instanceId.length + 1))
}

function wirePath(from: Point, to: Point, bendPoints: Point[]) {
  if (bendPoints.length) return `M ${from.x} ${from.y} ${bendPoints.map((point) => `L ${point.x} ${point.y}`).join(' ')} L ${to.x} ${to.y}`
  const middleY = from.y + (to.y - from.y) * 0.45
  return `M ${from.x} ${from.y} C ${from.x} ${middleY}, ${to.x} ${middleY}, ${to.x} ${to.y}`
}

function suggestedWireColor(endpoint: string) {
  if (endpoint.includes('GND') || endpoint.endsWith(':-') || endpoint.endsWith(':K')) return '#30383d'
  if (endpoint.includes('5V') || endpoint.includes('3.3V') || endpoint.endsWith(':+') || endpoint.endsWith(':VCC')) return '#e54848'
  return '#54b8df'
}

function endpointLabel(endpoint: string) {
  if (endpoint.startsWith('uno:')) return endpoint.replace('uno:', 'Uno ')
  const [partId, ...terminal] = endpoint.split(':')
  return `${partId} ${terminal.join(':')}`
}

function componentLabel(part: CircuitPartInstance, design: CircuitDesign) {
  const peers = design.parts.filter((item) => item.type === part.type)
  if (peers.length === 1) return circuitComponentNames[part.type]
  return `${circuitComponentNames[part.type]} ${peers.findIndex((item) => item.instanceId === part.instanceId) + 1}`
}

type CircuitCanvasProps = {
  design: CircuitDesign
  simulation: SimulationState
  running: boolean
  starting: boolean
  onDesignChange: (design: CircuitDesign) => void
  expanded: boolean
  onToggleExpand: () => void
}

export function CircuitCanvas({ design, simulation, running, starting, onDesignChange, expanded, onToggleExpand }: CircuitCanvasProps) {
  const [pendingEndpoint, setPendingEndpoint] = useState<string | null>(null)
  const [wirePointer, setWirePointer] = useState<Point | null>(null)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [canvasScale, setCanvasScale] = useState<number | null>(null)
  const [availableCanvasWidth, setAvailableCanvasWidth] = useState(minimumCanvasWidth)
  const [cameraZoom, setCameraZoom] = useState(1)
  const [cameraOffset, setCameraOffset] = useState<Point>({ x: 0, y: 0 })
  const [cameraPanning, setCameraPanning] = useState(false)
  const dragRef = useRef<{ instanceId: string; offsetX: number; offsetY: number } | null>(null)
  const cameraDragRef = useRef<{ pointerId: number; clientX: number; clientY: number; origin: Point } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const unoRef = useRef<ArduinoUnoElement | null>(null)
  const lowestPartEdge = design.parts.reduce((lowest, part) => Math.max(lowest, part.position.y + circuitPartSizes[part.type].height + 12), 0)
  const rightmostPartEdge = design.parts.reduce((rightmost, part) => Math.max(rightmost, part.position.x + circuitPartSizes[part.type].width + 12), minimumCanvasWidth)
  const canvasHeight = Math.max(minimumCanvasHeight, lowestPartEdge)
  const effectiveCanvasScale = canvasScale ?? 1
  const cameraScale = effectiveCanvasScale * cameraZoom
  const canvasWidth = Math.max(minimumCanvasWidth, rightmostPartEdge, Math.floor(availableCanvasWidth / effectiveCanvasScale))
  const selectedWire = design.wires.find((wire) => wire.wireId === selectedWireId)
  const pendingPoint = pendingEndpoint ? endpointPoint(design, pendingEndpoint) : null
  const topology = useMemo(() => buildElectricalTopology(design), [design])
  const selectedNetId = selectedWire ? topology.terminalToNet[selectedWire.from] : null
  const connectedTerminals = useMemo(() => new Set(design.wires.flatMap((wire) => [wire.from, wire.to])), [design.wires])
  const faultWireSeverity = useMemo(() => {
    const map = new Map<string, 'warning' | 'error'>()
    for (const fault of simulation.faults) {
      for (const wireId of fault.wireIds) {
        if (fault.severity === 'error' || !map.has(wireId)) map.set(wireId, fault.severity)
      }
    }
    return map
  }, [simulation.faults])

  useEffect(() => {
    if (unoRef.current) {
      unoRef.current.led13 = simulation.digitalPins[13]
      unoRef.current.ledPower = true
    }
  }, [simulation.digitalPins])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = Math.max(280, entry.contentRect.width - 14)
      setAvailableCanvasWidth(availableWidth)
      setCanvasScale((currentScale) => currentScale ?? Math.max(0.76, Math.min(1, availableWidth / minimumCanvasWidth)))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pendingEndpoint) return
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPendingEndpoint(null)
      setWirePointer(null)
    }
    window.addEventListener('keydown', cancelWithEscape)
    return () => window.removeEventListener('keydown', cancelWithEscape)
  }, [pendingEndpoint])

  function updatePart(instanceId: string, patch: Partial<CircuitPartInstance>) {
    onDesignChange(updateCircuitPart(design, instanceId, patch))
  }

  function handleEndpoint(endpoint: string) {
    setSelectedWireId(null)
    if (!pendingEndpoint) {
      const sourcePoint = endpointPoint(design, endpoint)
      setPendingEndpoint(endpoint)
      setWirePointer(sourcePoint ? {
        x: Math.max(0, Math.min(canvasWidth, sourcePoint.x + (sourcePoint.x > canvasWidth - 36 ? -24 : 24))),
        y: Math.max(0, Math.min(canvasHeight, sourcePoint.y + (sourcePoint.y > canvasHeight - 32 ? -18 : 18))),
      } : null)
      return
    }
    if (pendingEndpoint === endpoint) {
      setPendingEndpoint(null)
      setWirePointer(null)
      return
    }
    const duplicate = design.wires.some((wire) => (wire.from === pendingEndpoint && wire.to === endpoint) || (wire.from === endpoint && wire.to === pendingEndpoint))
    if (!duplicate) {
      const wire = createCircuitWire(design.wires, pendingEndpoint, endpoint, suggestedWireColor(pendingEndpoint))
      onDesignChange({ ...design, wires: [...design.wires, wire] })
      setSelectedWireId(wire.wireId)
    }
    setPendingEndpoint(null)
    setWirePointer(null)
  }

  function cancelPendingWire() {
    setPendingEndpoint(null)
    setWirePointer(null)
  }

  function beginDrag(event: ReactPointerEvent, part: CircuitPartInstance) {
    if (event.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    dragRef.current = {
      instanceId: part.instanceId,
      offsetX: (event.clientX - bounds.left) * (canvasWidth / bounds.width) - part.position.x,
      offsetY: (event.clientY - bounds.top) * (canvasHeight / bounds.height) - part.position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function zoomCircuit(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const nextZoom = Math.max(0.4, Math.min(2.5, cameraZoom * Math.exp(-event.deltaY * 0.0015)))
    if (nextZoom === cameraZoom) return
    const ratio = nextZoom / cameraZoom
    setCameraOffset((current) => ({
      x: pointer.x - (pointer.x - current.x) * ratio,
      y: pointer.y - (pointer.y - current.y) * ratio,
    }))
    setCameraZoom(nextZoom)
  }

  function beginCameraPan(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const interactiveTarget = target.closest('[data-component], [data-terminal-id], .wire-hit, button, input, label, .wokwi-uno-board')
    if (event.button !== 1 && (event.button !== 0 || interactiveTarget)) return
    event.preventDefault()
    cameraDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      origin: cameraOffset,
    }
    setCameraPanning(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic test events and some middle-button drivers do not expose capture.
    }
  }

  function moveCamera(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cameraDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setCameraOffset({
      x: drag.origin.x + event.clientX - drag.clientX,
      y: drag.origin.y + event.clientY - drag.clientY,
    })
  }

  function endCameraPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (cameraDragRef.current?.pointerId !== event.pointerId) return
    cameraDragRef.current = null
    setCameraPanning(false)
  }

  function resetCamera() {
    setCameraZoom(1)
    setCameraOffset({ x: 0, y: 0 })
  }

  function movePart(event: ReactPointerEvent) {
    const drag = dragRef.current
    const canvas = canvasRef.current
    const part = design.parts.find((item) => item.instanceId === drag?.instanceId)
    if (!drag || !canvas || !part) return
    const bounds = canvas.getBoundingClientRect()
    const size = circuitPartSizes[part.type]
    const x = Math.max(4, Math.min(canvasWidth - size.width - 4, (event.clientX - bounds.left) * (canvasWidth / bounds.width) - drag.offsetX))
    const y = Math.max(325, Math.min(canvasHeight - size.height - 5, (event.clientY - bounds.top) * (canvasHeight / bounds.height) - drag.offsetY))
    updatePart(part.instanceId, { position: { x, y } })
  }

  function handleCanvasPointerMove(event: ReactPointerEvent) {
    movePart(event)
    if (!pendingEndpoint || dragRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    setWirePointer({
      x: Math.max(0, Math.min(canvasWidth, (event.clientX - bounds.left) * (canvasWidth / bounds.width))),
      y: Math.max(0, Math.min(canvasHeight, (event.clientY - bounds.top) * (canvasHeight / bounds.height))),
    })
  }

  function updateSelectedWire(patch: Partial<CircuitWire>) {
    if (!selectedWireId) return
    onDesignChange({ ...design, wires: design.wires.map((wire) => wire.wireId === selectedWireId ? { ...wire, ...patch } : wire) })
  }

  function deleteSelectedWire() {
    if (!selectedWireId) return
    onDesignChange({ ...design, wires: design.wires.filter((wire) => wire.wireId !== selectedWireId) })
    setSelectedWireId(null)
  }

  const faultCount = simulation.faults.length
  return (
    <div className={`circuit-view ${selectedWire ? 'editing-wire' : ''} ${pendingEndpoint ? 'drawing-wire' : ''}`}>
      <div className="circuit-toolbar">
        <span className={faultCount ? 'fault' : running ? 'live' : starting ? 'starting' : ''} />
        <strong>{pendingEndpoint
          ? `CONNECT FROM ${endpointLabel(pendingEndpoint).toUpperCase()} · SELECT ANY TERMINAL`
          : starting
            ? 'STARTING SIMULATOR'
            : running
              ? `RUNNING · ${simulation.virtualMillis.toLocaleString()} ms${faultCount ? ` · ${faultCount} FAULT${faultCount === 1 ? '' : 'S'}` : ''}`
              : `CIRCUIT · STOPPED${faultCount ? ` · ${faultCount} FAULT${faultCount === 1 ? '' : 'S'}` : ''}`}</strong>
        <div className="circuit-toolbar-actions">
          {pendingEndpoint && <button type="button" title="Cancel wire (Esc)" onClick={cancelPendingWire}><X /></button>}
          <button className="add-component-button" type="button" title="Add component" onClick={() => { cancelPendingWire(); setCatalogOpen(true) }}><Plus /></button>
          <button type="button" title="Reset view" onClick={resetCamera}><Scan /></button>
          <button type="button" title="Reset circuit" onClick={() => { cancelPendingWire(); setSelectedWireId(null); onDesignChange(resetCircuitDesign(design)) }}><RotateCcw /></button>
          <button type="button" title={expanded ? 'Restore workspace' : 'Maximize circuit'} onClick={onToggleExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>
        </div>
      </div>

      <div
        className={`circuit-stage ${cameraPanning ? 'camera-panning' : ''}`}
        ref={stageRef}
        data-camera-zoom={cameraZoom.toFixed(3)}
        onWheel={zoomCircuit}
        onPointerDown={beginCameraPan}
        onPointerMove={moveCamera}
        onPointerUp={endCameraPan}
        onPointerCancel={endCameraPan}
        onAuxClick={(event) => {
          if (event.button === 1) event.preventDefault()
        }}
      >
        <div
          className="circuit-canvas-sizer"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `translate(${cameraOffset.x}px, ${cameraOffset.y}px) scale(${cameraScale})`,
          }}
        >
          <div
            className="circuit-canvas"
            ref={canvasRef}
            data-canvas-scale={cameraScale.toFixed(3)}
            style={{ width: `${canvasWidth}px`, minWidth: `${canvasWidth}px`, height: `${canvasHeight}px`, minHeight: `${canvasHeight}px`, flexBasis: `${canvasWidth}px` }}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={() => { dragRef.current = null }}
            onPointerCancel={() => { dragRef.current = null }}
            onContextMenu={(event) => {
              if (!pendingEndpoint) return
              event.preventDefault()
              cancelPendingWire()
            }}
          >
          <svg className="wire-layer wire-hit-layer" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }} aria-label="Circuit wire controls">
            {design.wires.map((wire) => {
              const from = endpointPoint(design, wire.from)
              const to = endpointPoint(design, wire.to)
              if (!from || !to) return null
              const path = wirePath(from, to, wire.bendPoints)
              const netId = topology.terminalToNet[wire.from]
              return <path
                key={wire.wireId}
                className="wire-hit"
                d={path}
                data-wire-id={wire.wireId}
                data-wire-from={wire.from}
                data-wire-to={wire.to}
                data-net-id={netId}
                role="button"
                tabIndex={0}
                aria-label={`Edit wire from ${endpointLabel(wire.from)} to ${endpointLabel(wire.to)}`}
                onClick={() => { setPendingEndpoint(null); setSelectedWireId(wire.wireId) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setPendingEndpoint(null)
                    setSelectedWireId(wire.wireId)
                  }
                }}
              />
            })}
          </svg>

          <svg className="wire-layer wire-visible-layer" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }} aria-label="Visible circuit wires">
            {design.wires.map((wire) => {
              const from = endpointPoint(design, wire.from)
              const to = endpointPoint(design, wire.to)
              if (!from || !to) return null
              const severity = faultWireSeverity.get(wire.wireId)
              const netId = topology.terminalToNet[wire.from]
              return <path
                key={wire.wireId}
                className={`wire-visible ${selectedWireId === wire.wireId ? 'selected' : ''} ${selectedNetId && netId === selectedNetId ? 'same-net' : ''} ${severity || ''}`}
                d={wirePath(from, to, wire.bendPoints)}
                data-wire-color-for={wire.wireId}
                stroke={wire.color}
              />
            })}
            {pendingEndpoint && pendingPoint && wirePointer && <g className="wire-preview-group" aria-hidden="true">
              <path className="wire-preview-glow" d={wirePath(pendingPoint, wirePointer, [])} />
              <path
                className="wire-preview"
                d={wirePath(pendingPoint, wirePointer, [])}
                data-wire-preview-from={pendingEndpoint}
              />
              <circle className="wire-preview-target" cx={wirePointer.x} cy={wirePointer.y} r="4" />
            </g>}
          </svg>

          <wokwi-arduino-uno ref={unoRef} className="wokwi-uno-board" />
          <BoardTerminals pending={pendingEndpoint} connected={connectedTerminals} simulation={simulation} onSelect={handleEndpoint} />

          {design.parts.map((part) => <CircuitPart
            key={part.instanceId}
            part={part}
            design={design}
            topology={topology}
            simulation={simulation}
            running={running}
            pending={pendingEndpoint}
            connected={connectedTerminals}
            onTerminal={handleEndpoint}
            onChange={(patch) => updatePart(part.instanceId, patch)}
            onRemove={() => {
              setPendingEndpoint(null)
              setSelectedWireId(null)
              onDesignChange(removeCircuitPart(design, part.instanceId))
            }}
            onDrag={(event) => beginDrag(event, part)}
          />)}
          </div>
        </div>
      </div>

      {selectedWire && <div className="wire-properties" aria-label="Wire properties">
        <div className="wire-properties-heading">
          <span>{`${endpointLabel(selectedWire.from)} → ${endpointLabel(selectedWire.to)}`}</span>
          <div>
            <button type="button" title="Delete wire" onClick={deleteSelectedWire}><Trash2 /></button>
            <button type="button" title="Close wire editor" onClick={() => setSelectedWireId(null)}><X /></button>
          </div>
        </div>
        <div className="wire-color-controls">
          {wireColorOptions.map((color) => <button
            type="button"
            key={color}
            className={selectedWire.color.toLowerCase() === color ? 'selected' : ''}
            data-wire-color={color}
            style={{ backgroundColor: color }}
            title={`Set wire color to ${color}`}
            aria-label={`Set wire color to ${color}`}
            onClick={() => updateSelectedWire({ color })}
          />)}
          <label className="custom-wire-color" title="Choose a custom wire color"><Palette /><input type="color" value={selectedWire.color} aria-label="Custom wire color" onChange={(event) => updateSelectedWire({ color: event.target.value })} /></label>
        </div>
      </div>}

      {simulation.faults.length > 0 && <div className="circuit-faults" aria-label="Electrical faults">
        {simulation.faults.slice(0, 4).map((fault) => <p className={fault.severity} key={fault.id}><strong>{fault.severity}</strong>{fault.message}</p>)}
      </div>}

      {catalogOpen && <>
        <button className="component-catalog-backdrop" type="button" aria-label="Close component catalog" onClick={() => setCatalogOpen(false)} />
        <ComponentCatalog
          components={design.parts}
          onAdd={(type) => { onDesignChange(addCircuitPart(design, type)); setCatalogOpen(false) }}
          onClose={() => setCatalogOpen(false)}
        />
      </>}
    </div>
  )
}

type BoardTerminalsProps = {
  pending: string | null
  connected: Set<string>
  simulation: SimulationState
  onSelect: (endpoint: string) => void
}

function BoardTerminals({ pending, connected, simulation, onSelect }: BoardTerminalsProps) {
  return <>
    <div className="circuit-digital-pins" aria-label="Arduino digital pins">
      {Array.from({ length: 14 }, (_, pin) => {
        const endpoint = `uno:D${pin}`
        return <TerminalButton key={endpoint} endpoint={endpoint} point={digitalPinPoint(pin)} pending={pending} connected={connected} high={simulation.digitalPins[pin]} onSelect={onSelect} />
      })}
    </div>
    <div className="circuit-analog-pins" aria-label="Arduino analog pins">
      {Array.from({ length: 6 }, (_, pin) => {
        const endpoint = `uno:A${pin}`
        return <TerminalButton key={endpoint} endpoint={endpoint} point={analogPinPoint(pin)} pending={pending} connected={connected} onSelect={onSelect} />
      })}
    </div>
    <div className="circuit-power-pins" aria-label="Arduino power pins">
      {['GND.1', 'GND.2', 'GND.3'].map((name) => {
        const endpoint = `uno:${name}`
        return <TerminalButton key={endpoint} endpoint={endpoint} point={groundPinPoint(name)} pending={pending} connected={connected} onSelect={onSelect} />
      })}
      {['3.3V', '5V'].map((name) => {
        const endpoint = `uno:${name}`
        return <TerminalButton key={endpoint} endpoint={endpoint} point={powerPinPoint(name)} pending={pending} connected={connected} high onSelect={onSelect} />
      })}
    </div>
  </>
}

function TerminalButton({ endpoint, point, pending, connected, high = false, onSelect }: { endpoint: string; point: Point; pending: string | null; connected: Set<string>; high?: boolean; onSelect: (endpoint: string) => void }) {
  return <button
    type="button"
    className={`${pending ? 'connectable' : ''} ${pending === endpoint ? 'terminal-pending' : ''} ${connected.has(endpoint) ? 'terminal-connected' : ''}`}
    data-board-pin={endpoint.replace('uno:', '')}
    data-terminal-id={endpoint}
    style={{ left: `${point.x - 7}px`, top: `${point.y - 7}px` }}
    title={`${pending ? 'Connect to' : 'Start wire from'} ${endpointLabel(endpoint)}`}
    onClick={() => onSelect(endpoint)}
  ><span className={high ? 'high' : ''} /></button>
}

type CircuitPartProps = {
  part: CircuitPartInstance
  design: CircuitDesign
  topology: ReturnType<typeof buildElectricalTopology>
  simulation: SimulationState
  running: boolean
  pending: string | null
  connected: Set<string>
  onTerminal: (endpoint: string) => void
  onChange: (patch: Partial<CircuitPartInstance>) => void
  onRemove: () => void
  onDrag: (event: ReactPointerEvent) => void
}

function CircuitPart({ part, design, topology, simulation, running, pending, connected, onTerminal, onChange, onRemove, onDrag }: CircuitPartProps) {
  const label = componentLabel(part, design)
  const output = simulation.partOutputs[part.instanceId]
  const ws2812Supply = (simulation.terminalVoltages[terminalId(part.instanceId, 'VCC')] || 0) - (simulation.terminalVoltages[terminalId(part.instanceId, 'GND')] || 0)
  const ws2812Powered = ws2812Supply >= 3.5 && ws2812Supply <= 5.5
  const ws2812Count = Math.max(1, Math.min(60, Math.round(part.value)))
  const ws2812Colors = Array.from({ length: ws2812Count }, (_, index) => simulation.ws2812Colors[part.instanceId]?.[index] || '#000000')
  const terminalNames = part.type === 'breadboard' ? breadboardTerminalNames() : partTerminalNames(part.type)
  const faulted = simulation.faults.some((fault) => fault.partIds.includes(part.instanceId))
  const netCount = new Set(terminalNames.map((name) => topology.terminalToNet[terminalId(part.instanceId, name)])).size
  return <section
    data-component={part.type}
    data-component-id={part.instanceId}
    className={`circuit-node component-${part.type} ${faulted ? 'component-fault' : ''}`}
    style={{ left: part.position.x, top: part.position.y, width: circuitPartSizes[part.type].width, height: circuitPartSizes[part.type].height }}
  >
    <div className="circuit-node-heading" onPointerDown={onDrag}>
      <GripVertical /><span>{label}</span>
      {part.type === 'breadboard' && <small>{netCount} nets</small>}
      <button type="button" title={`Remove ${label}`} onPointerDown={(event) => event.stopPropagation()} onClick={onRemove}><X /></button>
    </div>
    {part.type === 'breadboard' && <BreadboardMarkings />}
    {terminalNames.map((name) => {
      const endpoint = terminalId(part.instanceId, name)
      const local = part.type === 'breadboard' ? breadboardLocalPoint(name) : normalTerminalLocalPoint(part, name)
      return <button
        type="button"
        key={name}
        className={`free-terminal ${part.type === 'breadboard' ? 'breadboard-hole' : ''} ${pending ? 'connectable' : ''} ${pending === endpoint ? 'terminal-pending' : ''} ${connected.has(endpoint) ? 'terminal-connected' : ''}`}
        data-terminal-id={endpoint}
        style={{ left: local.x - (part.type === 'breadboard' ? 5 : 6), top: local.y - (part.type === 'breadboard' ? 5 : 6) }}
        title={`${pending ? 'Connect to' : 'Start wire from'} ${label} ${name}`}
        onClick={() => onTerminal(endpoint)}
      ><i /><b>{part.type === 'breadboard' ? '' : name}</b></button>
    })}
    {part.type !== 'breadboard' && <div className="circuit-node-body">
      {part.type === 'led' && <><span className={`circuit-led-visual ${output?.on ? 'on' : ''}`} /><strong>{output?.on ? `${Math.round(output.current * 1000)}mA` : 'OFF'}</strong></>}
      {part.type === 'button' && <><button className={`circuit-button-visual ${part.pressed ? 'pressed' : ''}`} type="button" onPointerDown={(event) => { event.stopPropagation(); onChange({ pressed: true }) }} onPointerUp={() => onChange({ pressed: false })} onPointerLeave={() => onChange({ pressed: false })}><span /></button><strong>{part.pressed ? 'CLOSED' : 'OPEN'}</strong></>}
      {(part.type === 'potentiometer' || part.type === 'photoresistor') && <><input type="range" min="0" max="1023" value={part.value} aria-label={`${label} value`} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onChange({ value: Number(event.target.value) })} /><strong>{running ? `${(output?.voltage || 0).toFixed(2)}V` : part.value}</strong></>}
      {part.type === 'ultrasonic' && <><span className={`circuit-ultrasonic-visual ${output?.on ? 'powered' : ''}`}><wokwi-hc-sr04 /></span><input type="range" min="2" max="400" value={part.value} aria-label={`${label} distance in centimeters`} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onChange({ value: Math.max(2, Math.min(400, Number(event.target.value))) })} /><strong>{part.value} cm</strong></>}
      {part.type === 'buzzer' && <><span className={`circuit-buzzer-visual ${output?.frequency ? 'sounding' : ''}`} /><strong>{output?.frequency ? `${output.frequency} Hz` : 'OFF'}</strong></>}
      {part.type === 'servo' && <><span className="circuit-servo-visual"><i style={{ transform: `rotate(${(output?.angle || 90) - 90}deg)` }} /></span><strong>{output?.angle || 90}°</strong></>}
      {part.type === 'ws2812b' && <><span className="circuit-ws2812b-visual">{ws2812Colors.map((color, index) => <i key={index} style={{ backgroundColor: ws2812Powered ? color : '#15191c', boxShadow: ws2812Powered && color !== '#000000' ? `0 0 7px ${color}` : 'none' }} />)}</span><label className="part-number ws2812b-count"><input type="number" min="1" max="60" value={part.value} aria-label={`${label} LED count`} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onChange({ value: Math.max(1, Math.min(60, Number(event.target.value) || 1)) })} /><span>LEDs</span></label></>}
      {part.type === 'resistor' && <><span className="circuit-resistor-visual"><i /><i /><i /><i /></span><label className="part-number"><input type="number" min="1" max="10000000" value={part.resistance} aria-label={`${label} resistance`} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onChange({ resistance: Math.max(1, Number(event.target.value)) })} /><span>Ω</span></label></>}
      {part.type === 'battery' && <><span className="circuit-battery-visual"><i /><b>{part.voltage}V</b></span><label className="part-number"><input type="number" min="0.5" max="24" step="0.5" value={part.voltage} aria-label={`${label} voltage`} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onChange({ voltage: Math.max(0.5, Number(event.target.value)) })} /><span>V</span></label></>}
    </div>}
  </section>
}

function BreadboardMarkings() {
  return <div className="breadboard-markings" aria-hidden="true">
    <span className="rail top positive" /><span className="rail top negative" />
    <span className="rail bottom positive" /><span className="rail bottom negative" />
    <span className="breadboard-groove" />
    <b className="plus top">+</b><b className="minus top">−</b><b className="plus bottom">+</b><b className="minus bottom">−</b>
  </div>
}
