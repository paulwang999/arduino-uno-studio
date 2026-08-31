import assert from 'node:assert/strict'
import { Ws2812Decoder } from '../src/simulator/ws2812.ts'

function sendByte(decoder, value, timing) {
  for (let bit = 7; bit >= 0; bit -= 1) {
    decoder.edge(timing.cycle, true)
    timing.cycle += value & (1 << bit) ? 10 : 5
    decoder.edge(timing.cycle, false)
    timing.cycle += value & (1 << bit) ? 10 : 15
  }
}

const decoder = new Ws2812Decoder()
const timing = { cycle: 1000 }

for (const byte of [0, 255, 0, 255, 0, 0, 0, 0, 255]) sendByte(decoder, byte, timing)
timing.cycle += 1000
decoder.flush(timing.cycle)

assert.deepEqual(decoder.pixelColors(3), ['#ff0000', '#00ff00', '#0000ff'])
assert.deepEqual(decoder.pixelColors(5), ['#ff0000', '#00ff00', '#0000ff', '#000000', '#000000'])
assert.equal(decoder.pixelColors(100).length, 60)

console.log('WS2812B decoder tests passed: timing, GRB color order, blank pixels, and display limit are correct.')
