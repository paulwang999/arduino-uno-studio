import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  avrInstruction,
  adcConfig,
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js'
import { Ws2812Decoder } from '../src/simulator/ws2812.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const executable = path.join(runtime, 'bin', 'arduino-cli.exe')
const temp = path.join(os.tmpdir(), `arduino-uno-simulation-${Date.now()}`)
const env = {
  ...process.env,
  ARDUINO_DIRECTORIES_DATA: path.join(runtime, 'data'),
  ARDUINO_DIRECTORIES_DOWNLOADS: path.join(runtime, 'downloads'),
  ARDUINO_DIRECTORIES_USER: path.join(runtime, 'user'),
  ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
}

const code = `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(20);
  digitalWrite(LED_BUILTIN, LOW);
  delay(20);
}
`

const missingPinModeCode = `void setup() {
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(20);
  digitalWrite(LED_BUILTIN, LOW);
  delay(20);
}
`

const buttonCode = `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(2, INPUT_PULLUP);
}

void loop() {
  digitalWrite(LED_BUILTIN, digitalRead(2) == LOW ? HIGH : LOW);
}
`

const analogSerialCode = `void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));
  delay(50);
}
`

const timerOutputsCode = `#include <Servo.h>

Servo testServo;

void setup() {
  testServo.attach(9);
  testServo.write(90);
  tone(8, 440);
}

void loop() {
}
`

const fastLedCode = `#include <FastLED.h>

#define DATA_PIN 6
#define NUM_LEDS 3

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  leds[0] = CRGB::Red;
  leds[1] = CRGB(0, 255, 0);
  leds[2] = CRGB::Blue;
  FastLED.show();
}

void loop() {
}
`

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (exitCode) => exitCode === 0 ? resolve() : reject(new Error(`Compile failed (${exitCode})`)))
  })
}

function loadIntelHex(source, target) {
  let upperAddress = 0
  for (const line of source.trim().split(/\r?\n/)) {
    const bytes = new Uint8Array((line.length - 1) / 2)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(line.slice(index * 2 + 1, index * 2 + 3), 16)
    }
    const count = bytes[0]
    const address = (bytes[1] << 8) | bytes[2]
    const type = bytes[3]
    if (type === 0) target.set(bytes.subarray(4, 4 + count), upperAddress + address)
    if (type === 4) upperAddress = (((bytes[4] << 8) | bytes[5]) << 16) >>> 0
    if (type === 1) break
  }
}

async function compileSketch(name, source) {
  const sketch = path.join(temp, name)
  const output = path.join(temp, `${name}-output`)
  await Promise.all([mkdir(sketch, { recursive: true }), mkdir(output, { recursive: true })])
  await writeFile(path.join(sketch, `${name}.ino`), source, 'utf8')
  await run(['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', output, sketch])
  return readFile(path.join(output, `${name}.ino.hex`), 'utf8')
}

function observeD13Transitions(hex) {
  const program = new Uint16Array(0x8000)
  loadIntelHex(hex, new Uint8Array(program.buffer))
  const cpu = new CPU(program)
  new AVRTimer(cpu, timer0Config)
  new AVRTimer(cpu, timer1Config)
  new AVRTimer(cpu, timer2Config)
  const portB = new AVRIOPort(cpu, portBConfig)
  new AVRIOPort(cpu, portCConfig)
  new AVRIOPort(cpu, portDConfig)

  const ledTransitions = []
  let previous = portB.pinState(5) === PinState.High
  portB.addListener(() => {
    const next = portB.pinState(5) === PinState.High
    if (next !== previous) ledTransitions.push({ cycle: cpu.cycles, high: next })
    previous = next
  })

  while (cpu.cycles < 2_500_000 && ledTransitions.length < 4) {
    avrInstruction(cpu)
    cpu.tick()
  }
  return { ledTransitions, cycles: cpu.cycles }
}

