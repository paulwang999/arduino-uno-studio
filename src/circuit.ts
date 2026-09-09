export type CircuitPartType =
  | 'led'
  | 'button'
  | 'potentiometer'
  | 'photoresistor'
  | 'ultrasonic'
  | 'buzzer'
  | 'servo'
  | 'ws2812b'
  | 'resistor'
  | 'battery'
  | 'breadboard'
  | 'pir'
  | 'ntc'
  | 'slide-switch'
  | 'joystick'
  | 'rgb-led'
  | 'oled'

export type CircuitComponentType = CircuitPartType
export type CircuitComponentId = CircuitPartType
export type CircuitComponentCategory = 'Basic' | 'Sensors' | 'Outputs' | 'Prototyping' | 'Power'
export type Point = { x: number; y: number }

export type CircuitPartInstance = {
  instanceId: string
  type: CircuitPartType
  position: Point
  value: number
  value2?: number
  pressed: boolean
  resistance: number
  voltage: number
  internalResistance: number
}

export type CircuitComponentInstance = CircuitPartInstance

export type CircuitWire = {
  wireId: string
  from: string
  to: string
  color: string
  bendPoints: Point[]
}

export type CircuitDesign = {
  parts: CircuitPartInstance[]
  wires: CircuitWire[]
}

export const emptyCircuitDesign: CircuitDesign = { parts: [], wires: [] }

export const circuitComponentNames: Record<CircuitPartType, string> = {
  led: 'LED',
  button: 'Button',
  potentiometer: 'Potentiometer',
  photoresistor: 'Photoresistor',
  ultrasonic: 'HC-SR04 Ultrasonic Sensor',
  buzzer: 'Buzzer',
  servo: 'Servo',
  ws2812b: 'WS2812B LED Strip',
  resistor: 'Resistor',
  battery: 'Battery',
  breadboard: 'Breadboard',
  pir: 'PIR Motion Sensor',
  ntc: 'NTC Temperature Sensor',
  'slide-switch': 'Slide Switch',
  joystick: 'Analog Joystick',
  'rgb-led': 'RGB LED',
  oled: 'SSD1306 OLED',
}

export type CircuitComponentDefinition = {
  id: CircuitPartType
  name: string
  category: CircuitComponentCategory
  description: string
}

export const circuitComponentCatalog: CircuitComponentDefinition[] = [
  { id: 'led', name: 'LED', category: 'Basic', description: 'Polarized light output; add a series resistor' },
  { id: 'button', name: 'Pushbutton', category: 'Basic', description: 'Normally-open momentary switch' },
  { id: 'resistor', name: 'Resistor', category: 'Basic', description: 'Current-limiting resistor with adjustable value' },
  { id: 'potentiometer', name: 'Potentiometer', category: 'Sensors', description: 'Three-terminal adjustable voltage divider' },
  { id: 'photoresistor', name: 'Light sensor module', category: 'Sensors', description: 'Adjustable analog light input' },
  { id: 'ultrasonic', name: 'HC-SR04 ultrasonic sensor', category: 'Sensors', description: 'Adjustable 2-400 cm ultrasound pulse-echo distance sensor' },
  { id: 'buzzer', name: 'Buzzer', category: 'Outputs', description: 'Tone and sound output' },
  { id: 'servo', name: 'Servo', category: 'Outputs', description: 'PWM angle-controlled motor' },
  { id: 'ws2812b', name: 'WS2812B LED strip', category: 'Outputs', description: 'Individually addressable full-color LEDs' },
  { id: 'breadboard', name: 'Full breadboard', category: 'Prototyping', description: 'Connected terminal strips and split power rails' },
  { id: 'battery', name: 'Battery', category: 'Power', description: 'Adjustable DC source with polarity and internal resistance' },
  { id: 'slide-switch', name: 'Slide switch (SPDT)', category: 'Basic', description: 'Connect common terminal 2 to terminal 1 or 3' },
  { id: 'pir', name: 'PIR motion sensor', category: 'Sensors', description: '5V motion input with a 3.3V digital output' },
  { id: 'ntc', name: 'NTC temperature sensor', category: 'Sensors', description: '10K thermistor module, beta 3950, analog temperature input' },
  { id: 'joystick', name: 'Analog joystick', category: 'Sensors', description: 'Two analog axes and a normally-open select button' },
  { id: 'rgb-led', name: 'RGB LED (common cathode)', category: 'Outputs', description: 'Red, green and blue channels; add a series resistor on each channel' },
  { id: 'oled', name: 'OLED SSD1306 (128x64 I2C)', category: 'Outputs', description: 'Monochrome text and graphics; SDA A4, SCL A5; address 0x3C or 0x3D' },
]

