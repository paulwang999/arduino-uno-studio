import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { addCircuitPart, createCircuitWire, updateCircuitPart } from '../src/circuit.ts'
import { solveElectricalCircuit } from '../src/electrical.ts'
import { Ssd1306 } from '../src/simulator/ssd1306.ts'
import { OledBus } from '../src/simulator/oledBus.ts'
import { oledSnippets } from '../src/oledSnippets.ts'
import { oledExamples } from '../src/oledExamples.ts'
import { prepareSnippet } from '../src/snippets.ts'

const display = new Ssd1306()
const send = (values) => { display.begin(); values.forEach((value) => assert.equal(display.write(value), true)) }
send([0, 0xaf, 0xa1, 0xc8, 0x20, 0, 0x21, 10, 11, 0x22, 1, 2])
send([0x40, 1, 2, 4, 8])
assert.equal(display.ram[138], 1)
assert.equal(display.ram[139], 2)
assert.equal(display.ram[266], 4)
assert.equal(display.ram[267], 8)
assert.ok(display.frame()[8 * 128 + 10] > 0)
send([0, 0xa7])
assert.equal(display.frame()[8 * 128 + 10], 0)
send([0, 0xae])
assert.equal(display.frame().some(Boolean), false)
send([0, 0xaf, 0xa6, 0x20, 1, 0x21, 0, 1, 0x22, 0, 1])
send([0x40, 1, 2, 3, 4])
assert.deepEqual([display.ram[0], display.ram[128], display.ram[1], display.ram[129]], [1, 2, 3, 4])
send([0, 0x20, 2, 0xb3, 0x05, 0x10])
send([0x40, 0x55])
assert.equal(display.ram[389], 0x55)
send([0x80, 0xa7, 0x80, 0xa6, 0x00, 0xaf])
assert.equal(display.write(0xa5), true)
assert.ok(display.frame().every(Boolean))
send([0, 0x26, 0, 0, 0, 7, 0, 255, 0x2f])
assert.equal(display.unsupportedScroll, true)
send([0, 0x2e])
assert.equal(display.unsupportedScroll, false)