function runCycles(cpu, count) {
  const target = cpu.cycles + count
  while (cpu.cycles < target) {
    avrInstruction(cpu)
    cpu.tick()
  }
}

function observePullupButton(hex) {
  const program = new Uint16Array(0x8000)
  loadIntelHex(hex, new Uint8Array(program.buffer))
  const cpu = new CPU(program)
  new AVRTimer(cpu, timer0Config)
  new AVRTimer(cpu, timer1Config)
  new AVRTimer(cpu, timer2Config)
  const portB = new AVRIOPort(cpu, portBConfig)
  new AVRIOPort(cpu, portCConfig)
  const portD = new AVRIOPort(cpu, portDConfig)
  let pressed = false
  let inputHigh = null

  const syncButton = () => {
    const mask = 1 << 2
    const isInput = (cpu.data[portDConfig.DDR] & mask) === 0
    const pullupEnabled = (cpu.data[portDConfig.PORT] & mask) !== 0
    const nextHigh = !pressed && isInput && pullupEnabled
    if (nextHigh === inputHigh) return
    inputHigh = nextHigh
    portD.setPin(2, nextHigh)
  }
  portD.addListener(syncButton)
  syncButton()

  runCycles(cpu, 300_000)
  const releasedLed = portB.pinState(5) === PinState.High
  pressed = true
  syncButton()
  runCycles(cpu, 100_000)
  const pressedLed = portB.pinState(5) === PinState.High
  pressed = false
  syncButton()
  runCycles(cpu, 100_000)
  const releasedAgainLed = portB.pinState(5) === PinState.High
  return { releasedLed, pressedLed, releasedAgainLed }
}

function observeAnalogSerial(hex) {
  const program = new Uint16Array(0x8000)
  loadIntelHex(hex, new Uint8Array(program.buffer))
  const cpu = new CPU(program)
  new AVRTimer(cpu, timer0Config)
  new AVRTimer(cpu, timer1Config)
  new AVRTimer(cpu, timer2Config)
  new AVRIOPort(cpu, portBConfig)
  new AVRIOPort(cpu, portCConfig)
  new AVRIOPort(cpu, portDConfig)
  const adc = new AVRADC(cpu, adcConfig)
  const usart = new AVRUSART(cpu, usart0Config, 16_000_000)
  let output = ''
  adc.channelValues[0] = 2.5
  usart.onByteTransmit = (value) => { output += String.fromCharCode(value) }
  runCycles(cpu, 2_500_000)
  const values = output.trim().split(/\s+/).map(Number).filter(Number.isFinite)
  return { baudRate: Math.round(usart.baudRate), values }
}

function observeTimerOutputs(hex) {
  const program = new Uint16Array(0x8000)
  loadIntelHex(hex, new Uint8Array(program.buffer))
  const cpu = new CPU(program)
  new AVRTimer(cpu, timer0Config)
  new AVRTimer(cpu, timer1Config)
  new AVRTimer(cpu, timer2Config)
  const portB = new AVRIOPort(cpu, portBConfig)
  new AVRIOPort(cpu, portCConfig)
  new AVRIOPort(cpu, portDConfig)
  const toneRisingCycles = []
  const servoPulseMicros = []
  let toneHigh = false
  let servoHigh = false
  let servoStartedAt = 0

  portB.addListener(() => {
    const nextToneHigh = portB.pinState(0) === PinState.High
    const nextServoHigh = portB.pinState(1) === PinState.High
    if (nextToneHigh && !toneHigh) toneRisingCycles.push(cpu.cycles)
    if (nextServoHigh && !servoHigh) servoStartedAt = cpu.cycles
    if (!nextServoHigh && servoHigh && servoStartedAt) {
      servoPulseMicros.push(((cpu.cycles - servoStartedAt) * 1_000_000) / 16_000_000)
    }
    toneHigh = nextToneHigh
    servoHigh = nextServoHigh
  })

  runCycles(cpu, 1_500_000)
  const tonePeriods = toneRisingCycles.slice(1).map((cycle, index) => cycle - toneRisingCycles[index])
  const toneHz = tonePeriods.length ? 16_000_000 / (tonePeriods.reduce((sum, period) => sum + period, 0) / tonePeriods.length) : 0
  const servoPulse = servoPulseMicros.find((pulse) => pulse >= 400 && pulse <= 2800) || 0
  return { toneHz, servoPulse }
}