export const circuitPartSizes: Record<CircuitPartType, { width: number; height: number }> = {
  led: { width: 138, height: 108 },
  button: { width: 138, height: 108 },
  potentiometer: { width: 138, height: 112 },
  photoresistor: { width: 138, height: 112 },
  ultrasonic: { width: 180, height: 146 },
  buzzer: { width: 138, height: 108 },
  servo: { width: 138, height: 108 },
  ws2812b: { width: 250, height: 150 },
  resistor: { width: 138, height: 108 },
  battery: { width: 138, height: 108 },
  breadboard: { width: 390, height: 232 },
  pir: { width: 170, height: 150 },
  ntc: { width: 170, height: 160 },
  'slide-switch': { width: 170, height: 130 },
  joystick: { width: 210, height: 230 },
  'rgb-led': { width: 170, height: 150 },
  oled: { width: 240, height: 212 },
}

const preferredPins: Partial<Record<CircuitPartType, string[]>> = {
  pir: ['uno:D4', 'uno:D5', 'uno:D2', 'uno:D3'],
  ntc: ['uno:A0', 'uno:A1', 'uno:A2', 'uno:A3', 'uno:A4', 'uno:A5'],
  'slide-switch': ['uno:D2', 'uno:D3', 'uno:D4', 'uno:D5'],
  joystick: ['uno:A0', 'uno:A1', 'uno:A2', 'uno:A3', 'uno:A4', 'uno:A5'],
  led: ['uno:D13', 'uno:D12', 'uno:D11', 'uno:D10', 'uno:D9', 'uno:D8', 'uno:D7', 'uno:D6', 'uno:D5', 'uno:D4', 'uno:D3', 'uno:D2'],
  button: ['uno:D2', 'uno:D3', 'uno:D4', 'uno:D5', 'uno:D6', 'uno:D7', 'uno:D8', 'uno:D9', 'uno:D10', 'uno:D11', 'uno:D12', 'uno:D13'],
  potentiometer: ['uno:A0', 'uno:A1', 'uno:A2', 'uno:A3', 'uno:A4', 'uno:A5'],
  photoresistor: ['uno:A1', 'uno:A0', 'uno:A2', 'uno:A3', 'uno:A4', 'uno:A5'],
  ultrasonic: ['uno:D7', 'uno:D6', 'uno:D5', 'uno:D4', 'uno:D3', 'uno:D2', 'uno:D8', 'uno:D9', 'uno:D10', 'uno:D11', 'uno:D12', 'uno:D13'],
  buzzer: ['uno:D8', 'uno:D9', 'uno:D10', 'uno:D11', 'uno:D6', 'uno:D5', 'uno:D3'],
  servo: ['uno:D9', 'uno:D10', 'uno:D11', 'uno:D6', 'uno:D5', 'uno:D3'],
  ws2812b: ['uno:D6', 'uno:D5', 'uno:D3', 'uno:D9', 'uno:D10', 'uno:D11', 'uno:D2', 'uno:D4', 'uno:D7', 'uno:D8'],
}

const defaultWireColors: Record<CircuitPartType, string> = {
  pir: '#36c879',
  ntc: '#ee9b38',
  'slide-switch': '#54b8df',
  joystick: '#ef78c7',
  'rgb-led': '#ffffff',
  oled: '#54b8df',
  led: '#ef615e',
  button: '#36c879',
  potentiometer: '#ee9b38',
  photoresistor: '#54b8df',
  ultrasonic: '#f2d54a',
  buzzer: '#8492ff',
  servo: '#ef78c7',
  ws2812b: '#f2d54a',
  resistor: '#f2d54a',
  battery: '#e54848',
  breadboard: '#ffffff',
}

export const boardTerminalIds = [
  ...Array.from({ length: 14 }, (_, pin) => `uno:D${pin}`),
  ...Array.from({ length: 6 }, (_, pin) => `uno:A${pin}`),
  'uno:GND.1',
  'uno:GND.2',
  'uno:GND.3',
  'uno:3.3V',
  'uno:5V',
]

export function terminalId(partId: string, terminal: string) {
  return `${partId}:${terminal}`
}

export function partTerminalNames(type: CircuitPartType): string[] {
  if (type === 'oled') return ['GND', 'VCC', 'SCL', 'SDA']
  if (type === 'pir' || type === 'ntc') return ['VCC', 'OUT', 'GND']
  if (type === 'slide-switch') return ['1', '2', '3']
  if (type === 'joystick') return ['VCC', 'HORZ', 'VERT', 'SEL', 'GND']
  if (type === 'rgb-led') return ['R', 'G', 'B', 'COM']
  if (type === 'led') return ['A', 'K']
  if (type === 'button') return ['1', '2']
  if (type === 'potentiometer' || type === 'photoresistor') return ['SIG', 'VCC', 'GND']
  if (type === 'ultrasonic') return ['VCC', 'TRIG', 'ECHO', 'GND']
  if (type === 'buzzer') return ['+', '-']
  if (type === 'servo') return ['PWM', 'VCC', 'GND']
  if (type === 'ws2812b') return ['DIN', 'VCC', 'GND']
  if (type === 'resistor') return ['1', '2']
  if (type === 'battery') return ['+', '-']
  return breadboardTerminalNames()
}

