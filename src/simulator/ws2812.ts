const RESET_CYCLES = 800
const MIN_DATA_HIGH_CYCLES = 2
const MAX_DATA_HIGH_CYCLES = 18
const ONE_HIGH_CYCLES = 8

function byteFromBits(bits: number[], offset: number) {
  let value = 0
  for (let index = 0; index < 8; index += 1) value = (value << 1) | bits[offset + index]
  return value
}

function colorHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export class Ws2812Decoder {
  private high = false
  private highStartedAt: number | null = null
  private lastEdgeAt = 0
  private pendingBits: number[] = []
  private colors: string[] = []

  edge(cycle: number, high: boolean) {
    if (high === this.high) return
    if (high) {
      if (cycle - this.lastEdgeAt >= RESET_CYCLES) this.latch()
      this.highStartedAt = cycle
    } else if (this.highStartedAt !== null) {
      const highCycles = cycle - this.highStartedAt
      if (highCycles >= MIN_DATA_HIGH_CYCLES && highCycles <= MAX_DATA_HIGH_CYCLES) {
        this.pendingBits.push(highCycles >= ONE_HIGH_CYCLES ? 1 : 0)
      } else {
        this.pendingBits = []
      }
      this.highStartedAt = null
    }
    this.high = high
    this.lastEdgeAt = cycle
  }

  flush(cycle: number) {
    if (!this.high && cycle - this.lastEdgeAt >= RESET_CYCLES) this.latch()
  }

  pixelColors(count: number) {
    const normalizedCount = Math.max(1, Math.min(60, Math.round(count)))
    return Array.from({ length: normalizedCount }, (_, index) => this.colors[index] || '#000000')
  }

  private latch() {
    const pixelCount = Math.floor(this.pendingBits.length / 24)
    if (pixelCount) {
      const nextColors: string[] = []
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const offset = pixel * 24
        const green = byteFromBits(this.pendingBits, offset)
        const red = byteFromBits(this.pendingBits, offset + 8)
        const blue = byteFromBits(this.pendingBits, offset + 16)
        nextColors.push(colorHex(red, green, blue))
      }
      this.colors = nextColors
    }
    this.pendingBits = []
  }
}
