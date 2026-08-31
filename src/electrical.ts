import {
  allCircuitTerminalIds,
  boardTerminalIds,
  breadboardInternalGroups,
  partTerminalNames,
  terminalId,
  type CircuitDesign,
  type CircuitPartInstance,
} from './circuit.ts'

export type UnoPinElectricalState = {
  pin: number
  output: boolean
  high: boolean
  pullup: boolean
}

export type ElectricalFault = {
  id: string
  severity: 'warning' | 'error'
  message: string
  partIds: string[]
  wireIds: string[]
}

export type ElectricalPartOutput = {
  voltage: number
  current: number
  on: boolean
  frequency: number
  angle: number
}

export type ElectricalSolveResult = {
  terminalVoltages: Record<string, number>
  partOutputs: Record<string, ElectricalPartOutput>
  digitalInputs: Record<number, boolean>
  analogVoltages: number[]
  faults: ElectricalFault[]
}

export type ElectricalTopology = {
  terminalToNet: Record<string, string>
  nets: Record<string, string[]>
  wireIdsByNet: Record<string, string[]>
}

class UnionFind {
  private parent = new Map<string, string>()

  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value)
  }

  find(value: string): string {
    this.add(value)
    const parent = this.parent.get(value) as string
    if (parent === value) return value
    const root = this.find(parent)
    this.parent.set(value, root)
    return root
  }

  union(a: string, b: string) {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parent.set(rootB, rootA)
  }
}

export function buildElectricalTopology(design: CircuitDesign): ElectricalTopology {
  const union = new UnionFind()
  const terminals = allCircuitTerminalIds(design)
  for (const terminal of terminals) union.add(terminal)
  union.union('uno:GND.1', 'uno:GND.2')
  union.union('uno:GND.2', 'uno:GND.3')
  for (const wire of design.wires) union.union(wire.from, wire.to)
  for (const part of design.parts) {
    if (part.type !== 'breadboard') continue
    for (const group of breadboardInternalGroups(part.instanceId)) {
      for (let index = 1; index < group.length; index += 1) union.union(group[0], group[index])
    }
  }

  const groupedByRoot = new Map<string, string[]>()
  for (const terminal of terminals) {
    const root = union.find(terminal)
    groupedByRoot.set(root, [...(groupedByRoot.get(root) || []), terminal])
  }
  const terminalToNet: Record<string, string> = {}
  const nets: Record<string, string[]> = {}
  for (const group of groupedByRoot.values()) {
    const sorted = [...group].sort()
    const netId = `net:${sorted[0]}`
    nets[netId] = sorted
    for (const terminal of sorted) terminalToNet[terminal] = netId
  }
  const wireIdsByNet: Record<string, string[]> = {}
  for (const wire of design.wires) {
    const netId = terminalToNet[wire.from]
    if (netId) wireIdsByNet[netId] = [...(wireIdsByNet[netId] || []), wire.wireId]
  }
  return { terminalToNet, nets, wireIdsByNet }
}

function solveLinear(matrix: number[][], vector: number[]) {
  const size = vector.length
  if (!size) return []
  const a = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row
    }
    if (pivot !== column) [a[column], a[pivot]] = [a[pivot], a[column]]
    if (Math.abs(a[column][column]) < 1e-12) a[column][column] = 1e-12
    const divisor = a[column][column]
    for (let index = column; index <= size; index += 1) a[column][index] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = a[row][column]
      if (!factor) continue
      for (let index = column; index <= size; index += 1) a[row][index] -= factor * a[column][index]
    }
  }
  return a.map((row) => Number.isFinite(row[size]) ? row[size] : 0)
}

type Source = {
  id: string
  positiveNet: string
  negativeNet: string
  voltage: number
  resistance: number
  currentLimit: number
  partId?: string
  label: string
}

type ResistorStamp = { a: string; b: string; resistance: number }
type DiodeStamp = { part: CircuitPartInstance; anode: string; cathode: string }

function boardTerminalForPin(pin: number) {
  return pin <= 13 ? `uno:D${pin}` : `uno:A${pin - 14}`
}