export function breadboardTerminalNames() {
  const terminals: string[] = []
  for (let column = 1; column <= 30; column += 1) {
    for (const row of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) terminals.push(`${row}${column}`)
    for (const rail of ['top+', 'top-', 'bottom+', 'bottom-']) terminals.push(`${rail}${column}`)
  }
  return terminals
}

export function allCircuitTerminalIds(design: CircuitDesign) {
  return [
    ...boardTerminalIds,
    ...design.parts.flatMap((part) => partTerminalNames(part.type).map((name) => terminalId(part.instanceId, name))),
  ]
}

export function breadboardInternalGroups(partId: string) {
  const groups: string[][] = []
  for (let column = 1; column <= 30; column += 1) {
    groups.push(['a', 'b', 'c', 'd', 'e'].map((row) => terminalId(partId, `${row}${column}`)))
    groups.push(['f', 'g', 'h', 'i', 'j'].map((row) => terminalId(partId, `${row}${column}`)))
  }
  for (const rail of ['top+', 'top-', 'bottom+', 'bottom-']) {
    groups.push(Array.from({ length: 15 }, (_, index) => terminalId(partId, `${rail}${index + 1}`)))
    groups.push(Array.from({ length: 15 }, (_, index) => terminalId(partId, `${rail}${index + 16}`)))
  }
  return groups
}

function nextInstanceNumber(type: CircuitPartType, parts: CircuitPartInstance[]) {
  const used = new Set(parts
    .filter((part) => part.type === type)
    .map((part) => Number(part.instanceId.split('-').at(-1)))
    .filter(Number.isFinite))
  let next = 1
  while (used.has(next)) next += 1
  return next
}

function rectanglesOverlap(a: Point & { width: number; height: number }, b: Point & { width: number; height: number }) {
  return a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y
}

function nextPosition(type: CircuitPartType, parts: CircuitPartInstance[]): Point {
  const size = circuitPartSizes[type]
  for (let row = 0; ; row += 1) {
    const y = 335 + row * 125
    const candidates = type === 'breadboard' ? [{ x: 20, y }] : [{ x: 22, y }, { x: 270, y }]
    for (const candidate of candidates) {
      const rectangle = { ...candidate, ...size }
      const occupied = parts.some((part) => rectanglesOverlap(rectangle, { ...part.position, ...circuitPartSizes[part.type] }))
      if (!occupied) return candidate
    }
  }
}

function nextWireId(wires: CircuitWire[]) {
  const used = new Set(wires.map((wire) => Number(wire.wireId.split('-').at(-1))).filter(Number.isFinite))
  let next = 1
  while (used.has(next)) next += 1
  return `wire-${next}`
}

export function createCircuitWire(wires: CircuitWire[], from: string, to: string, color = '#54b8df'): CircuitWire {
  return { wireId: nextWireId(wires), from, to, color, bendPoints: [] }
}

function nextDefaultBoardPin(type: CircuitPartType, design: CircuitDesign) {
  const candidates = preferredPins[type] || []
  const used = new Set(design.wires.flatMap((wire) => [wire.from, wire.to]).filter((endpoint) => endpoint.startsWith('uno:D') || endpoint.startsWith('uno:A')))
  return candidates.find((candidate) => !used.has(candidate))
}

export function createCircuitPart(type: CircuitPartType, design: CircuitDesign): CircuitPartInstance {
  return {
    instanceId: `${type}-${nextInstanceNumber(type, design.parts)}`,
    type,
    position: nextPosition(type, design.parts),
    value: type === 'oled' ? (design.parts.some((part) => part.type === 'oled' && part.value === 60) ? 61 : 60) : type === 'ntc' ? 25 : type === 'joystick' || type === 'potentiometer' ? 512 : type === 'photoresistor' ? 700 : type === 'ultrasonic' ? 100 : type === 'ws2812b' ? 8 : 0,
    ...(type === 'joystick' ? { value2: 512 } : {}),
    pressed: false,
    resistance: type === 'resistor' ? 220 : 10_000,
    voltage: type === 'battery' ? 9 : 0,
    internalResistance: type === 'battery' ? 1 : 0,
  }
}

