/// <reference lib="webworker" />

import {
  adcConfig,
  avrInstruction,
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js'
import { terminalId, type CircuitDesign, type CircuitPartInstance } from '../circuit'
import { buildElectricalTopology, solveElectricalCircuit, type ElectricalSolveResult, type UnoPinElectricalState } from '../electrical'
import { loadIntelHex } from './intelHex'
import type { SimulationState, WorkerCommand, WorkerEvent } from './types'
import { UltrasonicPulseScheduler, type UltrasonicConnection } from './ultrasonic'
import { Ws2812Decoder } from './ws2812'

const SPEED_HZ = 16_000_000
const BATCH_CYCLES = 120_000
const BATCH_DURATION_MS = (BATCH_CYCLES / SPEED_HZ) * 1000
const worker = self as DedicatedWorkerGlobalScope

const blankElectricalResult: ElectricalSolveResult = {
  terminalVoltages: {},
  partOutputs: {},
  digitalInputs: {},
  analogVoltages: Array.from({ length: 6 }, () => 0),
  faults: [],
}

class UnoSimulation {
  readonly program = new Uint16Array(0x8000)
  readonly cpu: CPU
  readonly portB: AVRIOPort
  readonly portC: AVRIOPort
  readonly portD: AVRIOPort
  readonly adc: AVRADC
  readonly usart: AVRUSART
  private digitalPins = Array.from({ length: 20 }, () => false)
  private analogValues = Array.from({ length: 6 }, () => 0)
  private design: CircuitDesign
  private electricalResult = blankElectricalResult
  private syncingCircuit = false
  private serialBuffer = ''
  private partHigh = new Map<string, boolean>()
  private buzzerRisingCycle = new Map<string, number>()
  private buzzerFrequency = new Map<string, number>()
  private servoHighCycle = new Map<string, number>()
  private servoAngle = new Map<string, number>()
  private ultrasonicConnections = new Map<string, UltrasonicConnection>()
  private ultrasonicPulses = new UltrasonicPulseScheduler(SPEED_HZ)
  private ws2812PinByPart = new Map<string, number>()
  private ws2812DataPins = new Set<number>()
  private ws2812Decoders = new Map<string, Ws2812Decoder>()

  constructor(hex: string, design: CircuitDesign) {
    loadIntelHex(hex, new Uint8Array(this.program.buffer))
    this.cpu = new CPU(this.program)
    new AVRTimer(this.cpu, timer0Config)
    new AVRTimer(this.cpu, timer1Config)
    new AVRTimer(this.cpu, timer2Config)
    this.portB = new AVRIOPort(this.cpu, portBConfig)
    this.portC = new AVRIOPort(this.cpu, portCConfig)
    this.portD = new AVRIOPort(this.cpu, portDConfig)
    this.adc = new AVRADC(this.cpu, adcConfig)
    this.usart = new AVRUSART(this.cpu, usart0Config, SPEED_HZ)
    this.design = design

    this.refreshWs2812Connections()
    this.refreshUltrasonicConnections()
    this.portB.addListener(() => this.handlePortUpdate(this.portB, 8, 6))
    this.portC.addListener(() => this.handlePortUpdate(this.portC, 14, 6))
    this.portD.addListener(() => this.handlePortUpdate(this.portD, 0, 8))
    this.usart.onByteTransmit = (value) => {
      this.serialBuffer += String.fromCharCode(value)
    }
    this.updateAllPins()
    this.syncCircuit()
  }

  private updateAllPins() {
    this.updatePins(this.portD, 0, 8)
    this.updatePins(this.portB, 8, 6)
    this.updatePins(this.portC, 14, 6)
  }

  private updatePins(port: AVRIOPort, offset: number, count: number) {
    const changed: number[] = []
    for (let bit = 0; bit < count; bit += 1) {
      const pin = offset + bit
      const high = port.pinState(bit) === PinState.High
      if (high !== this.digitalPins[pin]) changed.push(pin)
      this.digitalPins[pin] = high
    }
    return changed
  }

  private handlePortUpdate(port: AVRIOPort, offset: number, count: number) {
    const changedPins = this.updatePins(port, offset, count)
    if (changedPins.length) {
      const changed = new Set(changedPins)
      for (const [partId, connection] of this.ultrasonicConnections) {
        if (!changed.has(connection.triggerPin)) continue
        const part = this.design.parts.find((candidate) => candidate.instanceId === partId)
        if (!part) continue
        this.ultrasonicPulses.triggerEdge(
          partId,
          this.digitalPins[connection.triggerPin],
          this.cpu.cycles,
          part.value,
          this.ultrasonicPowered(partId),
        )
      }
      for (const [partId, pin] of this.ws2812PinByPart) {
        if (changed.has(pin)) this.ws2812Decoders.get(partId)?.edge(this.cpu.cycles, this.digitalPins[pin])
      }
    }
    const onlyLedStripDataChanged = changedPins.length > 0 && changedPins.every((pin) => this.ws2812DataPins.has(pin))
    if (!onlyLedStripDataChanged) this.syncCircuit()
  }

  private boardPinOnNet(topology: ReturnType<typeof buildElectricalTopology>, netId: string) {
    const boardTerminal = topology.nets[netId]?.find((terminal) => /^uno:D\d+$/.test(terminal))
    return boardTerminal ? Number(boardTerminal.slice(5)) : null
  }

  private ws2812DataPin(part: CircuitPartInstance, topology: ReturnType<typeof buildElectricalTopology>) {
    const dataNet = topology.terminalToNet[terminalId(part.instanceId, 'DIN')]
    if (!dataNet) return null
    const directPin = this.boardPinOnNet(topology, dataNet)
    if (directPin !== null) return directPin
    for (const resistor of this.design.parts.filter((candidate) => candidate.type === 'resistor')) {
      const firstNet = topology.terminalToNet[terminalId(resistor.instanceId, '1')]
      const secondNet = topology.terminalToNet[terminalId(resistor.instanceId, '2')]
      const oppositeNet = firstNet === dataNet ? secondNet : secondNet === dataNet ? firstNet : null
      if (!oppositeNet) continue
      const pin = this.boardPinOnNet(topology, oppositeNet)
      if (pin !== null) return pin
    }
    return null
  }

  private refreshWs2812Connections() {
    const topology = buildElectricalTopology(this.design)
    const nextPins = new Map<string, number>()
    for (const part of this.design.parts.filter((candidate) => candidate.type === 'ws2812b')) {
      const pin = this.ws2812DataPin(part, topology)
      if (pin === null) continue
      nextPins.set(part.instanceId, pin)
      if (this.ws2812PinByPart.get(part.instanceId) !== pin) this.ws2812Decoders.set(part.instanceId, new Ws2812Decoder())
      else if (!this.ws2812Decoders.has(part.instanceId)) this.ws2812Decoders.set(part.instanceId, new Ws2812Decoder())
    }
    for (const partId of this.ws2812Decoders.keys()) if (!nextPins.has(partId)) this.ws2812Decoders.delete(partId)
    this.ws2812PinByPart = nextPins
    this.ws2812DataPins = new Set(nextPins.values())
  }

  private refreshUltrasonicConnections() {
    const topology = buildElectricalTopology(this.design)
    const nextConnections = new Map<string, UltrasonicConnection>()
    for (const part of this.design.parts.filter((candidate) => candidate.type === 'ultrasonic')) {
      const triggerNet = topology.terminalToNet[terminalId(part.instanceId, 'TRIG')]
      const echoNet = topology.terminalToNet[terminalId(part.instanceId, 'ECHO')]
      if (!triggerNet || !echoNet) continue
      const triggerPin = this.boardPinOnNet(topology, triggerNet)
      const echoPin = this.boardPinOnNet(topology, echoNet)
      if (triggerPin === null || echoPin === null || triggerPin === echoPin) continue
      nextConnections.set(part.instanceId, { partId: part.instanceId, triggerPin, echoPin })
    }
    this.ultrasonicConnections = nextConnections
    this.ultrasonicPulses.configure([...nextConnections.values()])
    this.updateUltrasonicEchoes()
  }

  private digitalPinPort(pin: number) {
    if (pin >= 0 && pin <= 7) return { port: this.portD, bit: pin }
    if (pin >= 8 && pin <= 13) return { port: this.portB, bit: pin - 8 }
    if (pin >= 14 && pin <= 19) return { port: this.portC, bit: pin - 14 }
    return null
  }

  private pinElectricalStates(): UnoPinElectricalState[] {
    return Array.from({ length: 20 }, (_, pin) => {
      const target = this.digitalPinPort(pin) as { port: AVRIOPort; bit: number }
      const mask = 1 << target.bit
      const output = (this.cpu.data[target.port.portConfig.DDR] & mask) !== 0
      const portHigh = (this.cpu.data[target.port.portConfig.PORT] & mask) !== 0
      return { pin, output, high: output && this.digitalPins[pin], pullup: !output && portHigh }
    })
  }

  private setDigitalInput(pin: number, value: boolean) {
    const target = this.digitalPinPort(pin)
    if (target) target.port.setPin(target.bit, value)
  }

  private pinIsOutput(pin: number) {
    const target = this.digitalPinPort(pin)
    if (!target) return false
    return (this.cpu.data[target.port.portConfig.DDR] & (1 << target.bit)) !== 0
  }

  private ultrasonicPowered(partId: string) {
    const vcc = this.electricalResult.terminalVoltages[terminalId(partId, 'VCC')] || 0
    const ground = this.electricalResult.terminalVoltages[terminalId(partId, 'GND')] || 0
    const supply = vcc - ground
    return supply >= 4.5 && supply <= 5.5
  }

  private updateUltrasonicEchoes() {
    for (const change of this.ultrasonicPulses.update(this.cpu.cycles)) {
      if (this.pinIsOutput(change.pin)) continue
      this.setDigitalInput(change.pin, change.high)
      this.digitalPins[change.pin] = change.high
    }
  }

  private updateTimedParts() {
    const activePartIds = new Set(this.design.parts.map((part) => part.instanceId))
    for (const id of [...this.partHigh.keys()]) if (!activePartIds.has(id)) this.partHigh.delete(id)
    for (const part of this.design.parts) {
      if (part.type !== 'buzzer' && part.type !== 'servo') continue
      const output = this.electricalResult.partOutputs[part.instanceId]
      if (!output) continue
      const high = output.voltage > 2.5
      const wasHigh = this.partHigh.get(part.instanceId) || false
      if (part.type === 'buzzer' && high && !wasHigh) {
        const previousCycle = this.buzzerRisingCycle.get(part.instanceId) || 0
        if (previousCycle) {
          const period = this.cpu.cycles - previousCycle
          if (period > 0) this.buzzerFrequency.set(part.instanceId, Math.round(SPEED_HZ / period))
        }
        this.buzzerRisingCycle.set(part.instanceId, this.cpu.cycles)
      }
      if (part.type === 'servo' && high && !wasHigh) this.servoHighCycle.set(part.instanceId, this.cpu.cycles)
      if (part.type === 'servo' && !high && wasHigh) {
        const started = this.servoHighCycle.get(part.instanceId) || 0
        if (started) {
          const pulseMicros = ((this.cpu.cycles - started) * 1_000_000) / SPEED_HZ
          if (pulseMicros >= 400 && pulseMicros <= 2800) {
            this.servoAngle.set(part.instanceId, Math.round(Math.max(0, Math.min(180, ((pulseMicros - 544) / 1856) * 180))))
          }
        }
      }
      this.partHigh.set(part.instanceId, high)
    }
  }

  private syncCircuit() {
    if (this.syncingCircuit) return
    this.syncingCircuit = true
    try {
      const pinStates = this.pinElectricalStates()
      this.electricalResult = solveElectricalCircuit(this.design, pinStates)
      for (const pin of pinStates) {
        if (!pin.output) {
          const ultrasonicLevel = this.ultrasonicPulses.currentLevel(pin.pin)
          this.setDigitalInput(pin.pin, ultrasonicLevel ?? Boolean(this.electricalResult.digitalInputs[pin.pin]))
        }
      }
      for (let channel = 0; channel < 6; channel += 1) {
        const voltage = this.electricalResult.analogVoltages[channel] || 0
        this.adc.channelValues[channel] = voltage
        this.analogValues[channel] = Math.round((voltage / 5) * 1023)
      }
      this.updateAllPins()
      this.updateTimedParts()
    } finally {
      this.syncingCircuit = false
    }
  }

  setDesign(design: CircuitDesign) {
    this.design = design
    this.refreshWs2812Connections()
    this.refreshUltrasonicConnections()
    this.syncCircuit()
  }

  writeSerial(text: string) {
    for (const byte of new TextEncoder().encode(text)) this.usart.writeByte(byte)
  }

  executeBatch() {
    const target = this.cpu.cycles + BATCH_CYCLES
    while (this.cpu.cycles < target) {
      this.updateUltrasonicEchoes()
      avrInstruction(this.cpu)
      this.cpu.tick()
    }
    this.updateUltrasonicEchoes()
  }

  takeSerialOutput() {
    const output = this.serialBuffer
    this.serialBuffer = ''
    return output
  }

  state(): SimulationState {
    this.syncCircuit()
    const ws2812Colors: Record<string, string[]> = {}
    for (const part of this.design.parts.filter((candidate) => candidate.type === 'ws2812b')) {
      const decoder = this.ws2812Decoders.get(part.instanceId)
      decoder?.flush(this.cpu.cycles)
      const count = Math.max(1, Math.min(60, Math.round(part.value)))
      ws2812Colors[part.instanceId] = decoder?.pixelColors(count) || Array.from({ length: count }, () => '#000000')
    }
    const partOutputs = Object.fromEntries(Object.entries(this.electricalResult.partOutputs).map(([id, output]) => {
      const lastRise = this.buzzerRisingCycle.get(id) || 0
      if (lastRise && this.cpu.cycles - lastRise > SPEED_HZ / 10) this.buzzerFrequency.set(id, 0)
      return [id, {
        ...output,
        frequency: this.buzzerFrequency.get(id) || 0,
        angle: this.servoAngle.get(id) ?? 90,
      }]
    }))
    return {
      digitalPins: [...this.digitalPins],
      analogValues: [...this.analogValues],
      cycles: this.cpu.cycles,
      virtualMillis: Math.round((this.cpu.cycles / SPEED_HZ) * 1000),
      partOutputs,
      ws2812Colors,
      terminalVoltages: { ...this.electricalResult.terminalVoltages },
      faults: [...this.electricalResult.faults],
      baudRate: Math.round(this.usart.baudRate || 0),
    }
  }
}

let simulation: UnoSimulation | null = null
let running = false
let lastStateUpdate = 0
let generation = 0
let nextBatchDeadline = 0

function post(event: WorkerEvent) {
  worker.postMessage(event)
}

function run(activeGeneration: number) {
  if (!running || !simulation || activeGeneration !== generation) return
  try {
    simulation.executeBatch()
    const output = simulation.takeSerialOutput()
    if (output) post({ type: 'serial', text: output })
    const now = performance.now()
    if (now - lastStateUpdate >= 40) {
      post({ type: 'state', state: simulation.state() })
      lastStateUpdate = now
    }
    nextBatchDeadline += BATCH_DURATION_MS
    setTimeout(() => run(activeGeneration), Math.max(0, nextBatchDeadline - performance.now()))
  } catch (error) {
    running = false
    post({ type: 'error', message: String(error instanceof Error ? error.message : error) })
  }
}

worker.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data
  if (command.type === 'start') {
    try {
      generation += 1
      simulation = new UnoSimulation(command.hex, command.design)
      running = true
      lastStateUpdate = 0
      nextBatchDeadline = performance.now()
      post({ type: 'started' })
      run(generation)
    } catch (error) {
      post({ type: 'error', message: String(error instanceof Error ? error.message : error) })
    }
  } else if (command.type === 'stop') {
    generation += 1
    running = false
    simulation = null
    post({ type: 'stopped' })
  } else if (command.type === 'design') {
    simulation?.setDesign(command.design)
  } else if (command.type === 'serial') {
    simulation?.writeSerial(command.text)
  }
}
