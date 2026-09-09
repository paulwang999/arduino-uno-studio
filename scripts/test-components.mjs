import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { addCircuitPart, createCircuitWire, partTerminalNames, resetCircuitDesign, updateCircuitPart } from '../src/circuit.ts'
import { solveElectricalCircuit, ntcResistance } from '../src/electrical.ts'
import { componentSnippets } from '../src/componentSnippets.ts'
import { componentExamples } from '../src/componentExamples.ts'
import { prepareSnippet } from '../src/snippets.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const inputs = Array.from({ length: 20 }, (_, pin) => ({ pin, output: false, high: false, pullup: pin === 2 }))
const make = (type) => addCircuitPart({ parts: [], wires: [] }, type)
const change = (design, patch) => updateCircuitPart(design, design.parts[0].instanceId, patch)
const unwire = (design, terminal) => ({ ...design, wires: design.wires.filter((wire) => wire.from !== `${design.parts[0].instanceId}:${terminal}` && wire.to !== `${design.parts[0].instanceId}:${terminal}`) })
const solve = (design, pins = inputs) => solveElectricalCircuit(design, pins)
const near = (a, b, margin = 0.02) => assert.ok(Math.abs(a - b) < margin, `${a} differs from ${b}`)

let pir = make('pir')
assert.equal(solve(pir).digitalInputs[4], false)
pir = change(pir, { pressed: true })
assert.equal(solve(pir).digitalInputs[4], true)
near(solve(pir).terminalVoltages['pir-1:OUT'], 3.3)
assert.equal(solve(unwire(pir, 'VCC')).digitalInputs[4], false)
assert.equal(solve(unwire(pir, 'GND')).digitalInputs[4], false)
const secondPir = addCircuitPart(pir, 'pir')
assert.equal(solve(secondPir).digitalInputs[4], true)
assert.equal(solve(secondPir).digitalInputs[5], false)
const moved = { ...pir, wires: pir.wires.map((wire) => wire.to === 'uno:D4' ? { ...wire, to: 'uno:D12' } : wire) }
assert.equal(solve(moved).digitalInputs[12], true)

let ntc = make('ntc')
near(ntcResistance(25), 10000)
for (const temperature of [-20, 0, 25, 60, 100]) {
  ntc = change(ntc, { value: temperature })
  const adc = solve(ntc).analogVoltages[0] / 5 * 1023
  const resistance = 10000 * adc / (1023 - adc)
  const measured = 1 / (1 / 298.15 + Math.log(resistance / 10000) / 3950) - 273.15
  near(measured, temperature, 0.1)
}
near(solve(unwire(ntc, 'VCC')).analogVoltages[0], 0)

const slide = make('slide-switch')
assert.equal(solve(slide).digitalInputs[2], false)
assert.equal(solve(change(slide, { value: 1 })).digitalInputs[2], true)
const joystick = make('joystick')
near(solve(joystick).analogVoltages[0], 2.5)
near(solve(joystick).analogVoltages[1], 2.5)
const tilted = change(joystick, { value: 0, value2: 1023, pressed: true })
near(solve(tilted).analogVoltages[0], 0)
near(solve(tilted).analogVoltages[1], 5)
assert.equal(solve(joystick).digitalInputs[2], true)
assert.equal(solve(tilted).digitalInputs[2], false)
near(solve(unwire(joystick, 'VCC')).analogVoltages[0], 0)
assert.equal(resetCircuitDesign(tilted).parts[0].value2, 1023)

