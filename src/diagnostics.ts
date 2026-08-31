import type { CircuitComponentId } from './circuit'

function sourceWithoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '')
}

export function codeDiagnostics(source: string) {
  const code = sourceWithoutComments(source)
  const diagnostics: string[] = []

  const writesBuiltInLed = /\bdigitalWrite\s*\(\s*LED_BUILTIN\s*,/.test(code)
  const configuresBuiltInLed = /\bpinMode\s*\(\s*LED_BUILTIN\s*,\s*OUTPUT\s*\)/.test(code)
  if (writesBuiltInLed && !configuresBuiltInLed) {
    diagnostics.push('HARDWARE WARNING: LED_BUILTIN is written but is never configured as OUTPUT. Add pinMode(LED_BUILTIN, OUTPUT); inside setup().')
  }

  const readsDigitalInput = /\bdigitalRead\s*\(/.test(code)
  const configuresAnyInput = /\bpinMode\s*\([^,]+,\s*(?:INPUT|INPUT_PULLUP)\s*\)/.test(code)
  const configuresPlainInput = /\bpinMode\s*\([^,]+,\s*INPUT\s*\)/.test(code)
  if (readsDigitalInput && !configuresAnyInput) {
    diagnostics.push('HARDWARE WARNING: A digital input is read without an input pinMode. The Circuit button connects to GND and requires INPUT_PULLUP.')
  } else if (readsDigitalInput && configuresPlainInput) {
    diagnostics.push('CIRCUIT WARNING: INPUT needs an external pull-up or pull-down resistor. The Circuit button connects to GND, so use INPUT_PULLUP for matching simulation and Uno behavior.')
  }

  const usesSerial = /\bSerial\s*\.\s*(?:available|flush|parseFloat|parseInt|peek|print|println|read|readBytes|readString|write)\b/.test(code)
  const startsSerial = /\bSerial\s*\.\s*begin\s*\(/.test(code)
  if (usesSerial && !startsSerial) {
    diagnostics.push('HARDWARE WARNING: Serial is used before Serial.begin(...). Add Serial.begin(9600); inside setup() and select the same baud rate in Hardware.')
  }

  const analogWriteCalls = code.matchAll(/\banalogWrite\s*\(\s*(\d+)\s*,/g)
  for (const match of analogWriteCalls) {
    const pin = Number(match[1])
    if (![3, 5, 6, 9, 10, 11].includes(pin)) {
      diagnostics.push(`HARDWARE WARNING: D${pin} is not a PWM pin on Arduino Uno. Use D3, D5, D6, D9, D10, or D11 with analogWrite().`)
    }
  }

  const simulationLimitations: Array<[RegExp, string]> = [
    [/(?:#\s*include\s*[<"]Wire\.h[>"]|\bWire\s*\.)/, 'I2C/Wire devices'],
    [/(?:#\s*include\s*[<"]SPI\.h[>"]|\bSPI\s*\.)/, 'external SPI devices'],
    [/(?:#\s*include\s*[<"]SD\.h[>"]|\bSD\s*\.)/, 'SD cards and files'],
    [/(?:#\s*include\s*[<"]LiquidCrystal\.h[>"]|\bLiquidCrystal\b|\blcd\s*\.)/, 'LCD display output'],
    [/(?:#\s*include\s*[<"]Stepper\.h[>"]|\bStepper\b)/, 'stepper motor motion'],
    [/(?:#\s*include\s*[<"]EEPROM\.h[>"]|\bEEPROM\s*\.)/, 'EEPROM persistence'],
    [/(?:#\s*include\s*[<"]CapacitiveSensor\.h[>"]|\bCapacitiveSensor\b)/, 'capacitive sensor input'],
  ]

  for (const [pattern, feature] of simulationLimitations) {
    if (pattern.test(code)) {
      diagnostics.push(`SIMULATION LIMITATION: ${feature} can compile and run on a connected Uno, but this peripheral is not simulated in Circuit.`)
    }
  }

  return diagnostics
}

export function circuitHardwareDiagnostics(activeComponents: CircuitComponentId[]) {
  const diagnostics: string[] = []
  if (activeComponents.includes('led')) {
    diagnostics.push('CIRCUIT WARNING: Add a 220-330 ohm series resistor to an external LED. The electrical solver does not add hidden protection and will flag excessive LED current.')
  }
  if (activeComponents.includes('servo')) {
    diagnostics.push('CIRCUIT WARNING: Power a physical servo from a suitable external 5V supply and connect its GND to Uno GND. Do not draw servo motor current directly from the Uno 5V pin.')
  }
  if (activeComponents.includes('ws2812b')) {
    diagnostics.push('CIRCUIT WARNING: Power a physical WS2812B strip from a regulated external 5V supply, share GND with the Uno, and place a 300-500 ohm resistor in series with DIN.')
  }
  return diagnostics
}
