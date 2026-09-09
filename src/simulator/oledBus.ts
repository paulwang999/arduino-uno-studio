import type { AVRTWI } from 'avr8js'
import { terminalId, type CircuitDesign } from '../circuit.ts'
import { buildElectricalTopology, type ElectricalFault, type ElectricalSolveResult } from '../electrical.ts'
import { Ssd1306 } from './ssd1306.ts'

export class OledBus {
  private design: CircuitDesign = { parts: [], wires: [] }
  private topology = buildElectricalTopology(this.design)
  private displays = new Map<string, Ssd1306>()
  private selected: string | null = null
  private electrical: () => ElectricalSolveResult

  constructor(twi: AVRTWI, electrical: () => ElectricalSolveResult, schedule: (callback: () => void, cycles: number) => void = (callback) => callback()) {
    this.electrical = electrical
    const complete = (callback: () => void, bits = 9) => schedule(callback, Math.max(1, Math.round(16_000_000 * bits / twi.sclFrequency)))
    twi.eventHandler = {
      start: () => { this.selected = null; complete(() => twi.completeStart(), 1) },
      stop: () => { this.selected = null; complete(() => twi.completeStop(), 1) },
      connectToSlave: (address, write) => {
        this.refreshPower()
        const matches = this.design.parts.filter((part) => part.type === 'oled' && part.value === address && this.connected(part.instanceId))
        this.selected = write && matches.length === 1 ? matches[0].instanceId : null
        if (this.selected) this.displays.get(this.selected)?.begin()
        const ack = this.selected !== null
        complete(() => twi.completeConnect(ack))
      },
      writeByte: (value) => {
        const display = this.selected && this.connected(this.selected) ? this.displays.get(this.selected) : undefined
        const ack = display ? display.write(value) : false
        complete(() => twi.completeWrite(ack))
      },
      readByte: () => complete(() => twi.completeRead(0xff)),
    }
  }

  configure(design: CircuitDesign) {
    this.design = design
    this.topology = buildElectricalTopology(design)
    const ids = new Set(design.parts.filter((part) => part.type === 'oled').map((part) => part.instanceId))
    for (const id of this.displays.keys()) if (!ids.has(id)) this.displays.delete(id)
    for (const id of ids) if (!this.displays.has(id)) this.displays.set(id, new Ssd1306())
    this.selected = null
  }

  private powered(id: string) {
    const voltages = this.electrical().terminalVoltages
    const ground = voltages[terminalId(id, 'GND')] || 0
    const supply = (voltages[terminalId(id, 'VCC')] || 0) - ground
    return supply >= 3 && supply <= 5.5 && Math.abs(ground) < 0.3
  }

  private connected(id: string) {
    const nets = this.topology.terminalToNet
    const voltages = this.electrical().terminalVoltages
    return this.powered(id)
      && nets[terminalId(id, 'SDA')] === nets['uno:A4']
      && nets[terminalId(id, 'SCL')] === nets['uno:A5']
      && nets['uno:A4'] !== nets['uno:A5']
      && (voltages[terminalId(id, 'SDA')] || 0) > 2.5
      && (voltages[terminalId(id, 'SCL')] || 0) > 2.5
  }

  private refreshPower() {
    for (const id of this.displays.keys()) if (!this.powered(id)) this.displays.set(id, new Ssd1306())
  }

  state() {
    this.refreshPower()
    const frames: Record<string, Uint8Array> = {}
    const faults: ElectricalFault[] = []
    for (const [id, display] of this.displays) {
      frames[id] = display.frame()
      const part = this.design.parts.find((item) => item.instanceId === id)!
      const peers = this.design.parts.filter((item) => item.type === 'oled' && item.value === part.value && this.connected(item.instanceId))
      const message = !this.connected(id)
        ? 'OLED needs a 3.3-5V compatible module supply, shared GND, SDA to A4 and SCL to A5. Check for shorted bus lines.'
        : peers.length > 1 ? 'OLED I2C address conflict. Use separate 0x3C / 0x3D addresses and match them in code.'
          : display.unsupportedScroll ? 'OLED hardware scrolling is not simulated. Text, graphics and software animation are supported.' : ''
      if (message) faults.push({ id: `oled-${id}`, severity: 'warning', message, partIds: [id], wireIds: [] })
    }
    return { frames, faults }
  }
}