function defaultPartWires(part: CircuitPartInstance, design: CircuitDesign) {
  const wires: CircuitWire[] = []
  const add = (terminal: string, target: string, color: string) => {
    const wire = createCircuitWire([...design.wires, ...wires], terminalId(part.instanceId, terminal), target, color)
    wires.push(wire)
  }
  const signalPin = nextDefaultBoardPin(part.type, design)
  if (part.type === 'oled') {
    add('GND', 'uno:GND.2', '#30383d')
    add('VCC', 'uno:5V', '#e54848')
    add('SDA', 'uno:A4', '#54b8df')
    add('SCL', 'uno:A5', '#f2d54a')
  } else if ((part.type === 'pir' || part.type === 'ntc') && signalPin) {
    add('OUT', signalPin, defaultWireColors[part.type])
    add('VCC', 'uno:5V', '#e54848')
    add('GND', 'uno:GND.2', '#30383d')
  } else if (part.type === 'slide-switch' && signalPin) {
    add('2', signalPin, defaultWireColors[part.type])
    add('1', 'uno:GND.2', '#30383d')
    add('3', 'uno:5V', '#e54848')
  } else if (part.type === 'joystick' && signalPin) {
    add('HORZ', signalPin, '#ee9b38')
    const verticalPin = nextDefaultBoardPin(part.type, { ...design, wires: [...design.wires, ...wires] })
    if (verticalPin) add('VERT', verticalPin, '#54b8df')
    const selectPin = nextDefaultBoardPin('button', design)
    if (selectPin) add('SEL', selectPin, '#36c879')
    add('VCC', 'uno:5V', '#e54848')
    add('GND', 'uno:GND.2', '#30383d')
  } else if (part.type === 'rgb-led') {
    add('COM', 'uno:GND.2', '#30383d')
  } else if (part.type === 'led' && signalPin) {
    add('A', signalPin, defaultWireColors.led)
    add('K', 'uno:GND.2', '#30383d')
  } else if (part.type === 'button' && signalPin) {
    add('1', signalPin, defaultWireColors.button)
    add('2', 'uno:GND.2', '#30383d')
  } else if ((part.type === 'potentiometer' || part.type === 'photoresistor') && signalPin) {
    add('SIG', signalPin, defaultWireColors[part.type])
    add('VCC', 'uno:5V', '#e54848')
    add('GND', 'uno:GND.2', '#30383d')
  } else if (part.type === 'ultrasonic' && signalPin) {
    add('TRIG', signalPin, defaultWireColors.ultrasonic)
    const echoPin = nextDefaultBoardPin(part.type, { ...design, wires: [...design.wires, ...wires] })
    if (echoPin) add('ECHO', echoPin, '#54b8df')
    add('VCC', 'uno:5V', '#e54848')
    add('GND', 'uno:GND.2', '#30383d')
  } else if (part.type === 'buzzer' && signalPin) {
    add('+', signalPin, defaultWireColors.buzzer)
    add('-', 'uno:GND.2', '#30383d')
  } else if (part.type === 'servo' && signalPin) {
    add('PWM', signalPin, defaultWireColors.servo)
    add('VCC', 'uno:5V', '#e54848')
    add('GND', 'uno:GND.2', '#30383d')
  } else if (part.type === 'ws2812b' && signalPin) {
    add('DIN', signalPin, defaultWireColors.ws2812b)
    add('VCC', 'uno:5V', '#e54848')
    add('GND', 'uno:GND.2', '#30383d')
  }
  return wires
}

export function addCircuitPart(design: CircuitDesign, type: CircuitPartType): CircuitDesign {
  const part = createCircuitPart(type, design)
  return {
    parts: [...design.parts, part],
    wires: [...design.wires, ...defaultPartWires(part, design)],
  }
}

export function removeCircuitPart(design: CircuitDesign, instanceId: string): CircuitDesign {
  const prefix = `${instanceId}:`
  return {
    parts: design.parts.filter((part) => part.instanceId !== instanceId),
    wires: design.wires.filter((wire) => !wire.from.startsWith(prefix) && !wire.to.startsWith(prefix)),
  }
}

export function resetCircuitDesign(design: CircuitDesign) {
  let reset: CircuitDesign = { parts: [], wires: [] }
  for (const original of design.parts) {
    const fresh = createCircuitPart(original.type, reset)
    const part = {
      ...fresh,
      instanceId: original.instanceId,
      value: original.value,
      value2: original.value2,
      resistance: original.resistance,
      voltage: original.voltage,
      internalResistance: original.internalResistance,
    }
    reset = {
      parts: [...reset.parts, part],
      wires: [...reset.wires, ...defaultPartWires(part, reset)],
    }
  }
  return reset
}

export function updateCircuitPart(design: CircuitDesign, instanceId: string, patch: Partial<CircuitPartInstance>): CircuitDesign {
  return {
    ...design,
    parts: design.parts.map((part) => part.instanceId === instanceId ? { ...part, ...patch } : part),
  }
}