const make = () => addCircuitPart({ parts: [], wires: [] }, 'oled')
const unwire = (design, terminal) => ({ ...design, wires: design.wires.filter((wire) => wire.from !== `oled-1:${terminal}` && wire.to !== `oled-1:${terminal}`) })
let design = make()
const pins = Array.from({ length: 20 }, (_, pin) => ({ pin, output: false, high: false, pullup: false }))
let electrical = solveElectricalCircuit(design, pins)
let ack = false
const twi = { sclFrequency: 100000, completeStart() {}, completeStop() {}, completeConnect(value) { ack = value }, completeWrite(value) { ack = value }, completeRead() {} }
const bus = new OledBus(twi, () => electrical)
const configure = (next) => { design = next; electrical = solveElectricalCircuit(design, pins); bus.configure(design); bus.state() }
const connect = (address = 60, write = true) => { twi.eventHandler.start(); twi.eventHandler.connectToSlave(address, write); return ack }
configure(design)
assert.equal(connect(), true)
assert.equal(connect(61), false)
assert.equal(connect(60, false), false)
for (const terminal of ['VCC', 'GND', 'SDA', 'SCL']) { configure(unwire(make(), terminal)); assert.equal(connect(), false, terminal) }
configure({ ...make(), wires: make().wires.map((wire) => wire.to === 'uno:A4' ? { ...wire, to: 'uno:A3' } : wire) })
assert.equal(connect(), false)
let shorted = make()
shorted.wires.push(createCircuitWire(shorted.wires, 'uno:A4', 'uno:GND.2'))
configure(shorted)
assert.equal(connect(), false)
let two = addCircuitPart(make(), 'oled')
assert.equal(two.parts[1].value, 61)
configure(two)
assert.equal(connect(60), true)
for (const value of [0, 0xaf, 0xa5]) twi.eventHandler.writeByte(value)
assert.equal(connect(61), true)
assert.ok(bus.state().frames['oled-1'].every(Boolean))
assert.equal(bus.state().frames['oled-2'].some(Boolean), false, 'OLED instances must not share RAM')
configure(updateCircuitPart(two, 'oled-2', { value: 60 }))
assert.equal(connect(), false)
assert.match(bus.state().faults.map((fault) => fault.message).join(' '), /address conflict/)
configure(make())
assert.equal(connect(), true)
for (const value of [0, 0xaf, 0xa5]) twi.eventHandler.writeByte(value)
assert.ok(bus.state().frames['oled-1'].every(Boolean))
configure(unwire(make(), 'SDA'))
assert.equal(connect(), false)
assert.ok(bus.state().frames['oled-1'].every(Boolean), 'A powered OLED retains its image after losing data')
configure(unwire(make(), 'VCC'))
assert.equal(bus.state().frames['oled-1'].some(Boolean), false)
configure(make())
assert.equal(bus.state().frames['oled-1'].some(Boolean), false)
const reversed = make()
reversed.wires = reversed.wires.map((wire) => wire.from === 'oled-1:VCC' ? { ...wire, to: 'uno:GND.2' } : wire.from === 'oled-1:GND' ? { ...wire, to: 'uno:5V' } : wire)
configure(reversed)
assert.equal(connect(), false)
assert.ok(electrical.faults.some((fault) => fault.id === 'oled-supply-oled-1'))
console.log('OLED controller and bus tests passed: addressing, pixels, inversion, power, wiring, shorts and address conflicts.')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const temp = await mkdtemp(path.join(os.tmpdir(), 'studio-oled-'))
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
const assets = await readdir(path.join(root, 'dist', 'assets'))
const workerCode = await readFile(path.join(root, 'dist', 'assets', assets.find((name) => /^avr\.worker-.*\.js$/.test(name))), 'utf8')
function simulate(hex, circuit, batches = 180) {
  let time = 0
  const queue = []
  const events = []
  const self = { postMessage: (event) => events.push(event) }
  vm.runInNewContext(workerCode, { self, performance: { now: () => time }, setTimeout: (callback) => queue.push(callback), TextEncoder, TextDecoder, console })
  self.onmessage({ data: { type: 'start', hex, design: circuit } })
  for (let i = 0; i < batches && queue.length; i++) { time += 8; queue.shift()() }
  self.onmessage({ data: { type: 'stop' } })
  assert.equal(events.some((event) => event.type === 'error'), false, JSON.stringify(events.filter((event) => event.type === 'error')))
  return { serial: events.filter((event) => event.type === 'serial').map((event) => event.text).join(''), states: events.filter((event) => event.type === 'state').map((event) => event.state) }
}
try {
  for (const [index, snippet] of oledSnippets.entries()) {
    const hex = await compile(prepareSnippet('', snippet, 0).code, `snippet${index}`)
    const result = simulate(hex, make())
    const frame = result.states.at(-1).oledFrames['oled-1']
    assert.ok(frame.filter(Boolean).length > 100, `Blank ${snippet.id}`)
    assert.ok(frame.filter(Boolean).length < 3000, `Invalid full-screen output ${snippet.id}`)
    if (index === 1) { assert.ok(frame[0]); assert.ok(frame[32 * 128 + 64]); assert.equal(frame[10 * 128 + 20], 0) }
    for (const terminal of ['VCC', 'GND', 'SDA', 'SCL']) {
      assert.equal(simulate(hex, unwire(make(), terminal), 60).states.at(-1).oledFrames['oled-1'].some(Boolean), false)
    }
    assert.equal(simulate(hex, updateCircuitPart(make(), 'oled-1', { value: 61 }), 60).states.at(-1).oledFrames['oled-1'].some(Boolean), false)
    const exampleHex = await compile(oledExamples[index].code, `example${index}`)
    const animation = simulate(exampleHex, make(), 240).states.map((state) => Buffer.from(state.oledFrames['oled-1']).toString('base64'))
    assert.ok(new Set(animation.slice(-35)).size > 1, `Animation stalled ${snippet.id}`)
    console.log(`Compiled and executed ${snippet.label} plus example; frames change and incorrect wiring stays blank.`)
  }
  const scanner = await compile('#include <Wire.h>\nvoid setup(){Serial.begin(9600);Wire.begin(); for(int a=60;a<62;a++){Wire.beginTransmission(a);Serial.println(Wire.endTransmission());}}\nvoid loop(){}', 'scanner')
  assert.match(simulate(scanner, make(), 60).serial, /0\r?\n2/)
  assert.match(simulate(scanner, two, 60).serial, /0\r?\n0/)
  assert.match(simulate(scanner, unwire(make(), 'SDA'), 60).serial, /2\r?\n2/)
  console.log('Real Wire I2C scanner ACK/NACK tests passed.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
