import assert from 'node:assert/strict'
import {
  addCircuitPart,
  createCircuitWire,
  removeCircuitPart,
  resetCircuitDesign,
} from '../src/circuit.ts'

let design = { parts: [], wires: [] }
design = addCircuitPart(design, 'led')
design = addCircuitPart(design, 'led')
design = addCircuitPart(design, 'button')
design = addCircuitPart(design, 'breadboard')
design = addCircuitPart(design, 'battery')
design = addCircuitPart(design, 'resistor')
design = addCircuitPart(design, 'ws2812b')

assert.deepEqual(design.parts.map((part) => part.instanceId), ['led-1', 'led-2', 'button-1', 'breadboard-1', 'battery-1', 'resistor-1', 'ws2812b-1'])
assert.equal(new Set(design.parts.map((part) => `${part.position.x},${part.position.y}`)).size, design.parts.length)
assert.equal(design.wires.some((wire) => wire.from === 'led-1:A' && wire.to === 'uno:D13'), true)
assert.equal(design.wires.some((wire) => wire.from === 'led-2:A' && wire.to === 'uno:D12'), true)
assert.equal(design.wires.some((wire) => wire.from === 'battery-1:+'), false)
assert.equal(design.wires.some((wire) => wire.from === 'ws2812b-1:DIN' && wire.to === 'uno:D6'), true)
assert.equal(design.wires.some((wire) => wire.from === 'ws2812b-1:VCC' && wire.to === 'uno:5V'), true)
assert.equal(design.wires.some((wire) => wire.from === 'ws2812b-1:GND' && wire.to.startsWith('uno:GND')), true)
assert.equal(design.parts.find((part) => part.type === 'ws2812b')?.value, 8)

const freeWire = createCircuitWire(design.wires, 'battery-1:+', 'breadboard-1:top+1', '#e54848')
design = { ...design, wires: [...design.wires, freeWire] }
assert.equal(freeWire.wireId.startsWith('wire-'), true)

const withoutFirstLed = removeCircuitPart(design, 'led-1')
assert.equal(withoutFirstLed.parts.some((part) => part.instanceId === 'led-1'), false)
assert.equal(withoutFirstLed.wires.some((wire) => wire.from.startsWith('led-1:') || wire.to.startsWith('led-1:')), false)

const reset = resetCircuitDesign(design)
assert.deepEqual(reset.parts.map((part) => part.instanceId), design.parts.map((part) => part.instanceId))
assert.equal(reset.wires.some((wire) => wire.from === 'battery-1:+'), false)
assert.equal(reset.parts.find((part) => part.type === 'battery')?.voltage, 9)
assert.equal(reset.parts.find((part) => part.type === 'ws2812b')?.value, 8)

let ultrasonicDesign = { parts: [], wires: [] }
ultrasonicDesign = addCircuitPart(ultrasonicDesign, 'ultrasonic')
assert.equal(ultrasonicDesign.parts[0].value, 100)
assert.equal(ultrasonicDesign.wires.some((wire) => wire.from === 'ultrasonic-1:TRIG' && wire.to === 'uno:D7'), true)
assert.equal(ultrasonicDesign.wires.some((wire) => wire.from === 'ultrasonic-1:ECHO' && wire.to === 'uno:D6'), true)
assert.equal(ultrasonicDesign.wires.some((wire) => wire.from === 'ultrasonic-1:VCC' && wire.to === 'uno:5V'), true)
assert.equal(ultrasonicDesign.wires.some((wire) => wire.from === 'ultrasonic-1:GND' && wire.to.startsWith('uno:GND')), true)

console.log('Circuit design tests passed: reusable parts, HC-SR04 wiring, free wires, removal, and reset are consistent.')