let rgb = make('rgb-led')
for (const [index, channel] of ['R', 'G', 'B'].entries()) {
  rgb = addCircuitPart(rgb, 'resistor')
  const resistor = rgb.parts.at(-1)
  rgb.wires.push(createCircuitWire(rgb.wires, `rgb-led-1:${channel}`, `${resistor.instanceId}:1`))
  rgb.wires.push(createCircuitWire(rgb.wires, `${resistor.instanceId}:2`, `uno:D${9 + index}`))
}
const redPins = inputs.map((pin) => ({ ...pin, output: [9, 10, 11].includes(pin.pin), high: pin.pin === 9 }))
const red = solve(rgb, redPins)
assert.ok(red.partOutputs['rgb-led-1'].rgb[0] > 0.7)
assert.ok(red.partOutputs['rgb-led-1'].rgb[1] < 0.01)
assert.equal(red.faults.length, 0)
assert.equal(solve(unwire(rgb, 'COM'), redPins).partOutputs['rgb-led-1'].on, false)
const unsafe = make('rgb-led')
unsafe.wires.push(createCircuitWire(unsafe.wires, 'rgb-led-1:R', 'uno:5V'))
assert.ok(solve(unsafe).faults.some((fault) => fault.id.startsWith('rgb-overcurrent')))
for (const type of ['pir', 'ntc', 'slide-switch', 'joystick', 'rgb-led']) {
  let design = make(type)
  for (let i = 0; i < 10; i++) design = addCircuitPart(design, type)
  assert.equal(new Set(design.parts.map((part) => part.instanceId)).size, 11)
  for (const part of design.parts) assert.ok(partTerminalNames(part.type).length >= 3)
}
console.log('New component electrical tests passed: real nets, power gating, independent instances, ADC, SPDT, RGB current limits.')

const temp = await mkdtemp(path.join(os.tmpdir(), 'studio-components-'))
const env = { ...process.env, ARDUINO_DIRECTORIES_DATA: path.join(runtime, 'data'), ARDUINO_DIRECTORIES_DOWNLOADS: path.join(runtime, 'downloads'), ARDUINO_DIRECTORIES_USER: path.join(runtime, 'user') }
async function compile(code, name) {
  const dir = path.join(temp, name)
  await mkdir(dir)
  await writeFile(path.join(dir, `${name}.ino`), code)
  await new Promise((resolve, reject) => {
    const child = spawn(path.join(runtime, 'bin', 'arduino-cli.exe'), ['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', dir, dir], { env, windowsHide: true })
    let log = ''
    child.stdout.on('data', (data) => { log += data })
    child.stderr.on('data', (data) => { log += data })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(log)))
  })
  return readFile(path.join(dir, `${name}.ino.hex`), 'utf8')
}

// Exercise the shipped worker bundle, including AVR instruction execution and PWM sampling.
const assets = await readdir(path.join(root, 'dist', 'assets'))
const workerCode = await readFile(path.join(root, 'dist', 'assets', assets.find((name) => /^avr\.worker-.*\.js$/.test(name))), 'utf8')
function simulate(hex, design) {
  let time = 0
  const queue = []
  const events = []
  const self = { postMessage: (event) => events.push(event) }
  vm.runInNewContext(workerCode, { self, performance: { now: () => time }, setTimeout: (callback) => queue.push(callback), TextEncoder, TextDecoder, console })
  self.onmessage({ data: { type: 'start', hex, design } })
  for (let i = 0; i < 60 && queue.length; i++) { time += 8; queue.shift()() }
  self.onmessage({ data: { type: 'stop' } })
  assert.equal(events.some((event) => event.type === 'error'), false, JSON.stringify(events.filter((event) => event.type === 'error')))
  return { serial: events.filter((event) => event.type === 'serial').map((event) => event.text).join(''), states: events.filter((event) => event.type === 'state').map((event) => event.state) }
}
try {
  const designs = [pir, change(make('ntc'), { value: 25 }), change(slide, { value: 1 }), tilted, rgb]
  for (const [i, snippet] of componentSnippets.entries()) {
    const prepared = prepareSnippet('', snippet, 0)
    const hex = await compile(prepared.code, `snippet${i}`)
    const result = simulate(hex, designs[i])
    assert.ok(result.states.length > 0)
    if (snippet.id === 'rgb-color') {
      const channels = result.states.at(-1).partOutputs['rgb-led-1'].rgb
      assert.ok(channels[0] > 0.7 && channels[1] > 0.1 && channels[1] < 0.5 && channels[2] < 0.01, `Incorrect PWM color: ${channels}`)
    }
    const exampleHex = await compile(componentExamples[i].code, `example${i}`)
    const exampleResult = simulate(exampleHex, designs[i])
    if (snippet.id === 'ntc-temperature') assert.match(exampleResult.serial, /25\.\d C/)
    if (snippet.id === 'joystick-read') assert.match(exampleResult.serial, /0, 1023, 1/)
    if (snippet.id === 'pir-motion' || snippet.id === 'slide-switch-read') assert.match(exampleResult.serial, /1/)
    console.log(`Compiled and simulated ${snippet.label} snippet and example.`)
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
