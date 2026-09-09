// SSD1306 Rev 1.1: I2C control bytes, command decoder and 128x64 page RAM.
// Rendering is normalized to the A1/C8 orientation used by Adafruit's module.
export class Ssd1306 {
  readonly ram = new Uint8Array(1024)
  private column = 0
  private page = 0
  private columnStart = 0
  private columnEnd = 127
  private pageStart = 0
  private pageEnd = 7
  private mode = 2
  private displayOn = false
  private inverted = false
  private allOn = false
  private remap = false
  private reverseCom = false
  private startLine = 0
  private offset = 0
  private multiplex = 63
  private contrast = 127
  private command = 0
  private parameters: number[] = []
  private remaining = 0
  private controlNeeded = true
  private continuation = false
  private dataMode = false
  unsupportedScroll = false

  begin() { this.controlNeeded = true }

  write(value: number) {
    value &= 255
    if (this.controlNeeded) {
      if (value & 0x3f) return false
      this.continuation = Boolean(value & 0x80)
      this.dataMode = Boolean(value & 0x40)
      this.controlNeeded = false
      return true
    }
    if (this.dataMode) this.writeData(value)
    else this.writeCommand(value)
    this.controlNeeded = this.continuation
    return true
  }

  private writeData(value: number) {
    this.ram[(this.page & 7) * 128 + (this.column & 127)] = value
    if (this.mode === 1) {
      if (++this.page > this.pageEnd) {
        this.page = this.pageStart
        if (++this.column > this.columnEnd) this.column = this.columnStart
      }
    } else if (this.mode === 0) {
      if (++this.column > this.columnEnd) {
        this.column = this.columnStart
        if (++this.page > this.pageEnd) this.page = this.pageStart
      }
    } else this.column = (this.column + 1) & 127
  }

  private writeCommand(value: number) {
    if (this.remaining) {
      this.parameters.push(value)
      if (--this.remaining === 0) this.applyParameters()
      return
    }
    this.command = value
    this.parameters = []
    const counts: Record<number, number> = {
      0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0x8d: 1, 0xa8: 1,
      0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1,
      0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0xa3: 2,
    }
    this.remaining = counts[value] || 0
    if (this.remaining) return
    if (value <= 0x0f) this.column = (this.column & 0x70) | value
    else if (value <= 0x1f) this.column = (this.column & 15) | ((value & 7) << 4)
    else if (value >= 0x40 && value <= 0x7f) this.startLine = value & 63
    else if (value >= 0xb0 && value <= 0xb7) this.page = value & 7
    else if (value === 0xae || value === 0xaf) this.displayOn = value === 0xaf
    else if (value === 0xa4 || value === 0xa5) this.allOn = value === 0xa5
    else if (value === 0xa6 || value === 0xa7) this.inverted = value === 0xa7
    else if (value === 0xa0 || value === 0xa1) this.remap = value === 0xa1
    else if (value === 0xc0 || value === 0xc8) this.reverseCom = value === 0xc8
    else if (value === 0x2f || value === 0x2e) this.unsupportedScroll = value === 0x2f
  }

  private applyParameters() {
    const [a, b] = this.parameters
    if (this.command === 0x20) this.mode = a <= 2 ? a : 2
    if (this.command === 0x21) {
      this.columnStart = a & 127
      this.columnEnd = Math.max(this.columnStart, b & 127)
      this.column = this.columnStart
    }
    if (this.command === 0x22) {
      this.pageStart = a & 7
      this.pageEnd = Math.max(this.pageStart, b & 7)
      this.page = this.pageStart
    }
    if (this.command === 0x81) this.contrast = a
    if (this.command === 0xa8) this.multiplex = a & 63
    if (this.command === 0xd3) this.offset = a & 63
  }

  frame() {
    const pixels = new Uint8Array(128 * 64)
    if (!this.displayOn) return pixels
    for (let y = 0; y < 64; y++) {
      if (y > this.multiplex) continue
      const row = ((this.reverseCom ? y : 63 - y) + this.startLine - this.offset + 64) & 63
      for (let x = 0; x < 128; x++) {
        const column = this.remap ? x : 127 - x
        const set = Boolean(this.ram[(row >> 3) * 128 + column] & (1 << (row & 7)))
        if (this.allOn || (set !== this.inverted)) pixels[y * 128 + x] = 32 + Math.round(this.contrast * 223 / 255)
      }
    }
    return pixels
  }
}
