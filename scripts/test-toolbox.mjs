import assert from 'node:assert/strict'
import { prepareSnippet, snippets } from '../src/snippets.ts'
import { toolboxCategories, toolboxCategoryForSnippet } from '../src/toolbox.ts'

const snippetIds = snippets.map((snippet) => snippet.id).sort()
const categorizedIds = toolboxCategories.flatMap((category) => category.snippetIds).sort()

assert.equal(toolboxCategories.length, 12)
assert.deepEqual(categorizedIds, snippetIds, 'Every snippet must appear in exactly one toolbox category.')
assert.equal(new Set(categorizedIds).size, categorizedIds.length, 'Toolbox snippet ids must not be duplicated.')
assert.equal(toolboxCategoryForSnippet('digital-read')?.label, 'Input')
assert.equal(toolboxCategoryForSnippet('digital-write')?.label, 'Output')
assert.equal(toolboxCategoryForSnippet('if-else')?.label, 'Logic')
assert.equal(toolboxCategoryForSnippet('bool')?.label, 'Variables')
assert.equal(toolboxCategoryForSnippet('for')?.label, 'Loops')
assert.equal(toolboxCategoryForSnippet('serial-println')?.label, 'Serial')
assert.equal(toolboxCategoryForSnippet('ws2812-solid')?.label, 'LED Strip')
assert.equal(toolboxCategoryForSnippet('ultrasonic-distance')?.label, 'Input')

const whileSnippet = snippets.find((snippet) => snippet.id === 'while')
assert.ok(whileSnippet, 'The while loop snippet must exist.')
assert.equal(whileSnippet.scaffold, undefined, 'The while loop must not add hardware setup.')
assert.equal(whileSnippet.code, 'int count = 0;\n\nwhile (count < 5) {\n  count++;\n}')

const sketch = `void setup() {
  // Runs once
}

void loop() {
  // Repeats forever
}
`
const preparedWhile = prepareSnippet(sketch, whileSnippet, sketch.lastIndexOf('}'))
assert.doesNotMatch(preparedWhile.code, /pinMode\s*\(/, 'Dragging while loop must not modify setup with pinMode.')
assert.match(preparedWhile.code, /while \(count < 5\)/)

const servoSnippet = snippets.find((snippet) => snippet.id === 'servo-write')
assert.ok(servoSnippet, 'The Servo write snippet must exist.')
const preparedServo = prepareSnippet('', servoSnippet, 0)
assert.equal(preparedServo.code, `#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
}

void loop() {
  myServo.write(90);
}
`)
assert.ok(preparedServo.code.indexOf('#include <Servo.h>') < preparedServo.code.indexOf('Servo myServo;'))
assert.ok(preparedServo.code.indexOf('Servo myServo;') < preparedServo.code.indexOf('void setup()'))

const preparedServoInSketch = prepareSnippet(sketch, servoSnippet, sketch.lastIndexOf('}'))
assert.ok(preparedServoInSketch.code.indexOf('#include <Servo.h>') < preparedServoInSketch.code.indexOf('Servo myServo;'))
assert.ok(preparedServoInSketch.code.indexOf('Servo myServo;') < preparedServoInSketch.code.indexOf('void setup()'))
assert.match(preparedServoInSketch.code, /void setup\(\) \{\s+myServo\.attach\(9\);/)

const fastLedSnippet = snippets.find((snippet) => snippet.id === 'ws2812-solid')
assert.ok(fastLedSnippet, 'The WS2812B solid color snippet must exist.')
const preparedFastLed = prepareSnippet('', fastLedSnippet, 0)
assert.ok(preparedFastLed.code.indexOf('#include <FastLED.h>') < preparedFastLed.code.indexOf('CRGB stripLeds[LED_COUNT];'))
assert.ok(preparedFastLed.code.indexOf('CRGB stripLeds[LED_COUNT];') < preparedFastLed.code.indexOf('void setup()'))
assert.match(preparedFastLed.code, /FastLED\.addLeds<WS2812B, LED_STRIP_PIN, GRB>/)
assert.match(preparedFastLed.code, /fill_solid\(stripLeds, LED_COUNT, CRGB::Blue\);/)

const ultrasonicSnippet = snippets.find((snippet) => snippet.id === 'ultrasonic-distance')
assert.ok(ultrasonicSnippet, 'The HC-SR04 distance snippet must exist.')
const preparedUltrasonic = prepareSnippet('', ultrasonicSnippet, 0)
assert.match(preparedUltrasonic.code, /#include <StudioSonar\.h>/)
assert.match(preparedUltrasonic.code, /const int trigPin = 7;/)
assert.match(preparedUltrasonic.code, /const int echoPin = 6;/)
assert.match(preparedUltrasonic.code, /int distance = sonar\.ping\(trigPin, echoPin\);/)
assert.match(preparedUltrasonic.code, /void setup\(\) \{\n\}/)
assert.doesNotMatch(preparedUltrasonic.code, /Serial|delay|pinMode|digitalWrite|pulseIn/)

console.log('Toolbox category tests passed: 28 commands across 12 child-friendly categories.')
