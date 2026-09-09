import type { CircuitDesign } from '../circuit'
import type { ElectricalFault, ElectricalPartOutput } from '../electrical'

export type SimulationState = {
  digitalPins: boolean[]
  analogValues: number[]
  cycles: number
  virtualMillis: number
  partOutputs: Record<string, ElectricalPartOutput>
  ws2812Colors: Record<string, string[]>
  oledFrames?: Record<string, Uint8Array>
  terminalVoltages: Record<string, number>
  faults: ElectricalFault[]
  baudRate: number
}

export type WorkerCommand =
  | { type: 'start'; hex: string; design: CircuitDesign }
  | { type: 'stop' }
  | { type: 'design'; design: CircuitDesign }
  | { type: 'serial'; text: string }

export type WorkerEvent =
  | { type: 'state'; state: SimulationState }
  | { type: 'serial'; text: string }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string }
