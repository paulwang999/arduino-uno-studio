import assert from 'node:assert/strict'
import {
  addCircuitPart,
  createCircuitPart,
  createCircuitWire,
} from '../src/circuit.ts'
import { buildElectricalTopology, solveElectricalCircuit } from '../src/electrical.ts'

const pins = Array.from({ length: 20 }, (_, pin) => ({ pin, output: false, high: false, pullup: false }))
const wire = (wires, from, to) => createCircuitWire(wires, from, to)

let breadboardDesign = { parts: [], wires: [] }
breadboardDesign = addCircuitPart(breadboardDesign, 'breadboard')
const topology = buildElectricalTopology(breadboardDesign)
assert.equal(topology.terminalToNet['breadboard-1:a1'], topology.terminalToNet['breadboard-1:e1'])
assert.notEqual(topology.terminalToNet['breadboard-1:e1'], topology.terminalToNet['breadboard-1:f1'])
assert.equal(topology.terminalToNet['breadboard-1:top+1'], topology.terminalToNet['breadboard-1:top+15'])
assert.notEqual(topology.terminalToNet['breadboard-1:top+15'], topology.terminalToNet['breadboard-1:top+16'])

let batteryCircuit = { parts: [], wires: [] }
const battery = createCircuitPart('battery', batteryCircuit)
batteryCircuit.parts.push(battery)
const resistor = { ...createCircuitPart('resistor', batteryCircuit), resistance: 470 }
batteryCircuit.parts.push(resistor)
const led = createCircuitPart('led', batteryCircuit)
batteryCircuit.parts.push(led)
batteryCircuit.wires.push(wire(batteryCircuit.wires, 'battery-1:+', 'resistor-1:1'))
batteryCircuit.wires.push(wire(batteryCircuit.wires, 'resistor-1:2', 'led-1:A'))
batteryCircuit.wires.push(wire(batteryCircuit.wires, 'led-1:K', 'battery-1:-'))
const batteryResult = solveElectricalCircuit(batteryCircuit, pins)
assert.equal(batteryResult.partOutputs['led-1'].on, true)
assert.ok(batteryResult.partOutputs['led-1'].current > 0.005 && batteryResult.partOutputs['led-1'].current < 0.03)

const shortWire = wire(batteryCircuit.wires, 'battery-1:+', 'battery-1:-')
const shortResult = solveElectricalCircuit({ ...batteryCircuit, wires: [...batteryCircuit.wires, shortWire] }, pins)
assert.equal(shortResult.faults.some((fault) => fault.id === 'short-battery-1' && fault.severity === 'error'), true)

let buttonDesign = { parts: [], wires: [] }
buttonDesign = addCircuitPart(buttonDesign, 'button')
const pullupPins = pins.map((pin) => pin.pin === 2 ? { ...pin, pullup: true } : pin)
const released = solveElectricalCircuit(buttonDesign, pullupPins)
assert.equal(released.digitalInputs[2], true)
buttonDesign.parts[0].pressed = true
const pressed = solveElectricalCircuit(buttonDesign, pullupPins)
assert.equal(pressed.digitalInputs[2], false)

let potentiometerDesign = { parts: [], wires: [] }
potentiometerDesign = addCircuitPart(potentiometerDesign, 'potentiometer')
const potResult = solveElectricalCircuit(potentiometerDesign, pins)
assert.ok(potResult.analogVoltages[0] > 2.45 && potResult.analogVoltages[0] < 2.55)

let stripDesign = { parts: [], wires: [] }
stripDesign = addCircuitPart(stripDesign, 'ws2812b')
const stripResult = solveElectricalCircuit(stripDesign, pins)
const stripSupply = stripResult.terminalVoltages['ws2812b-1:VCC'] - stripResult.terminalVoltages['ws2812b-1:GND']
assert.ok(stripSupply >= 4.9)
assert.equal(stripResult.faults.some((fault) => fault.id === 'ws2812b-current-ws2812b-1' && fault.severity === 'warning'), true)

const reversedStrip = { parts: [createCircuitPart('ws2812b', { parts: [], wires: [] }), createCircuitPart('battery', { parts: [], wires: [] })], wires: [] }
reversedStrip.wires.push(wire(reversedStrip.wires, 'ws2812b-1:VCC', 'battery-1:-'))
reversedStrip.wires.push(wire(reversedStrip.wires, 'ws2812b-1:GND', 'battery-1:+'))
const reversedStripResult = solveElectricalCircuit(reversedStrip, pins)
assert.equal(reversedStripResult.faults.some((fault) => fault.id === 'ws2812b-supply-ws2812b-1' && fault.severity === 'error'), true)

let ultrasonicDesign = { parts: [], wires: [] }
ultrasonicDesign = addCircuitPart(ultrasonicDesign, 'ultrasonic')
const ultrasonicResult = solveElectricalCircuit(ultrasonicDesign, pins)
const ultrasonicSupply = ultrasonicResult.terminalVoltages['ultrasonic-1:VCC'] - ultrasonicResult.terminalVoltages['ultrasonic-1:GND']
assert.ok(ultrasonicSupply >= 4.9)
assert.equal(ultrasonicResult.partOutputs['ultrasonic-1'].on, true)
assert.equal(ultrasonicResult.faults.some((fault) => fault.id === 'ultrasonic-supply-ultrasonic-1'), false)

const performanceDesign = { parts: [...breadboardDesign.parts, ...batteryCircuit.parts], wires: [...batteryCircuit.wires] }
const performanceStarted = performance.now()
for (let iteration = 0; iteration < 100; iteration += 1) solveElectricalCircuit(performanceDesign, pins)
const performanceElapsed = performance.now() - performanceStarted
assert.ok(performanceElapsed < 3000, `100 electrical solves took ${Math.round(performanceElapsed)}ms`)

console.log(`Electrical tests passed: topology, DC current, faults, INPUT_PULLUP, ADC, WS2812B and HC-SR04 power, and 100 breadboard solves (${Math.round(performanceElapsed)}ms).`)
