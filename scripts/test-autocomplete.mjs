import assert from 'node:assert/strict'
import {
  arduinoCompletionCount,
  extractArduinoSymbols,
  getArduinoCompletionCandidates,
} from '../src/arduinoAutocomplete.ts'
import { generatedArduinoHeaders, generatedArduinoKeywords } from '../src/generatedArduinoKeywords.ts'

const labels = (source, prefix, suffix = '') => getArduinoCompletionCandidates(source, prefix, suffix).map((completion) => completion.label)

assert.ok(arduinoCompletionCount > 650, `Expected a comprehensive catalog, found ${arduinoCompletionCount} completions.`)
assert.ok(generatedArduinoKeywords.length >= 490)
assert.deepEqual(generatedArduinoHeaders.includes('FastLED.h'), true)
assert.deepEqual(generatedArduinoHeaders.includes('StudioSonar.h'), true)

const globalLabels = labels('', 'pin')
assert.ok(globalLabels.includes('pinMode'))
assert.ok(globalLabels.includes('PINB'))
assert.ok(globalLabels.includes('digitalPinToInterrupt'))
assert.ok(globalLabels.includes('parseInt'))
assert.ok(globalLabels.includes('print'))
assert.ok(globalLabels.includes('pulseIn'))

const pinMode = getArduinoCompletionCandidates('', 'pin').find((completion) => completion.label === 'pinMode')
assert.equal(pinMode?.insertText, 'pinMode(${1:pin}, ${2:OUTPUT})')

const serialLabels = labels('', 'Serial.pr')
assert.deepEqual(serialLabels.filter((label) => label.startsWith('pr')), ['print', 'println'])

const sonarPing = getArduinoCompletionCandidates('#include <StudioSonar.h>', 'sonar.p').find((completion) => completion.label === 'ping')
assert.equal(sonarPing?.insertText, 'ping(${1:trigPin}, ${2:echoPin})')
assert.ok(labels('', 'PingUnit::C').includes('CENTIMETERS'))

const sketch = `#include <Servo.h>
#define SERVO_PIN 9
Servo myServo;
int sensorValue = 0;

void moveServo(int targetAngle) {
}
`
const servoLabels = labels(sketch, 'myServo.w')
assert.ok(servoLabels.includes('write'))
assert.ok(servoLabels.includes('writeMicroseconds'))
assert.equal(servoLabels.includes('println'), false)

const lcdSketch = 'LiquidCrystal lcd(12, 11, 5, 4, 3, 2);'
assert.ok(labels(lcdSketch, 'lcd.set').includes('setCursor'))

const symbols = extractArduinoSymbols(sketch)
for (const symbol of ['SERVO_PIN', 'myServo', 'sensorValue', 'moveServo', 'targetAngle']) {
  assert.ok(symbols.completions.some((completion) => completion.label === symbol), `Missing local symbol ${symbol}`)
}

const fastLedLabels = labels('#include <FastLED.h>\nCRGB leds[8];', 'CRGB::R')
assert.ok(fastLedLabels.includes('Red'))
assert.ok(fastLedLabels.includes('RoyalBlue'))
assert.ok(labels('', 'beat').includes('beatsin8'))

const includeCandidates = getArduinoCompletionCandidates('', '#include <Fa', '')
const fastLedHeader = includeCandidates.find((completion) => completion.label === 'FastLED.h')
assert.equal(fastLedHeader?.insertText, 'FastLED.h>')
const closedHeader = getArduinoCompletionCandidates('', '#include <Fa', '>').find((completion) => completion.label === 'FastLED.h')
assert.equal(closedHeader?.insertText, 'FastLED.h')
const includeDirective = getArduinoCompletionCandidates('', '#i').find((completion) => completion.label === '#include')
assert.equal(includeDirective?.insertText, '#include <${1:library.h}>')

console.log(`Autocomplete tests passed: ${arduinoCompletionCount} Arduino, C++, library, member, header, and local-symbol completions.`)