function observeFastLed(hex) {
  const program = new Uint16Array(0x8000)
  loadIntelHex(hex, new Uint8Array(program.buffer))
  const cpu = new CPU(program)
  new AVRTimer(cpu, timer0Config)
  new AVRTimer(cpu, timer1Config)
  new AVRTimer(cpu, timer2Config)
  new AVRIOPort(cpu, portBConfig)
  new AVRIOPort(cpu, portCConfig)
  const portD = new AVRIOPort(cpu, portDConfig)
  const decoder = new Ws2812Decoder()
  let high = false

  portD.addListener(() => {
    const next = portD.pinState(6) === PinState.High
    if (next !== high) decoder.edge(cpu.cycles, next)
    high = next
  })

  runCycles(cpu, 500_000)
  decoder.flush(cpu.cycles)
  return decoder.pixelColors(3)
}

try {
  const hex = await compileSketch('SimulationTest', code)
  const { ledTransitions } = observeD13Transitions(hex)

  if (ledTransitions.length < 4 || !ledTransitions.some((item) => item.high) || !ledTransitions.some((item) => !item.high)) {
    throw new Error(`Expected D13 HIGH/LOW transitions, observed ${JSON.stringify(ledTransitions)}`)
  }

  const missingPinModeHex = await compileSketch('MissingPinModeTest', missingPinModeCode)
  const missingPinModeResult = observeD13Transitions(missingPinModeHex)
  if (missingPinModeResult.ledTransitions.length !== 0) {
    throw new Error(`D13 must not be driven without pinMode OUTPUT, observed ${JSON.stringify(missingPinModeResult.ledTransitions)}`)
  }

  const buttonHex = await compileSketch('ButtonPullupTest', buttonCode)
  const buttonResult = observePullupButton(buttonHex)
  if (buttonResult.releasedLed || !buttonResult.pressedLed || buttonResult.releasedAgainLed) {
    throw new Error(`INPUT_PULLUP button did not match the D2-to-GND circuit: ${JSON.stringify(buttonResult)}`)
  }

  const analogSerialHex = await compileSketch('AnalogSerialTest', analogSerialCode)
  const analogSerialResult = observeAnalogSerial(analogSerialHex)
  if (Math.abs(analogSerialResult.baudRate - 9600) > 50 || !analogSerialResult.values.some((value) => value >= 510 && value <= 513)) {
    throw new Error(`Analog/Serial simulation mismatch: ${JSON.stringify(analogSerialResult)}`)
  }

  const timerOutputsHex = await compileSketch('TimerOutputsTest', timerOutputsCode)
  const timerOutputsResult = observeTimerOutputs(timerOutputsHex)
  if (timerOutputsResult.toneHz < 430 || timerOutputsResult.toneHz > 450 || timerOutputsResult.servoPulse < 1400 || timerOutputsResult.servoPulse > 1550) {
    throw new Error(`Tone/Servo simulation mismatch: ${JSON.stringify(timerOutputsResult)}`)
  }

  const fastLedHex = await compileSketch('FastLedTest', fastLedCode)
  const fastLedColors = observeFastLed(fastLedHex)
  if (JSON.stringify(fastLedColors) !== JSON.stringify(['#ff0000', '#00ff00', '#0000ff'])) {
    throw new Error(`FastLED WS2812B simulation mismatch: ${JSON.stringify(fastLedColors)}`)
  }

  console.log(`Simulator tests passed: D13 output mode, D2 INPUT_PULLUP, A0 ADC, Serial, tone, servo, and FastLED WS2812B output match Uno behavior.`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