export function solveElectricalCircuit(design: CircuitDesign, pins: UnoPinElectricalState[]): ElectricalSolveResult {
  const topology = buildElectricalTopology(design)
  const net = (terminal: string) => topology.terminalToNet[terminal]
  const groundNet = net('uno:GND.1')
  const activeNets = new Set<string>([
    ...boardTerminalIds.map(net),
    ...design.wires.flatMap((wire) => [net(wire.from), net(wire.to)]),
    ...design.parts
      .filter((part) => part.type !== 'breadboard')
      .flatMap((part) => partTerminalNames(part.type).map((name) => net(terminalId(part.instanceId, name)))),
  ].filter(Boolean))
  const variableNets = [...activeNets].filter((netId) => netId !== groundNet)
  const netIndex = new Map(variableNets.map((netId, index) => [netId, index]))
  const size = variableNets.length
  const baseMatrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
  const baseVector = Array.from({ length: size }, () => 0)
  const sources: Source[] = []
  const resistors: ResistorStamp[] = []
  const diodes: DiodeStamp[] = []
  const faults: ElectricalFault[] = []
  const faultIds = new Set<string>()

  const addFault = (fault: ElectricalFault) => {
    if (faultIds.has(fault.id)) return
    faultIds.add(fault.id)
    faults.push(fault)
  }
  const wiresForNets = (...netIds: string[]) => [...new Set(netIds.flatMap((netId) => topology.wireIdsByNet[netId] || []))]
  const stampConductance = (matrix: number[][], a: string, b: string, conductance: number) => {
    if (!a || !b || a === b || !Number.isFinite(conductance)) return
    const indexA = netIndex.get(a)
    const indexB = netIndex.get(b)
    if (indexA !== undefined) matrix[indexA][indexA] += conductance
    if (indexB !== undefined) matrix[indexB][indexB] += conductance
    if (indexA !== undefined && indexB !== undefined) {
      matrix[indexA][indexB] -= conductance
      matrix[indexB][indexA] -= conductance
    }
  }
  const stampCurrent = (vector: number[], from: string, to: string, current: number) => {
    const fromIndex = netIndex.get(from)
    const toIndex = netIndex.get(to)
    if (fromIndex !== undefined) vector[fromIndex] -= current
    if (toIndex !== undefined) vector[toIndex] += current
  }
  const addResistor = (a: string, b: string, resistance: number) => {
    if (!a || !b) return
    const normalized = Math.max(0.01, resistance)
    resistors.push({ a, b, resistance: normalized })
    stampConductance(baseMatrix, a, b, 1 / normalized)
  }
  const addSource = (source: Source) => {
    sources.push(source)
    if (source.positiveNet === source.negativeNet) {
      addFault({
        id: `short-${source.id}`,
        severity: 'error',
        message: `${source.label} positive and negative terminals are shorted together.`,
        partIds: source.partId ? [source.partId] : [],
        wireIds: wiresForNets(source.positiveNet),
      })
      return
    }
    const resistance = Math.max(0.01, source.resistance)
    stampConductance(baseMatrix, source.positiveNet, source.negativeNet, 1 / resistance)
    stampCurrent(baseVector, source.negativeNet, source.positiveNet, source.voltage / resistance)
  }

  for (let index = 0; index < size; index += 1) baseMatrix[index][index] += 1e-9
  addSource({ id: 'uno-5v', positiveNet: net('uno:5V'), negativeNet: groundNet, voltage: 5, resistance: 0.05, currentLimit: 0.5, label: 'Arduino 5V supply' })
  addSource({ id: 'uno-3v3', positiveNet: net('uno:3.3V'), negativeNet: groundNet, voltage: 3.3, resistance: 0.1, currentLimit: 0.15, label: 'Arduino 3.3V supply' })

  for (const pin of pins) {
    const pinNet = net(boardTerminalForPin(pin.pin))
    if (!pinNet) continue
    if (pin.output) {
      addSource({
        id: `uno-pin-${pin.pin}`,
        positiveNet: pinNet,
        negativeNet: groundNet,
        voltage: pin.high ? 5 : 0,
        resistance: 25,
        currentLimit: 0.04,
        label: `Arduino pin ${pin.pin}`,
      })
    } else if (pin.pullup) {
      addResistor(pinNet, net('uno:5V'), 30_000)
    }
  }

  for (const part of design.parts) {
    const partNet = (name: string) => net(terminalId(part.instanceId, name))
    if (part.type === 'battery') {
      addSource({
        id: part.instanceId,
        positiveNet: partNet('+'),
        negativeNet: partNet('-'),
        voltage: Math.max(0, part.voltage),
        resistance: Math.max(0.1, part.internalResistance),
        currentLimit: 1,
        partId: part.instanceId,
        label: `${part.voltage}V battery`,
      })
    } else if (part.type === 'resistor') {
      addResistor(partNet('1'), partNet('2'), part.resistance)
    } else if (part.type === 'button' && part.pressed) {
      addResistor(partNet('1'), partNet('2'), 0.1)
    } else if (part.type === 'potentiometer' || part.type === 'photoresistor') {
      const ratio = Math.max(0, Math.min(1, part.value / 1023))
      const total = Math.max(100, part.resistance)
      addResistor(partNet('VCC'), partNet('SIG'), Math.max(1, total * (1 - ratio)))
      addResistor(partNet('SIG'), partNet('GND'), Math.max(1, total * ratio))
    } else if (part.type === 'led') {
      diodes.push({ part, anode: partNet('A'), cathode: partNet('K') })
    }
  }

  let solution = solveLinear(baseMatrix, baseVector)
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const matrix = baseMatrix.map((row) => [...row])
    const vector = [...baseVector]
    const voltageForNet = (netId: string) => netId === groundNet ? 0 : solution[netIndex.get(netId) ?? -1] || 0
    for (const diode of diodes) {
      const diodeVoltage = Math.max(-5, Math.min(3, voltageForNet(diode.anode) - voltageForNet(diode.cathode)))
      const saturationCurrent = 2e-11
      const thermalVoltage = 0.1
      const exponential = Math.exp(Math.min(30, diodeVoltage / thermalVoltage))
      const current = saturationCurrent * (exponential - 1)
      const conductance = Math.max(1e-10, (saturationCurrent / thermalVoltage) * exponential)
      const equivalentCurrent = current - conductance * diodeVoltage
      stampConductance(matrix, diode.anode, diode.cathode, conductance)
      stampCurrent(vector, diode.anode, diode.cathode, equivalentCurrent)
    }
    const next = solveLinear(matrix, vector)
    const difference = next.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - (solution[index] || 0))), 0)
    solution = next.map((value, index) => value * 0.7 + (solution[index] || 0) * 0.3)
    if (difference < 1e-5) break
  }

  const voltageForNet = (netId: string) => netId === groundNet ? 0 : solution[netIndex.get(netId) ?? -1] || 0
  const terminalVoltages: Record<string, number> = {}
  for (const [terminal, netId] of Object.entries(topology.terminalToNet)) terminalVoltages[terminal] = voltageForNet(netId)
  const partOutputs: Record<string, ElectricalPartOutput> = {}
  const voltageAt = (part: CircuitPartInstance, name: string) => terminalVoltages[terminalId(part.instanceId, name)] || 0

  for (const source of sources) {
    const deltaVoltage = voltageForNet(source.positiveNet) - voltageForNet(source.negativeNet)
    const current = source.positiveNet === source.negativeNet
      ? source.voltage / Math.max(0.01, source.resistance)
      : (source.voltage - deltaVoltage) / Math.max(0.01, source.resistance)
    if (Math.abs(current) > source.currentLimit) {
      addFault({
        id: `overcurrent-${source.id}`,
        severity: 'error',
        message: `${source.label} current is ${Math.round(Math.abs(current) * 1000)}mA, above its ${Math.round(source.currentLimit * 1000)}mA limit.`,
        partIds: source.partId ? [source.partId] : [],
        wireIds: wiresForNets(source.positiveNet, source.negativeNet),
      })
    }
    if (source.partId) {
      partOutputs[source.partId] = { voltage: deltaVoltage, current, on: Math.abs(current) > 0.001, frequency: 0, angle: 90 }
      if (current < -0.05) {
        addFault({
          id: `reverse-${source.id}`,
          severity: 'warning',
          message: `${source.label} is being driven backwards by another source. Check battery polarity.`,
          partIds: [source.partId],
          wireIds: wiresForNets(source.positiveNet, source.negativeNet),
        })
      }
    }
  }

  for (const part of design.parts) {
    if (partOutputs[part.instanceId]) continue
    let voltage = 0
    let current = 0
    if (part.type === 'led') {
      voltage = voltageAt(part, 'A') - voltageAt(part, 'K')
      current = 2e-11 * (Math.exp(Math.min(30, Math.max(-5, voltage) / 0.1)) - 1)
      if (current > 0.02) {
        addFault({
          id: `led-overcurrent-${part.instanceId}`,
          severity: current > 0.03 ? 'error' : 'warning',
          message: `${circuitLabel(part)} current is ${Math.round(current * 1000)}mA. Add or increase its series resistor.`,
          partIds: [part.instanceId],
          wireIds: wiresForNets(net(terminalId(part.instanceId, 'A')), net(terminalId(part.instanceId, 'K'))),
        })
      }
    } else if (part.type === 'resistor') {
      voltage = voltageAt(part, '1') - voltageAt(part, '2')
      current = voltage / Math.max(0.01, part.resistance)
      const power = current * current * part.resistance
      if (power > 0.25) {
        addFault({
          id: `resistor-power-${part.instanceId}`,
          severity: 'warning',
          message: `${circuitLabel(part)} dissipates ${power.toFixed(2)}W, above a typical 0.25W resistor rating.`,
          partIds: [part.instanceId],
          wireIds: wiresForNets(net(terminalId(part.instanceId, '1')), net(terminalId(part.instanceId, '2'))),
        })
      }
    } else if (part.type === 'button') {
      voltage = voltageAt(part, '1') - voltageAt(part, '2')
    } else if (part.type === 'potentiometer' || part.type === 'photoresistor') {
      voltage = voltageAt(part, 'SIG') - voltageAt(part, 'GND')
    } else if (part.type === 'ultrasonic') {
      voltage = voltageAt(part, 'VCC') - voltageAt(part, 'GND')
      if (Math.abs(voltage) > 0.2 && (voltage < 4.5 || voltage > 5.5)) {
        addFault({
          id: `ultrasonic-supply-${part.instanceId}`,
          severity: voltage < 0 || voltage > 5.5 ? 'error' : 'warning',
          message: `${circuitLabel(part)} supply is ${voltage.toFixed(1)}V; HC-SR04 requires a 5V supply with shared ground.`,
          partIds: [part.instanceId],
          wireIds: wiresForNets(net(terminalId(part.instanceId, 'VCC')), net(terminalId(part.instanceId, 'GND'))),
        })
      }
    } else if (part.type === 'buzzer') {
      voltage = voltageAt(part, '+') - voltageAt(part, '-')
    } else if (part.type === 'servo') {
      voltage = voltageAt(part, 'PWM') - voltageAt(part, 'GND')
      const supply = voltageAt(part, 'VCC') - voltageAt(part, 'GND')
      if (supply > 0 && (supply < 4.5 || supply > 6)) {
        addFault({
          id: `servo-supply-${part.instanceId}`,
          severity: 'warning',
          message: `${circuitLabel(part)} supply is ${supply.toFixed(1)}V; use a suitable 5V supply with shared ground.`,
          partIds: [part.instanceId],
          wireIds: wiresForNets(net(terminalId(part.instanceId, 'VCC'))),
        })
      }
    } else if (part.type === 'ws2812b') {
      voltage = voltageAt(part, 'DIN') - voltageAt(part, 'GND')
      const supply = voltageAt(part, 'VCC') - voltageAt(part, 'GND')
      const supplyNet = net(terminalId(part.instanceId, 'VCC'))
      if (Math.abs(supply) > 0.2 && (supply < 4.5 || supply > 5.5)) {
        addFault({
          id: `ws2812b-supply-${part.instanceId}`,
          severity: supply < 0 || supply > 5.5 ? 'error' : 'warning',
          message: `${circuitLabel(part)} supply is ${supply.toFixed(1)}V; WS2812B strips require a regulated 5V supply.`,
          partIds: [part.instanceId],
          wireIds: wiresForNets(supplyNet),
        })
      }
      const maximumCurrent = Math.max(1, Math.round(part.value)) * 0.06
      if (topology.nets[supplyNet]?.includes('uno:5V') && maximumCurrent > 0.4) {
        addFault({
          id: `ws2812b-current-${part.instanceId}`,
          severity: 'warning',
          message: `${circuitLabel(part)} may draw up to ${maximumCurrent.toFixed(1)}A at full white. Use a separate regulated 5V supply and share GND with the Uno.`,
          partIds: [part.instanceId],
          wireIds: wiresForNets(supplyNet),
        })
      }
    }
    partOutputs[part.instanceId] = { voltage, current, on: part.type === 'led' ? current > 0.0005 : Math.abs(voltage) > 2.5, frequency: 0, angle: 90 }
  }

  const digitalInputs: Record<number, boolean> = {}
  const analogVoltages = Array.from({ length: 6 }, () => 0)
  for (const pin of pins) {
    const terminal = boardTerminalForPin(pin.pin)
    const voltage = terminalVoltages[terminal] || 0
    if (!pin.output) digitalInputs[pin.pin] = voltage >= 2.5
    if (!pin.output && (voltage < -0.5 || voltage > 5.5)) {
      addFault({
        id: `pin-voltage-${pin.pin}`,
        severity: 'error',
        message: `Arduino pin ${pin.pin} is at ${voltage.toFixed(1)}V, outside the safe 0-5V range.`,
        partIds: [],
        wireIds: wiresForNets(net(terminal)),
      })
    }
    if (pin.pin >= 14) analogVoltages[pin.pin - 14] = Math.max(0, Math.min(5, voltage))
  }

  return { terminalVoltages, partOutputs, digitalInputs, analogVoltages, faults }
}

function circuitLabel(part: CircuitPartInstance) {
  const name = part.type === 'led' ? 'LED' : part.type === 'resistor' ? 'Resistor' : part.type === 'ws2812b' ? 'WS2812B strip' : part.type === 'ultrasonic' ? 'HC-SR04 sensor' : part.type
  return `${name} ${part.instanceId.split('-').at(-1)}`
}

export function connectedBoardTerminal(design: CircuitDesign, endpoint: string) {
  const topology = buildElectricalTopology(design)
  const netId = topology.terminalToNet[endpoint]
  if (!netId) return null
  return topology.nets[netId].find((terminal) => terminal.startsWith('uno:')) || null
}
