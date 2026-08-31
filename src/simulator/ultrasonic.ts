export type UltrasonicConnection = {
  partId: string
  triggerPin: number
  echoPin: number
}

type EchoPulse = {
  echoPin: number
  startCycle: number
  endCycle: number
}

export const ULTRASONIC_MIN_DISTANCE_CM = 2
export const ULTRASONIC_MAX_DISTANCE_CM = 400
export const ULTRASONIC_TRIGGER_MICROS = 10
export const ULTRASONIC_ECHO_MICROS_PER_CM = 58
export const ULTRASONIC_RESPONSE_DELAY_MICROS = 100

export class UltrasonicPulseScheduler {
  private readonly cyclesPerMicrosecond: number
  private triggerStartedAt = new Map<string, number>()
  private echoPinByPart = new Map<string, number>()
  private pulses = new Map<string, EchoPulse>()
  private levels = new Map<number, boolean>()
  private nextTransitionCycle = Number.NEGATIVE_INFINITY

  constructor(speedHz: number) {
    this.cyclesPerMicrosecond = speedHz / 1_000_000
  }

  configure(connections: UltrasonicConnection[]) {
    const nextPins = new Map(connections.map((connection) => [connection.partId, connection.echoPin]))
    for (const [partId, echoPin] of this.echoPinByPart) {
      if (nextPins.get(partId) === echoPin) continue
      this.triggerStartedAt.delete(partId)
      this.pulses.delete(partId)
    }
    this.echoPinByPart = nextPins
    this.nextTransitionCycle = Number.NEGATIVE_INFINITY
  }

  triggerEdge(partId: string, high: boolean, cycle: number, distanceCm: number, powered: boolean) {
    if (!this.echoPinByPart.has(partId)) return
    if (high) {
      this.triggerStartedAt.set(partId, cycle)
      return
    }

    const startedAt = this.triggerStartedAt.get(partId)
    this.triggerStartedAt.delete(partId)
    if (startedAt === undefined || !powered) return

    const triggerCycles = cycle - startedAt
    const minimumTriggerCycles = ULTRASONIC_TRIGGER_MICROS * this.cyclesPerMicrosecond
    if (triggerCycles < minimumTriggerCycles) return

    const distance = Math.max(ULTRASONIC_MIN_DISTANCE_CM, Math.min(ULTRASONIC_MAX_DISTANCE_CM, distanceCm))
    const startCycle = cycle + Math.round(ULTRASONIC_RESPONSE_DELAY_MICROS * this.cyclesPerMicrosecond)
    const echoCycles = Math.round(distance * ULTRASONIC_ECHO_MICROS_PER_CM * this.cyclesPerMicrosecond)
    this.pulses.set(partId, {
      echoPin: this.echoPinByPart.get(partId) as number,
      startCycle,
      endCycle: startCycle + echoCycles,
    })
    this.nextTransitionCycle = Math.min(this.nextTransitionCycle, cycle)
  }

  update(cycle: number) {
    if (cycle < this.nextTransitionCycle) return []
    const activePins = new Set(this.echoPinByPart.values())
    const desired = new Map<number, boolean>([...activePins].map((pin) => [pin, false]))
    let nextTransitionCycle = Number.POSITIVE_INFINITY
    for (const [partId, pulse] of this.pulses) {
      if (cycle >= pulse.endCycle) {
        this.pulses.delete(partId)
        continue
      }
      if (cycle >= pulse.startCycle) {
        desired.set(pulse.echoPin, true)
        nextTransitionCycle = Math.min(nextTransitionCycle, pulse.endCycle)
      } else {
        nextTransitionCycle = Math.min(nextTransitionCycle, pulse.startCycle)
      }
    }

    const changes: Array<{ pin: number; high: boolean }> = []
    const comparedPins = new Set([...this.levels.keys(), ...desired.keys()])
    for (const pin of comparedPins) {
      const high = desired.get(pin) || false
      if ((this.levels.get(pin) || false) !== high) changes.push({ pin, high })
    }
    this.levels = desired
    this.nextTransitionCycle = nextTransitionCycle
    return changes
  }

  currentLevel(pin: number) {
    return this.levels.has(pin) ? Boolean(this.levels.get(pin)) : undefined
  }

  scheduledPulse(partId: string) {
    const pulse = this.pulses.get(partId)
    return pulse ? { ...pulse } : null
  }
}
